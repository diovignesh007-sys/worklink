import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { updateProfileSchema, updateSettingsSchema, changePasswordSchema, uuidSchema } from '@worklink/types';
import type { ListResponse, ReviewView } from '@worklink/types';
import { validate } from '../lib/validate.js';
import { getDb, type DB } from '../db/db.js';
import { jsonb } from '../lib/jsonb.js';
import { notFound, forbidden, unauthorized } from '../lib/errors.js';
import { verifyPassword, hashPassword } from '../lib/password.js';
import { buildSelfUser, revokeAllSessions } from '../services/auth/auth-service.js';
import { audit } from '../services/notify.js';

export default async function usersRoutes(app: FastifyInstance) {
  app.get('/users/me', async (req) => {
    const claims = req.auth();
    return buildSelfUser(claims.sub);
  });

  app.patch('/users/me', async (req) => {
    const claims = req.auth();
    const input = validate(updateProfileSchema, req.body);
    const db = getDb();

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.headline !== undefined) patch.headline = input.headline;
    if (input.bio !== undefined) patch.bio = input.bio;
    if (input.dateOfBirth !== undefined) patch.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
    if (input.gender !== undefined) patch.gender = input.gender;    if (input.skills !== undefined) patch.skills = jsonb(input.skills);
    if (input.languages !== undefined) patch.languages = jsonb(input.languages);
    if (input.education !== undefined) patch.education = jsonb(input.education);
    if (input.experience !== undefined) patch.experience = jsonb(input.experience);
    if (input.hourlyExpectationMinor !== undefined) patch.hourlyExpectationMinor = input.hourlyExpectationMinor;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.availability !== undefined) patch.availability = input.availability;
    if (input.isAvailableNow !== undefined) patch.isAvailableNow = input.isAvailableNow;
    if (input.homeLocation !== undefined) {
      patch.homeLat = input.homeLocation?.lat ?? null;
      patch.homeLng = input.homeLocation?.lng ?? null;
    }
    if (input.homeCity !== undefined) patch.homeCity = input.homeCity;
    if (input.homeCountry !== undefined) patch.homeCountry = input.homeCountry;
    if (input.contactPhone !== undefined) patch.contactPhone = input.contactPhone;
    if (input.contactVisibility !== undefined) {
      patch.phoneVisibility = input.contactVisibility.phone;
      patch.emailVisibility = input.contactVisibility.email;
    }
    if (input.coverUrl !== undefined) patch.coverUrl = input.coverUrl;

    await db.updateTable('profiles').set(patch as never).where('userId', '=', claims.sub).execute();
    await audit(claims.sub, 'profile.update');
    return buildSelfUser(claims.sub);
  });

  app.get('/users/:id', async (req) => {
    const id = validate(uuidSchema, (req.params as { id: string }).id);
    const db = getDb();
    const u = await db.selectFrom('users').select(['id', 'createdAt', 'status', 'emailVerifiedAt', 'phoneVerifiedAt']).where('id', '=', id).executeTakeFirst();
    if (!u || u.status === 'DEACTIVATED') throw notFound('User not found');

    const p = await db.selectFrom('profiles').selectAll().where('userId', '=', id).executeTakeFirst();
    if (!p) throw notFound('User not found');

    const agg = await db
      .selectFrom('reviews')
      .select((f) => [f.fn.avg('rating').as('avgRating'), f.fn.countAll().as('cnt')])
      .where('subjectId', '=', id)
      .where('publishedAt', 'is not', null)
      .executeTakeFirst();

    const completed = await db
      .selectFrom('assignments')
      .select((f) => f.fn.countAll().as('cnt'))
      .where((eb) => eb.or([eb('workerId', '=', id), eb('employerId', '=', id)]))
      .where('status', 'in', ['COMPLETED', 'PAID'])
      .executeTakeFirst();

    const posted = await db
      .selectFrom('jobs')
      .select((f) => f.fn.countAll().as('cnt'))
      .where('employerId', '=', id)
      .executeTakeFirst();

    return {
      id,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      headline: p.headline,
      bio: p.bio,
      city: p.homeCity,
      country: p.homeCountry,
      skills: ((p.skills as Array<{ name: string }>) ?? []).map((s) => s.name),
      languages: (p.languages as string[]) ?? [],
      ratingAvg: agg?.avgRating !== undefined && agg.avgRating !== null ? Number(agg.avgRating) : null,
      ratingCount: Number(agg?.cnt ?? 0),
      completedJobs: Number(completed?.cnt ?? 0),
      jobsPosted: Number(posted?.cnt ?? 0),
      isVerified: Boolean(u.emailVerifiedAt || u.phoneVerifiedAt),
      role: 'BOTH' as const,
      memberSince: u.createdAt.toISOString(),
    };
  });

  app.get('/users/:id/reviews', async (req) => {
    const id = validate(uuidSchema, (req.params as { id: string }).id);
    const db = getDb();
    const rows = await db
      .selectFrom('reviews')
      .innerJoin('profiles', 'profiles.userId', 'reviews.authorId')
      .select([
        'reviews.id',
        'reviews.assignmentId',
        'reviews.subjectId',
        'reviews.authorId',
        'reviews.rating',
        'reviews.comment',
        'reviews.tags',
        'reviews.publishedAt',
        'profiles.displayName',
        'profiles.avatarUrl',
      ])
      .where('reviews.subjectId', '=', id)
      .where('reviews.publishedAt', 'is not', null)
      .orderBy('reviews.publishedAt', 'desc')
      .limit(50)
      .execute();

    return {
      data: rows.map((r) => ({
        id: r.id,
        assignmentId: r.assignmentId,
        author: { id: r.authorId, displayName: r.displayName, avatarUrl: r.avatarUrl, isVerified: true },
        subjectId: r.subjectId,
        rating: r.rating,
        comment: r.comment,
        tags: (r.tags as ReviewView['tags']) ?? [],
        publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
        hiddenUntilMutual: false,
      })),
      meta: { nextCursor: null },
    } satisfies ListResponse<ReviewView>;
  });

  app.patch('/users/me/settings', async (req) => {
    const claims = req.auth();
    const input = validate(updateSettingsSchema, req.body);
    const db = getDb();

    const current = await db.selectFrom('userSettings').selectAll().where('userId', '=', claims.sub).executeTakeFirstOrThrow();
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.theme !== undefined) patch.theme = input.theme;
    if (input.language !== undefined) patch.language = input.language;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.notifications !== undefined) {
      const cur = { inApp: {}, email: {}, push: {}, dailyDigest: true, ...((current.notificationPrefs as object | undefined) ?? {}) };
      patch.notificationPrefs = {
        ...cur,
        ...(input.notifications.inApp ? { inApp: { ...cur.inApp, ...input.notifications.inApp } } : {}),
        ...(input.notifications.email ? { email: { ...cur.email, ...input.notifications.email } } : {}),
        ...(input.notifications.push ? { push: { ...cur.push, ...input.notifications.push } } : {}),
        ...(input.notifications.dailyDigest !== undefined ? { dailyDigest: input.notifications.dailyDigest } : {}),
      };
    }
    if (input.privacy !== undefined) {
      const profPatch: Record<string, unknown> = {};
      if (input.privacy.profileVisibility !== undefined) profPatch.profileVisibility = input.privacy.profileVisibility;
      if (input.privacy.showOnMap !== undefined) profPatch.showOnMap = input.privacy.showOnMap;
      if (Object.keys(profPatch).length) {
        await db.updateTable('profiles').set(profPatch as never).where('userId', '=', claims.sub).execute();
      }
    }
    if (Object.keys(patch).length > 1) {
      await db.updateTable('userSettings').set(patch as never).where('userId', '=', claims.sub).execute();
    }
    const self = await buildSelfUser(claims.sub);
    return self.settings;
  });

  app.post('/users/me/password', async (req) => {
    const claims = req.auth();
    const input = validate(changePasswordSchema, req.body);
    const db = getDb();
    const row = await db.selectFrom('users').select('passwordHash').where('id', '=', claims.sub).executeTakeFirst();
    if (!row?.passwordHash || !(await verifyPassword(row.passwordHash, input.currentPassword))) {
      throw unauthorized('Current password is incorrect');
    }
    await db
      .updateTable('users')
      .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
      .where('id', '=', claims.sub)
      .execute();
    await revokeAllSessions(claims.sub);
    await audit(claims.sub, 'password.change');
    return { ok: true };
  });

  app.post('/users/me/deactivate', async (req) => {
    const claims = req.auth();
    const db = getDb();
    await db
      .updateTable('users')
      .set({ status: 'DEACTIVATED', deletedAt: new Date() })
      .where('id', '=', claims.sub)
      .execute();
    await revokeAllSessions(claims.sub);
    await audit(claims.sub, 'account.deactivate');
    return { ok: true };
  });
}
