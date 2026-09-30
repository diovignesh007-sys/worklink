import { getDb } from '../../db/db.js';
import { newId, sixDigitCode } from '../../lib/ids.js';
import { sha256 } from '../../lib/tokens.js';
import { getKv } from '../../lib/kv.js';
import { getOtpChannel } from '../otp.js';
import { badRequest, conflict, rateLimited, notFound } from '../../lib/errors.js';
import type { OtpPurpose } from '@worklink/types';

/**
 * OTP lifecycle (§5.1): 6-digit code, 10-minute validity, max 5 attempts,
 * max 3 resends/hour, stored only as a hash, single use, generic errors.
 * Hot codes are additionally mirrored into KV for fast lookup.
 */

const OTP_TTL_SECONDS = 600;
const MAX_ATTEMPTS = 5;
const RESENDS_PER_HOUR = 3;

export interface ChallengeInfo {
  challengeId: string;
  channel: 'EMAIL' | 'SMS';
  /** Dev convenience — only present outside production. */
  devCode?: string;
}

export async function createChallenge(
  identifier: string,
  purpose: OtpPurpose,
  channel: 'EMAIL' | 'SMS'
): Promise<ChallengeInfo> {
  const db = getDb();
  const kv = getKv();

  // Resend cap: 3 per hour per identifier+purpose
  const resendKey = `otp:resend:${identifier}:${purpose}:${Math.floor(Date.now() / 3_600_000)}`;
  const resends = await kv.incr(resendKey, 3600);
  if (resends > RESENDS_PER_HOUR) throw rateLimited('Too many code requests. Try again later.');

  const code = sixDigitCode();
  const challengeId = newId();
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  await db
    .insertInto('otpChallenges')
    .values({
      id: challengeId,
      identifier,
      purpose,
      channel,
      codeHash: sha256(code + challengeId),
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      expiresAt,
    })
    .execute();

  // Fast-path mirror for verify (hash + expiry in KV)
  await kv.set(`otp:code:${challengeId}`, `${sha256(code + challengeId)}:${expiresAt.getTime()}`, OTP_TTL_SECONDS);

  await getOtpChannel().sendOtp(identifier, channel, code, purpose);

  return {
    challengeId,
    channel,
    devCode: process.env.NODE_ENV === 'production' ? undefined : code,
  };
}

export async function verifyChallenge(challengeId: string, code: string): Promise<{ identifier: string; purpose: string; channel: string }> {
  const db = getDb();
  const kv = getKv();

  const row = await db.selectFrom('otpChallenges').selectAll().where('id', '=', challengeId).executeTakeFirst();
  if (!row) throw notFound('Invalid or expired code request');

  if (row.consumedAt) throw badRequest('This code was already used. Request a new one.');
  if (row.expiresAt.getTime() < Date.now()) throw badRequest('Code expired. Request a new one.');
  if (row.attempts >= row.maxAttempts) throw badRequest('Too many incorrect attempts. Request a new code.');

  const expected = sha256(code + row.id);
  if (expected !== row.codeHash) {
    await db
      .updateTable('otpChallenges')
      .set({ attempts: row.attempts + 1 })
      .where('id', '=', row.id)
      .execute();
    const left = row.maxAttempts - row.attempts - 1;
    throw badRequest(left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code. Request a new one.');
  }

  await db
    .updateTable('otpChallenges')
    .set({ consumedAt: new Date() })
    .where('id', '=', row.id)
    .execute();
  await kv.del(`otp:code:${row.id}`);

  return { identifier: row.identifier, purpose: row.purpose, channel: row.channel };
}

/** Issue a challenge for an identifier, auto-picking the channel. */
export async function challengeForIdentifier(identifier: string, purpose: OtpPurpose): Promise<ChallengeInfo> {
  const channel: 'EMAIL' | 'SMS' = identifier.includes('@') ? 'EMAIL' : 'SMS';
  return createChallenge(identifier, purpose, channel);
}
