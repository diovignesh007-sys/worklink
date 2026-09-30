import { ERROR_CODES, type ApiErrorCode } from '@worklink/types';

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = ERROR_CODES[code];
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError('BAD_REQUEST', msg, details);
export const validationError = (msg: string, details?: unknown) => new AppError('VALIDATION_ERROR', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError('UNAUTHORIZED', msg);
export const forbidden = (msg = 'You do not have access to this resource') => new AppError('FORBIDDEN', msg);
export const notFound = (msg = 'Resource not found') => new AppError('NOT_FOUND', msg);
export const conflict = (msg: string, details?: unknown) => new AppError('CONFLICT', msg, details);
export const rateLimited = (msg = 'Too many requests, slow down') => new AppError('RATE_LIMITED', msg);

export function errorBody(code: ApiErrorCode, message: string, details?: unknown) {
  return { error: { code, message, details } };
}
