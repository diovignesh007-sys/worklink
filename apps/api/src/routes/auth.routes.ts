import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { signupSchema, loginSchema, verifyOtpSchema, resendOtpSchema, forgotPasswordSchema, resetPasswordSchema } from '@worklink/types';
import { validate } from '../lib/validate.js';
import { AppError, badRequest, unauthorized } from '../lib/errors.js';
import { rateLimit } from '../lib/ratelimit.js';
import { getDb } from '../db/db.js';
import { REFRESH_COOKIE } from '../lib/tokens.js';
import { getKv } from '../lib/kv.js';
import {
  normalizeIdentifier,
  createUserWithProfile,
  findUserByIdentifier,
  verifyLoginPassword,
  genericAuthError,
  issueSession,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllSessions,
  buildSelfUser,
  setPassword,
} from '../services/auth/auth-service.js';
import { challengeForIdentifier, createChallenge, verifyChallenge } from '../services/auth/otp-service.js';
import { audit } from '../services/notify.js';
import { env } from '../config/env.js';

const isAutoVerify = () => process.env.WORKLINK_AUTO_VERIFY_OTP === '1';
/** @deprecated – use isAutoVerify() */
export const AUTO_VERIFY_OTP = false; // kept for any external reference; actual check is isAutoVerify()

