import { getDb } from '../../db/db.js';
import { jsonb } from '../../lib/jsonb.js';
import { newId } from '../../lib/ids.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { signAccessToken, newRefreshToken, sha256, REFRESH_COOKIE, refreshCookieOpts } from '../../lib/tokens.js';
import { badRequest, conflict, unauthorized } from '../../lib/errors.js';
import { challengeForIdentifier, verifyChallenge, createChallenge, type ChallengeInfo } from './otp-service.js';
import type { AuthSession, SelfUser } from '@worklink/types';
import type { FastifyReply } from 'fastify';

const IDENT_RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeIdentifier(raw: string): { email?: string; phone?: string } {
  const v = raw.trim();
  if (IDENT_RE_EMAIL.test(v)) return { email: v.toLowerCase() };
  if (/^\+[1-9]\d{6,14}$/.test(v)) return { phone: v };
  throw badRequest('Enter a valid email address or phone number in E.164 format (e.g. +919876543210)');
}

export interface UserRowView {
  id: string;
  email: string | null;
  phone: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  status: string;
  isAdmin: boolean;
  createdAt: Date;
}

/** Create user + profile + settings inside one transaction. */
export async function createUserWithProfile(input: {
  displayName: string;
  email?: string;
  phone?: string;
  password: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  isAdmin?: boolean;
}): Promise<string> {
  const db = getDb();
  const existing = await db
    .selectFrom('users')
    .select(['id'])
    .where((eb) =>
      eb.or([
        ...(input.email ? [eb('email', '=', input.email)] : []),
        ...(input.phone ? [eb('phone', '=', input.phone)] : []),
      ])
    )
    .executeTakeFirst();
  if (existing) throw conflict('An account with this email or phone already exists');

  const userId = newId();
  const passwordHash = await hashPassword(input.password);

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('users')
      .values({
        id: userId,
        email: input.email ?? null,
        phone: input.phone ?? null,
        passwordHash,
        emailVerifiedAt: input.emailVerified ? new Date() : null,
        phoneVerifiedAt: input.phoneVerified ? new Date() : null,
        status: 'ACTIVE',
        isAdmin: input.isAdmin ?? false,
      })
      .execute();

    await trx
      .insertInto('profiles')
      .values({
        userId,
        displayName: input.displayName,
        skills: jsonb([]),
        languages: jsonb(['English']),
        education: jsonb([]),
        experience: jsonb([]),
      })
      .execute();

    await trx.insertInto(      'userSettings').values({ userId }).execute();
  });

  return userId;
}

export async function findUserByIdentifier(identifier: string): Promise<UserRowView | null> {
  const db = getDb();
  const { email, phone } = normalizeIdentifier(identifier);
  const row = await db
    .selectFrom('users')
    .select([
      'users.id',
      'users.email',
      'users.phone',
      'users.emailVerifiedAt',
      'users.phoneVerifiedAt',
      'users.status',
      'users.isAdmin',
      'users.createdAt',
    ])
    .where((eb) => eb.or([...(email ? [eb('users.email', '=', email)] : []), ...(phone ? [eb('users.phone', '=', phone)] : [])]))
    .where('users.deletedAt', 'is', null)
    .executeTakeFirst();
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    emailVerifiedAt: row.emailVerifiedAt,
    phoneVerifiedAt: row.phoneVerifiedAt,
    status: row.status,
    isAdmin: row.isAdmin,
    createdAt: row.createdAt,
  };
}

export async function verifyLoginPassword(userId: string, password: string): Promise<boolean> {
  const db = getDb();
  const row = await db.selectFrom('users').select('passwordHash').where('id', '=', userId).executeTakeFirst();
  if (!row?.passwordHash) return false;
  return verifyPassword(row.passwordHash, password);
}

export async function setPassword(userId: string, newPassword: string): Promise<void> {
  const db = getDb();
  const passwordHash = await hashPassword(newPassword);
  await db.updateTable('users').set({ passwordHash, updatedAt: new Date() }).where('id', '=', userId).execute();
}

/** Generic messaging to prevent account enumeration (§5.1). */
export function genericAuthError(): Error {
  return unauthorized('Invalid credentials');
}

// ── Session issuance ─────────────────────────────────────────────────────────

export async function issueSession(
  reply: FastifyReply,
  user: { id: string; status: string; isAdmin: boolean },
  meta: { ip?: string; userAgent?: string }
): Promise<AuthSession> {
  const db = getDb();
  const accessToken = signAccessToken({ sub: user.id, st: user.status, adm: user.isAdmin || undefined });
  const rt = newRefreshToken();

  await db
    .insertInto(      'refreshTokens')
    .values({
      id: newId(),
      userId: user.id,
      tokenHash: rt.hash,
      familyId: rt.familyId,
      expiresAt: rt.expiresAt,
      userAgent: meta.userAgent ?? null,
      ip: null,
    })
    .execute();

  reply.setCookie(REFRESH_COOKIE, rt.token, refreshCookieOpts());

  const self = await buildSelfUser(user.id);
  return { accessToken, user: self };
}

