import type { ZodTypeAny, z } from 'zod';
import { validationError } from './errors.js';

export function validate<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw validationError(
      result.error.issues[0]?.message ?? 'Invalid input',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    );
  }
  return result.data;
}
