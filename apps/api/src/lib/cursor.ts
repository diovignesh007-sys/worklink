import { badRequest } from './errors.js';

/** Cursor encodes a tuple of sortable values + tie-breaker id (keyset pagination). */
export function encodeCursor(values: (string | number | null)[]): string {
  return Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): (string | number | null)[] {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed as (string | number | null)[];
  } catch {
    throw badRequest('Invalid cursor');
  }
}

/** Generic keyset "next row" predicate builder for ORDER BY <col> DESC, id DESC. */
export function keysetDesc(
  cursor: (string | number | null)[],
  colA: string,
  colB = 'id'
): string {
  // Used inside sql.raw-free raw fragments carefully; values are bound separately.
  return `(${colA} < $1 OR (${colA} = $1 AND ${colB} < $2))`;
}