export default async function authRoutes(app: FastifyInstance) {
  // ── Signup ────────────────────────────────────────────────────────────────
  app.post(
    '/auth/signup',
    { preHandler: rateLimit({ name: 'auth:signup', max: 10, windowSeconds: 3600 }) },
    async (req, reply) => {
      const input = validate(signupSchema, req.body);
      const email = input.email?.toLowerCase();
      const phone = input.phone;

      const userId = await createUserWithProfile({
        displayName: input.displayName,
        email,
        phone,
        password: input.password,
      });

      const identifier = email ?? phone!;
      const challenge = isAutoVerify()
        ? { challengeId: 'auto', channel: 'EMAIL' as const, devCode: '000000' }
        : await challengeForIdentifier(identifier, email ? 'EMAIL_VERIFY' : 'PHONE_VERIFY');

      // In auto-verify dev mode, stash the identifier so verify-otp can look it up
      if (isAutoVerify()) {
        await getKv().set('auto:verify:last', JSON.stringify({ identifier, purpose: email ? 'EMAIL_VERIFY' : 'PHONE_VERIFY' }), 120);
      }

      await audit(userId, 'auth.signup');
      reply.code(201);
      return { challengeId: challenge.challengeId, channel: challenge.channel, devCode: challenge.devCode };
    }
  );

  // ── Verify OTP → creates session ─────────────────────────────────────────
  app.post(
    '/auth/verify-otp',
    { preHandler: rateLimit({ name: 'auth:verify', max: 20, windowSeconds: 3600 }) },
    async (req, reply) => {
      const input = validate(verifyOtpSchema, req.body);

      let identifier: string;
      let purpose: string;
      if (isAutoVerify() && input.challengeId === 'auto') {
        // Dev-only fast path: accept the master code for the most recent challenge
        const last = await findLastChallengePurpose(input.challengeId);
        identifier = last.identifier;
        purpose = last.purpose;
      } else {
        const v = await verifyChallenge(input.challengeId, input.code);
        identifier = v.identifier;
        purpose = v.purpose;
      }

      const { email, phone } = normalizeIdentifier(identifier);
      let user = await findUserByIdentifier(identifier);

      if (!user) throw unauthorized('Account not found. Please sign up first.');

      // Mark verified
      const db = getDb();
      if (email) await db.updateTable('users').set({ emailVerifiedAt: new Date() }).where('id', '=', user.id).execute();
      if (phone) await db.updateTable('users').set({ phoneVerifiedAt: new Date() }).where('id', '=', user.id).execute();
      user = (await findUserByIdentifier(identifier))!;

      await audit(user.id, 'auth.verify_otp', 'USER', user.id);
      const session = await issueSession(reply, { id: user.id, status: user.status, isAdmin: false }, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return session;
    }
  );

  // ── Resend OTP ───────────────────────────────────────────────────────────
  app.post(
    '/auth/resend-otp',
    { preHandler: rateLimit({ name: 'auth:resend', max: 6, windowSeconds: 3600 }) },
    async (req) => {
      const input = validate(resendOtpSchema, req.body);
      const db = getDb();
      const row = await db.selectFrom('otpChallenges').selectAll().where('id', '=', input.challengeId).executeTakeFirst();
      if (!row) throw badRequest('Unknown code request');
      const challenge = await createChallenge(row.identifier, row.purpose as Parameters<typeof createChallenge>[1], row.channel as 'EMAIL' | 'SMS');
      return { challengeId: challenge.challengeId, devCode: challenge.devCode };
    }
  );

  // ── Login ────────────────────────────────────────────────────────────────
  app.post(
    '/auth/login',
    { preHandler: rateLimit({ name: 'auth:login', max: 10, windowSeconds: 900 }) },
    async (req, reply) => {
      const input = validate(loginSchema, req.body);
      const user = await findUserByIdentifier(input.identifier);
      const ok = user ? await verifyLoginPassword(user.id, input.password) : false;

      // Uniform timing/response regardless of which factor failed
      if (!ok || !user) throw genericAuthError();
      if (user.status === 'DEACTIVATED') throw unauthorized('Account deactivated');
      if (user.status === 'SUSPENDED') throw unauthorized('Account suspended');

      const session = await issueSession(reply, { id: user.id, status: user.status, isAdmin: user.isAdmin }, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      await audit(user.id, 'auth.login');
      return session;
    }
  );

  // ── Refresh (rotating, reuse-detecting) ──────────────────────────────────
  app.post('/auth/refresh', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (!token) throw unauthorized('No session');
    return rotateRefreshToken(reply, token, { ip: req.ip, userAgent: req.headers['user-agent'] });
  });

  // ── Logout / logout-all ──────────────────────────────────────────────────
  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token);
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return { ok: true };
  });

  app.post('/auth/logout-all', async (req, reply) => {
    const claims = req.auth();
    await revokeAllSessions(claims.sub);
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    await audit(claims.sub, 'auth.logout_all');
    return { ok: true };
  });

  // ── Forgot password ──────────────────────────────────────────────────────
  app.post(
    '/auth/forgot-password',
    { preHandler: rateLimit({ name: 'auth:forgot', max: 5, windowSeconds: 3600 }) },
    async (req) => {
      const input = validate(forgotPasswordSchema, req.body);
      const user = await findUserByIdentifier(input.identifier);
      // Always return success-shaped response (no enumeration)
      if (!user) return { challengeId: 'none', channel: 'EMAIL', devCode: undefined };
      const challenge = await challengeForIdentifier(
        (user.email ?? user.phone)!,
        'PASSWORD_RESET'
      );
      await audit(null, 'auth.forgot_password_requested');
      return { challengeId: challenge.challengeId, channel: challenge.channel, devCode: challenge.devCode };
    }
  );

  // ── Reset password (OTP → new password → invalidate sessions) ────────────
  app.post(
    '/auth/reset-password',
    { preHandler: rateLimit({ name: 'auth:reset', max: 10, windowSeconds: 3600 }) },
    async (req, reply) => {
      const input = validate(
        z.object({ challengeId: z.string().min(8), code: z.string().regex(/^\d{6}$/), newPassword: resetPasswordSchema.shape.newPassword }),
        req.body
      );
      const v = await verifyChallenge(input.challengeId, input.code);
      if (v.purpose !== 'PASSWORD_RESET') throw badRequest('This code was not issued for a password reset');
      const user = await findUserByIdentifier(v.identifier);
      if (!user) throw badRequest('Account not found');
      await setPassword(user.id, input.newPassword);
      await revokeAllSessions(user.id);
      await audit(user.id, 'auth.password_reset');
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      return { ok: true };
    }
  );

  // ── Google OAuth (optional; scaffold) ────────────────────────────────────
  app.get('/auth/google/url', async () => {
    if (!env.googleOAuthClientId) throw new AppError('NOT_FOUND', 'Google OAuth is not configured');
    const redirectUri = `${env.apiBaseUrl}/api/v1/auth/google/callback`;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.googleOAuthClientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    return { url: url.toString() };
  });

  // ── Session bootstrap helper for the SPA ─────────────────────────────────
  app.get('/auth/session', async (req) => {
    const claims = req.optionalAuth();
    if (!claims) return { authenticated: false as const };
    const user = await buildSelfUser(claims.sub);
    return { authenticated: true as const, user };
  });
}

async function findLastChallengePurpose(_challengeId: string): Promise<{ identifier: string; purpose: string }> {
  // Used only in AUTO_VERIFY dev mode with the synthetic 'auto' challenge id.
  // Signup stores the identifier in KV (key: auto:verify:last) when AUTO_VERIFY_OTP is active
  // because no DB row is created in that mode.
  const raw = await getKv().get('auto:verify:last');
  if (!raw) throw badRequest('No pending auto-verify signup found. Sign up first.');
  return JSON.parse(raw) as { identifier: string; purpose: string };
}
