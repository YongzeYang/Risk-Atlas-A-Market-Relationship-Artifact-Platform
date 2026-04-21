import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { access, constants, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARTIFACT_FILE_NAMES,
  ARTIFACT_STORAGE_KINDS,
  MANIFEST_FORMAT,
  MATRIX_ARTIFACT_MEDIA_TYPE,
  PREVIEW_FORMAT,
  makeArtifactStoragePrefix,
  type ArtifactStorageKind,
  type ManifestV1,
  type PreviewV1
} from '../contracts/build-runs.js';
import type { LocalArtifactBundlePaths } from './local-artifact-store.js';
import { resolveArtifactRootDir, resolveLocalStorageFilePath } from './local-artifact-store.js';

const repoRootDir = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;
const MAX_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

export type ArtifactStorageReference = {
  storageKind: ArtifactStorageKind;
  storageBucket: string | null;
  storagePrefix: string;
  matrixByteSize?: bigint | number | null;
};

let sharedS3Client: S3Client | null = null;

export function resolveConfiguredArtifactStorageKind(): ArtifactStorageKind {
  const configured = (process.env.ARTIFACT_STORAGE_BACKEND ?? 'local_fs').trim() || 'local_fs';

  if ((ARTIFACT_STORAGE_KINDS as readonly string[]).includes(configured)) {
    return configured as ArtifactStorageKind;
  }

  throw new Error(
    `Unsupported ARTIFACT_STORAGE_BACKEND "${configured}". Expected one of: ${ARTIFACT_STORAGE_KINDS.join(', ')}.`
  );
}

export function resolveArtifactCacheDir(): string {
  const configured = process.env.ARTIFACT_CACHE_DIR;

  if (!configured) {
    return resolve(resolveArtifactRootDir(), 'cache');
  }

  return isAbsolute(configured) ? configured : resolve(repoRootDir, configured);
}

export function resolveS3ArtifactStoragePrefix(buildRunId: string): string {
  const basePrefix = normalizeS3Prefix(process.env.S3_ARTIFACT_PREFIX);
  const buildRunPrefix = makeArtifactStoragePrefix(buildRunId);

  return basePrefix ? `${basePrefix}/${buildRunPrefix}` : buildRunPrefix;
}

export async function uploadLocalArtifactBundleToS3(args: {
  buildRunId: string;
  localPaths: LocalArtifactBundlePaths;
}): Promise<{ storageBucket: string; storagePrefix: string }> {
  const storageBucket = resolveS3ArtifactBucket();
  const storagePrefix = resolveS3ArtifactStoragePrefix(args.buildRunId);

  await Promise.all([
    uploadFileToS3(storageBucket, storagePrefix, ARTIFACT_FILE_NAMES.matrix, args.localPaths.matrixPath, MATRIX_ARTIFACT_MEDIA_TYPE),
    uploadFileToS3(storageBucket, storagePrefix, ARTIFACT_FILE_NAMES.preview, args.localPaths.previewPath, 'application/json'),
    uploadFileToS3(storageBucket, storagePrefix, ARTIFACT_FILE_NAMES.manifest, args.localPaths.manifestPath, 'application/json')
  ]);

  return {
    storageBucket,
    storagePrefix
  };
}

export async function readPreviewArtifact(args: ArtifactStorageReference): Promise<PreviewV1> {
  if (args.storageKind === 'local_fs') {
    const previewPath = resolveLocalStorageFilePath(args.storagePrefix, ARTIFACT_FILE_NAMES.preview);
    const raw = await readFile(previewPath, 'utf8');
    const parsed = JSON.parse(raw) as PreviewV1;

    if (parsed.format !== PREVIEW_FORMAT) {
      throw new Error(`Unexpected preview format in ${previewPath}.`);
    }

    return parsed;
  }

  const parsed = await readJsonArtifactFromS3<PreviewV1>({
    storageBucket: requireStorageBucket(args),
    storagePrefix: args.storagePrefix,
    filename: ARTIFACT_FILE_NAMES.preview
  });

  if (parsed.format !== PREVIEW_FORMAT) {
    throw new Error(`Unexpected preview format in s3://${requireStorageBucket(args)}/${joinS3Key(args.storagePrefix, ARTIFACT_FILE_NAMES.preview)}.`);
  }

  return parsed;
}

export async function readManifestArtifact(args: ArtifactStorageReference): Promise<ManifestV1> {
  if (args.storageKind === 'local_fs') {
    const manifestPath = resolveLocalStorageFilePath(args.storagePrefix, ARTIFACT_FILE_NAMES.manifest);
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as ManifestV1;

    if (parsed.format !== MANIFEST_FORMAT) {
      throw new Error(`Unexpected manifest format in ${manifestPath}.`);
    }

    return parsed;
  }

  const parsed = await readJsonArtifactFromS3<ManifestV1>({
    storageBucket: requireStorageBucket(args),
    storagePrefix: args.storagePrefix,
    filename: ARTIFACT_FILE_NAMES.manifest
  });

  if (parsed.format !== MANIFEST_FORMAT) {
    throw new Error(`Unexpected manifest format in s3://${requireStorageBucket(args)}/${joinS3Key(args.storagePrefix, ARTIFACT_FILE_NAMES.manifest)}.`);
  }

  return parsed;
}

