import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRootDir = resolve(scriptDir, '..');
const publicDir = resolve(webRootDir, 'public');
const outputPath = resolve(publicDir, 'sitemap.xml');
const envFilePath = resolve(webRootDir, '.env');

const STATIC_ROUTES = [
  '/',
  '/builds',
  '/series',
  '/compare',
  '/divergence',
  '/exposure',
  '/structure'
];

const envFromFile = loadSimpleEnvFile(envFilePath);
const siteUrl = normalizeSiteUrl(
  process.env.VITE_SITE_URL ?? envFromFile.VITE_SITE_URL,
  process.env.WEB_PORT ?? envFromFile.WEB_PORT
);
const today = new Date().toISOString().slice(0, 10);

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...STATIC_ROUTES.map((route) => buildUrlEntry(siteUrl, route, today)),
  '</urlset>',
  ''
].join('\n');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, xml, 'utf8');

function buildUrlEntry(siteUrl, route, lastmod) {
  const priority = route === '/' ? '1.0' : '0.7';
  const changefreq = route === '/' ? 'weekly' : 'monthly';

  return [
    '  <url>',
    `    <loc>${escapeXml(joinUrl(siteUrl, route))}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>'
  ].join('\n');
}

function joinUrl(siteUrl, route) {
  if (route === '/') {
    return `${siteUrl}/`;
  }

  return `${siteUrl}${route}`;
}

function normalizeSiteUrl(rawSiteUrl, rawWebPort) {
  const trimmed = (rawSiteUrl ?? '').trim().replace(/\/+$/, '');
  if (trimmed) {
    return trimmed;
  }

  const port = String(rawWebPort ?? '5173').trim() || '5173';
  return `http://localhost:${port}`;
}

function loadSimpleEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const pairs = {};

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      pairs[key] = value.replace(/^['"]|['"]$/g, '');
    }

    return pairs;
  } catch {
    return {};
  }
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}