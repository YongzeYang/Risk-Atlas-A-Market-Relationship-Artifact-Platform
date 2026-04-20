// apps/web/src/lib/config.ts
function normalizeBaseUrl(value: string | undefined): string {
  if (!value) {
    return '';
  }

  return value.replace(/\/+$/, '');
}

const defaultRepositoryUrl = 'https://github.com/YongzeYang/Risk-Atlas-A-Market-Relationship-Artifact-Platform';

export const appConfig = {
  title: 'Risk Atlas HK',
  apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
  repositoryUrl: (import.meta.env.VITE_REPOSITORY_URL ?? '').trim() || defaultRepositoryUrl,
  websiteSourceUrl: defaultRepositoryUrl,
  infraRepositoryUrl: 'https://github.com/YongzeYang/bsm',
  contactEmail: 'yongze_yang@outlook.com',
  linkedInUrl: 'https://www.linkedin.com/in/yongzeyang/',
  apiDocsPath: '/docs',
  environmentLabel: import.meta.env.DEV ? 'Local Dev' : 'Deployed'
};

export function resolveApiPath(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${appConfig.apiBaseUrl}${path}`;
}