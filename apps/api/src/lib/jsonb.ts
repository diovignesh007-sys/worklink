/**
 * Serialize a JS value for a Postgres jsonb column.
 *
 * The `pg` driver converts JS *arrays* into Postgres array-literal syntax
 * (`{"a","b"}`), which jsonb rejects — it needs real JSON (`["a","b"]`).
 * Wrapping array writes in this helper sends a JSON string instead, which
 * Postgres parses into jsonb on insert and returns as parsed JSON on read.
 * (Objects are unaffected; this is only strictly needed for arrays.)
 */
export function jsonb<T>(value: T): string {
  return JSON.stringify(value) as unknown as string;
}
