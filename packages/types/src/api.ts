/**
 * REST envelope + error contract (§8): every list endpoint returns
 * { data, meta: { nextCursor } }; every error returns
 * { error: { code, message, details? } }.
 */

export interface CursorMeta {
  nextCursor: string | null;
  total?: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: CursorMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  BAD_REQUEST: 400,
} as const;

export type ApiErrorCode = keyof typeof ERROR_CODES;
