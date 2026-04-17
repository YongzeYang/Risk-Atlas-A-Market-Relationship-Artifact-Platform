import { readFile, rm, mkdir, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARTIFACT_FILE_NAMES,
  LOCAL_ARTIFACT_ROOT_DIR,
  PREVIEW_FORMAT,
  makeArtifactStoragePrefix,
  type ManifestV1,
  type PreviewV1
} from '../contracts/build-runs.js';

const repoRootDir = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));

export type LocalArtifactBundlePaths = {
  rootDir: string;
  storagePrefix: string;
  buildDir: string;
  matrixPath: string;
  previewPath: string;
  manifestPath: string;
};

export function resolveArtifactRootDir(): string {
  const configured = process.env.ARTIFACT_ROOT_DIR;

  if (!configured) {
    return resolve(repoRootDir, LOCAL_ARTIFACT_ROOT_DIR);
  }

  return isAbsolute(configured) ? configured : resolve(repoRootDir, configured);
}

export function resolveLocalStorageFilePath(storagePrefix: string, filename: string): string {
  return resolve(resolveArtifactRootDir(), storagePrefix, filename);
}

export function getLocalArtifactBundlePaths(buildRunId: string): LocalArtifactBundlePaths {
  const rootDir = resolveArtifactRootDir();
  const storagePrefix = makeArtifactStoragePrefix(buildRunId);
  const buildDir = resolve(rootDir, storagePrefix);

  return {
    rootDir,
    storagePrefix,
    buildDir,
    matrixPath: resolve(buildDir, ARTIFACT_FILE_NAMES.matrix),
    previewPath: resolve(buildDir, ARTIFACT_FILE_NAMES.preview),
    manifestPath: resolve(buildDir, ARTIFACT_FILE_NAMES.manifest)
  };
}

export async function prepareLocalArtifactBundle(
  buildRunId: string
): Promise<LocalArtifactBundlePaths> {
  const paths = getLocalArtifactBundlePaths(buildRunId);

  await rm(paths.buildDir, { recursive: true, force: true });
  await mkdir(paths.buildDir, { recursive: true });

  return paths;
}

export async function cleanupLocalArtifactBundle(buildRunId: string): Promise<void> {
  const paths = getLocalArtifactBundlePaths(buildRunId);
  await rm(paths.buildDir, { recursive: true, force: true });
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<number> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(filePath, text, 'utf8');
  return Buffer.byteLength(text, 'utf8');
}

export async function writeManifestJsonStable(
  filePath: string,
  builder: (manifestByteSize: number | null) => ManifestV1
): Promise<{ manifest: ManifestV1; byteSize: number }> {
  let previousByteSize: number | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const manifest = builder(previousByteSize);
    const text = `${JSON.stringify(manifest, null, 2)}\n`;
    const nextByteSize = Buffer.byteLength(text, 'utf8');

    if (previousByteSize !== null && nextByteSize === previousByteSize) {
      await writeFile(filePath, text, 'utf8');
      return {
        manifest,
        byteSize: nextByteSize
      };
    }

    previousByteSize = nextByteSize;
  }

  throw new Error('Failed to stabilize manifest.json byte size.');
}

export async function statFileByteSize(filePath: string): Promise<number> {
  const stats = await stat(filePath);

  if (!stats.isFile()) {
    throw new Error(`Expected a file at path: ${filePath}`);
  }

  return stats.size;
}

export async function readPreviewArtifact(
  storageKind: string,
  storagePrefix: string
): Promise<PreviewV1> {
  if (storageKind !== 'local_fs') {
    throw new Error(
      `Unsupported artifact storageKind "${storageKind}" in local preview reader.`
    );
  }

  const previewPath = resolveLocalStorageFilePath(storagePrefix, ARTIFACT_FILE_NAMES.preview);
  const raw = await readFile(previewPath, 'utf8');
  const parsed = JSON.parse(raw) as PreviewV1;

  if (parsed.format !== PREVIEW_FORMAT) {
    throw new Error(`Unexpected preview format in ${previewPath}.`);
  }

  return parsed;
}