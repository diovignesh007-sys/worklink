import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { unauthorized } from './errors.js';

export interface AccessClaims {
  sub: string;
  adm?: boolean;
  st: string; // status at issue time
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.jwtAccessSecret, {
    expiresIn: env.accessTokenTtlSeconds,
    issuer: 'worklink',
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const decoded = jwt.verify(token, env.jwtAccessSecret, { issuer: 'worklink' });
    if (typeof decoded === 'string') throw new Error('str');
    return decoded as unknown as AccessClaims;
  } catch {
    throw unauthorized('Invalid or expired session');
  }
}

// ── Refresh tokens ───────────────────────────────────────────────────────────
// Opaque 256-bit tokens; only a SHA-256 hash is stored. Rotated on every use;
// reuse of a rotated token revokes the whole family (theft detection, §7).

export function newRefreshToken(): { token: string; hash: string; familyId: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: sha256(token),
    familyId: randomUUID(),
    expiresAt: new Date(Date.now() + env.refreshTokenTtlDays * 24 * 3600 * 1000),
  };
}

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export const REFRESH_COOKIE = 'wl_rt';

export function refreshCookieOpts() {
  // Cross-site deployments (web on a different domain than the API, e.g.
  // *.onrender.com) need SameSite=None + Secure; same-site localhost dev
  // keeps Lax. Override with COOKIE_SAME_SITE=lax|none|strict.
  const sameSite = (process.env.COOKIE_SAME_SITE ?? (env.isProd ? 'none' : 'lax')) as 'lax' | 'none' | 'strict';
  return {
    httpOnly: true,
    secure: env.isProd || sameSite === 'none',
    sameSite,
    path: '/api/v1/auth',
    maxAge: env.refreshTokenTtlDays * 24 * 3600,
  };
}
