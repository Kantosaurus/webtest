export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FILE_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'SCAN_FAILED'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (msg: string, details?: unknown) => new AppError('VALIDATION_FAILED', 400, msg, details),
  unauthorized: () => new AppError('UNAUTHORIZED', 401, 'Not authenticated'),
  forbidden: () => new AppError('FORBIDDEN', 403, 'Not permitted'),
  notFound: (thing = 'Resource') => new AppError('NOT_FOUND', 404, `${thing} not found`),
  conflict: (msg: string) => new AppError('CONFLICT', 409, msg),
  tooLarge: () => new AppError('FILE_TOO_LARGE', 413, 'File exceeds 32 MB limit'),
  rateLimited: () => new AppError('RATE_LIMITED', 429, 'Too many requests'),
  scanFailed: (msg: string) => new AppError('SCAN_FAILED', 502, msg),
} as const;
