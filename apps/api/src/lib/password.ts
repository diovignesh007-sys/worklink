import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// argon2's types mis-declare the options union under NodeNext; require the CJS module.
const argon2 = require('argon2') as typeof import('argon2');

const ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB (OWASP baseline)
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (pw: string): Promise<string> => argon2.hash(pw, ARGON_OPTS);

export const verifyPassword = (hash: string, pw: string): Promise<boolean> =>
  argon2.verify(hash, pw).catch(() => false);