/** Rotate refresh token; reuse of an already-rotated token nukes the family. */
export async function rotateRefreshToken(
  reply: FastifyReply,
  presentedToken: string,
  meta: { ip?: string; userAgent?: string }
): Promise<AuthSession> {
  const db = getDb();
  const hash = sha256(presentedToken);
  const row = await db.selectFrom(      'refreshTokens').selectAll().where('tokenHash', '=', hash).executeTakeFirst();

  if (!row) throw unauthorized('Invalid session');
  if (row.revokedAt) {
    // Token reuse detected → revoke entire family (§7)
    await db
      .updateTable(      'refreshTokens')
      .set({ revokedAt: new Date() })
      .where('familyId', '=', row.familyId)
      .execute();
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    throw unauthorized('Session expired, please log in again');
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    throw unauthorized('Session expired, please log in again');
  }

  const rt = newRefreshToken();
  const newRtId = newId();
  await db.transaction().execute(async (trx) => {
    // replacedById must be the successor row's uuid, not the token hash
    // (replaced_by_id is a uuid column — hash lives in token_hash).
    await trx.updateTable('refreshTokens').set({ revokedAt: new Date(), replacedById: newRtId }).where('id', '=', row.id).execute();
    await trx
      .insertInto('refreshTokens')
      .values({
        id: newRtId,
        userId: row.userId,
        tokenHash: rt.hash,
        familyId: row.familyId,
        expiresAt: rt.expiresAt,
        userAgent: meta.userAgent ?? null,
      })
      .execute();
  });

  reply.setCookie(REFRESH_COOKIE, rt.token, refreshCookieOpts());
  const userRow = await db.selectFrom('users').select(['id', 'status', 'isAdmin']).where('id', '=', row.userId).executeTakeFirst();
  if (!userRow || userRow.status !== 'ACTIVE') throw unauthorized('Account unavailable');
  const accessToken = signAccessToken({ sub: userRow.id, st: userRow.status, adm: userRow.isAdmin || undefined });
  const self = await buildSelfUser(userRow.id);
  return { accessToken, user: self };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const db = getDb();
  await db.updateTable(      'refreshTokens').set({ revokedAt: new Date() }).where('tokenHash', '=', sha256(token)).execute();
}

export async function revokeAllSessions(userId: string): Promise<void> {
  const db = getDb();
  await db
    .updateTable(      'refreshTokens')
    .set({ revokedAt: new Date() })
    .where((eb) => eb.and([eb('userId', '=', userId), eb('revokedAt', 'is', null)]))
    .execute();
}

export async function buildSelfUser(userId: string): Promise<SelfUser> {
  const db = getDb();
  const u = await db.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirstOrThrow();
  const p = await db.selectFrom('profiles').selectAll().where('userId', '=', userId).executeTakeFirstOrThrow();
  const s = await db.selectFrom(      'userSettings').selectAll().where('userId', '=', userId).executeTakeFirstOrThrow();

  const defaults = { inApp: {}, email: {}, push: {}, dailyDigest: true };
  const np = { ...defaults, ...((s.notificationPrefs as object | undefined) ?? {}) };

  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    emailVerified: Boolean(u.emailVerifiedAt),
    phoneVerified: Boolean(u.phoneVerifiedAt),
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    profile: {
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      coverUrl: p.coverUrl,
      bio: p.bio,
      headline: p.headline,
      dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
      gender: (p.gender as SelfUser['profile']['gender']) ?? null,
      skills: (p.skills as SelfUser['profile']['skills']) ?? [],
      languages: (p.languages as string[]) ?? [],
      education: (p.education as SelfUser['profile']['education']) ?? [],
      experience: (p.experience as SelfUser['profile']['experience']) ?? [],
      hourlyExpectationMinor: p.hourlyExpectationMinor === null ? null : Number(p.hourlyExpectationMinor),
      currency: p.currency,
      availability: p.availability as SelfUser['profile']['availability'],
      homeCity: p.homeCity,
      homeCountry: p.homeCountry,
      homeLocation: p.homeLat !== null && p.homeLng !== null ? { lat: p.homeLat, lng: p.homeLng } : null,
      contactPhone: p.contactPhone ?? u.phone,
      contactVisibility: { phone: p.phoneVisibility as 'PUBLIC', email: p.emailVisibility as 'PUBLIC' },
      isAvailableNow: p.isAvailableNow,
    },
    settings: {
      theme: s.theme as 'light',
      language: s.language,
      currency: s.currency,
      notifications: np as SelfUser['settings']['notifications'],
      privacy: { profileVisibility: p.profileVisibility as 'PUBLIC', showOnMap: p.showOnMap },
    },
  };
}

export { challengeForIdentifier, verifyChallenge, createChallenge, type ChallengeInfo };
