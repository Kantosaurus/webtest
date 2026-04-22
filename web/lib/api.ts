import type { ApiError } from './types';

export class ApiCallError extends Error {
  constructor(
    public status: number,
    public api: ApiError,
  ) {
    super(api.message);
    this.name = 'ApiCallError';
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: ApiError };
    throw new ApiCallError(
      res.status,
      body.error ?? { code: 'UNKNOWN', message: `HTTP ${res.status}` },
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
