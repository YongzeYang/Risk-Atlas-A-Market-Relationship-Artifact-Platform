import { resolveApiPath } from './config';

export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }

  const hasBody = init?.body !== undefined && init?.body !== null;
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;

  if (hasBody && !isFormData && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return headers;
}

function extractErrorMessage(statusCode: number, statusText: string, bodyText: string): string {
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText) as { message?: string };
      if (parsed.message && typeof parsed.message === 'string') {
        return parsed.message;
      }
    } catch {
      // ignore parse failure and fall back below
    }
  }

  return `${statusCode} ${statusText}`.trim();
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiPath(path), {
    ...init,
    headers: buildHeaders(init)
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractErrorMessage(response.status, response.statusText, bodyText)
    );
  }

  if (!bodyText) {
    return undefined as T;
  }

  return JSON.parse(bodyText) as T;
}