export async function ensureLocalMatrixArtifactPath(args: ArtifactStorageReference): Promise<string> {
  if (args.storageKind === 'local_fs') {
    const matrixPath = resolveLocalStorageFilePath(args.storagePrefix, ARTIFACT_FILE_NAMES.matrix);
    await access(matrixPath, constants.R_OK);
    return matrixPath;
  }

  const storageBucket = requireStorageBucket(args);
  const expectedByteSize = normalizeExpectedByteSize(args.matrixByteSize ?? null);
  const cachePath = resolve(resolveArtifactCacheDir(), args.storagePrefix, ARTIFACT_FILE_NAMES.matrix);

  if (await isValidCachedArtifact(cachePath, expectedByteSize)) {
    return cachePath;
  }

  await mkdir(dirname(cachePath), { recursive: true });

  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: storageBucket,
      Key: joinS3Key(args.storagePrefix, ARTIFACT_FILE_NAMES.matrix)
    })
  );

  if (!response.Body) {
    throw new Error(
      `S3 object body missing for s3://${storageBucket}/${joinS3Key(args.storagePrefix, ARTIFACT_FILE_NAMES.matrix)}.`
    );
  }

  const payload = await bodyToBuffer(response.Body as AsyncIterable<Uint8Array> & { transformToByteArray?: () => Promise<Uint8Array> });
  const payloadByteSize = BigInt(payload.byteLength);

  if (expectedByteSize !== null && payloadByteSize !== expectedByteSize) {
    throw new Error(
      `Downloaded matrix size mismatch for s3://${storageBucket}/${joinS3Key(args.storagePrefix, ARTIFACT_FILE_NAMES.matrix)}.`
    );
  }

  const tempPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, payload);
  await rm(cachePath, { force: true });
  await rename(tempPath, cachePath);

  return cachePath;
}

export async function createS3ArtifactDownloadUrl(args: {
  storageBucket: string | null;
  storagePrefix: string;
  objectFilename: string;
  downloadFilename: string;
  mediaType: string;
}): Promise<string> {
  const storageBucket = args.storageBucket?.trim();

  if (!storageBucket) {
    throw new Error('S3 artifact download requires a non-empty storage bucket.');
  }

  const command = new GetObjectCommand({
    Bucket: storageBucket,
    Key: joinS3Key(args.storagePrefix, args.objectFilename),
    ResponseContentDisposition: `attachment; filename="${args.downloadFilename}"`,
    ResponseContentType: args.mediaType
  });

  return getSignedUrl(getS3Client(), command, {
    expiresIn: resolveSignedUrlTtlSeconds()
  });
}

async function uploadFileToS3(
  storageBucket: string,
  storagePrefix: string,
  filename: string,
  filePath: string,
  contentType: string
): Promise<void> {
  const body = await readFile(filePath);

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: storageBucket,
      Key: joinS3Key(storagePrefix, filename),
      Body: body,
      ContentType: contentType
    })
  );
}

async function readJsonArtifactFromS3<T>(args: {
  storageBucket: string;
  storagePrefix: string;
  filename: string;
}): Promise<T> {
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: args.storageBucket,
      Key: joinS3Key(args.storagePrefix, args.filename)
    })
  );

  if (!response.Body) {
    throw new Error(
      `S3 object body missing for s3://${args.storageBucket}/${joinS3Key(args.storagePrefix, args.filename)}.`
    );
  }

  const body = await bodyToBuffer(response.Body as AsyncIterable<Uint8Array> & { transformToByteArray?: () => Promise<Uint8Array> });
  return JSON.parse(body.toString('utf8')) as T;
}

function getS3Client(): S3Client {
  if (sharedS3Client) {
    return sharedS3Client;
  }

  sharedS3Client = new S3Client({
    region: resolveS3Region()
  });

  return sharedS3Client;
}

function resolveS3Region(): string {
  const region = (process.env.AWS_REGION ?? '').trim();

  if (!region) {
    throw new Error('AWS_REGION must be set when using S3 artifact storage.');
  }

  return region;
}

function resolveS3ArtifactBucket(): string {
  const bucket = (process.env.S3_ARTIFACT_BUCKET ?? '').trim();

  if (!bucket) {
    throw new Error('S3_ARTIFACT_BUCKET must be set when using S3 artifact storage.');
  }

  return bucket;
}

function requireStorageBucket(args: ArtifactStorageReference): string {
  const bucket = args.storageBucket?.trim();

  if (!bucket) {
    throw new Error(`Artifact storageBucket is required for storageKind "${args.storageKind}".`);
  }

  return bucket;
}

function normalizeS3Prefix(value: string | undefined): string {
  return (value ?? '').trim().replace(/^\/+|\/+$/g, '');
}

function joinS3Key(...parts: string[]): string {
  return parts
    .map((part) => normalizeS3Prefix(part))
    .filter((part) => part.length > 0)
    .join('/');
}

function resolveSignedUrlTtlSeconds(): number {
  const parsed = Number(process.env.S3_SIGNED_URL_TTL_SECONDS ?? DEFAULT_SIGNED_URL_TTL_SECONDS);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }

  return Math.min(Math.floor(parsed), MAX_SIGNED_URL_TTL_SECONDS);
}

function normalizeExpectedByteSize(value: bigint | number | null): bigint | null {
  if (value === null) {
    return null;
  }

  return typeof value === 'bigint' ? value : BigInt(value);
}

async function isValidCachedArtifact(
  filePath: string,
  expectedByteSize: bigint | null
): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    const fileStats = await stat(filePath);

    if (!fileStats.isFile()) {
      return false;
    }

    if (expectedByteSize !== null && BigInt(fileStats.size) !== expectedByteSize) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function bodyToBuffer(
  body: AsyncIterable<Uint8Array> & { transformToByteArray?: () => Promise<Uint8Array> }
): Promise<Buffer> {
  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks: Buffer[] = [];

  for await (const chunk of body) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}