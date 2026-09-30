import { randomUUID, randomInt } from 'node:crypto';

export const newId = (): string => randomUUID();
export const newTxnId = (): string => randomUUID();

/** Cryptographically random 6-digit OTP code (no leading-zero loss). */
export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
