import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { reportSchema, blockSchema, deviceRegisterSchema, uuidSchema } from '@worklink/types';
import { validate } from '../lib/validate.js';
import { getDb } from '../db/db.js';
import { newId } from '../lib/ids.js';
import { notify, audit } from '../services/notify.js';
import { notFound, forbidden } from '../lib/errors.js';

const listQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export default async function miscRoutes(app: FastifyInstance) {
  // ── Notifications ────────────────────────────────────────────────────────
  app.get('/notifications', async (req) => {
    const claims = req.auth();
    const q = validate(listQuery, req.query);
    const db = getDb();
    let query = db
      .selectFrom('notifications')
      .selectAll()
      .where('userId', '=', claims.sub)
      .orderBy('createdAt', 'desc')
      .limit(q.limit ?? 30);
    if (q.cursor) query = query.where('createdAt', '<', new Date(q.cursor));
    const rows = await query.execute();
    const last = rows[rows.length - 1];
    return {
      data: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        linkPath: n.linkPath,
        actorAvatarUrl: n.actorAvatarUrl,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      meta: { nextCursor: rows.length >= (q.limit ?? 30) && last ? last.createdAt.toISOString() : null },
    };
  });

  app.post('/notifications/read', async (req) => {
    const claims = req.auth();
    const input = validate(z.object({ ids: z.array(uuidSchema).min(1).max(100).optional() }), req.body);
    const db = getDb();
    let qb = db.updateTable('notifications').set({ readAt: new Date() }).where('userId', '=', claims.sub).where('readAt', 'is', null);
    if (input.ids?.length) qb = qb.where('id', 'in', input.ids);
    await qb.execute();
    return { ok: true };
  });

  // ── Push devices ─────────────────────────────────────────────────────────
  app.post('/devices', async (req) => {
    const claims = req.auth();
    const input = validate(deviceRegisterSchema, req.body);
    const db = getDb();
    await db
      .insertInto('devices')
      .values({ id: newId(), userId: claims.sub, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth })
      .onConflict((oc) => oc.column('endpoint').doUpdateSet({ userId: claims.sub }))
      .execute();
    return { ok: true };
  });

  // ── Reports (safety §7) ──────────────────────────────────────────────────
  app.post('/reports', async (req, reply) => {
    const claims = req.auth();
    const input = validate(reportSchema, req.body);
    const db = getDb();
    const id = newId();
    await db
      .insertInto('reports')
      .values({
        id,
        reporterId: claims.sub,
        status: 'PENDING',
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        details: input.details ?? null,
      })
      .execute();
    await audit(claims.sub, 'report.create', input.targetType, input.targetId, { reason: input.reason });
    reply.code(201);
    return { id };
  });

  // ── Blocks ───────────────────────────────────────────────────────────────
  app.post('/blocks', async (req) => {
    const claims = req.auth();
    const input = validate(blockSchema, req.body);
    if (input.userId === claims.sub) throw forbidden('You cannot block yourself');
    const db = getDb();
    await db
      .insertInto('blocks')
      .values({ id: newId(), userId: claims.sub, blockedUserId: input.userId })
      .onConflict((oc) => oc.doNothing())
      .execute();
    return { ok: true };
  });

  app.post('/blocks/unblock', async (req) => {
    const claims = req.auth();
    const input = validate(blockSchema, req.body);
    const db = getDb();
    await db.deleteFrom('blocks').where('userId', '=', claims.sub).where('blockedUserId', '=', input.userId).execute();
    return { ok: true };
  });

  app.get('/blocks', async (req) => {
    const claims = req.auth();
    const db = getDb();
    const rows = await db
      .selectFrom('blocks')
      .innerJoin('profiles', 'profiles.userId', 'blocks.blockedUserId')
      .select(['profiles.userId', 'profiles.displayName', 'profiles.avatarUrl'])
      .where('blocks.userId', '=', claims.sub)
      .execute();
    return rows.map((r) => ({ id: r.userId, displayName: r.displayName, avatarUrl: r.avatarUrl }));
  });

  // ── Search: jobs ─────────────────────────────────────────────────────────
  app.get('/search/jobs', async (req) => {
    const claims = req.optionalAuth();
    const q = req.query as Record<string, string | undefined>;
    const db = getDb();

    // record search history (best effort)
    if (claims && q.q) {
      try {
        await db.insertInto('searchHistory').values({ id: newId(), userId: claims.sub, term: q.q.slice(0, 100) }).execute();
      } catch {
        /* non-fatal */
      }
    }

    const { queryJobs } = await import('../services/jobs-service.js');
    return queryJobs({
      q: q.q,
      lat: q.lat ? Number(q.lat) : undefined,
      lng: q.lng ? Number(q.lng) : undefined,
      radiusKm: q.radiusKm ? Number(q.radiusKm) : undefined,
      category: q.category,
      payType: q.payType,
      minPay: q.minPay ? Number(q.minPay) : undefined,
      maxPay: q.maxPay ? Number(q.maxPay) : undefined,
      startAfter: q.startAfter,
      hiringNow: q.hiringNow === '1',
      sort: q.sort ?? 'recent',
      cursor: q.cursor,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  });

  // ── Search: people ───────────────────────────────────────────────────────
  app.get('/search/people', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const db = getDb();
    const limit = Math.min(Number(q.limit ?? 20), 50);
    let query = db
      .selectFrom('profiles')
      .innerJoin('users', 'users.id', 'profiles.userId')
      .select([
        'profiles.userId',
        'profiles.displayName',
        'profiles.avatarUrl',
        'profiles.headline',
        'profiles.bio',
        'profiles.homeCity',
        'profiles.homeCountry',
        'profiles.skills',
        'profiles.languages',
        sql<string | null>`(
          SELECT round(avg(r.rating)::numeric, 2) FROM reviews r
          WHERE r.subject_id = profiles.user_id AND r.published_at IS NOT NULL
        )`.as('ratingAvg'),
        sql<number>`(
          SELECT count(*)::int FROM reviews r
          WHERE r.subject_id = profiles.user_id AND r.published_at IS NOT NULL
        )`.as('ratingCount'),
      ])
      .where('users.status', '=', 'ACTIVE')
      .where('users.deletedAt', 'is', null)
      .orderBy('profiles.displayName')
      .limit(limit);

    if (q.q) {
      query = query.where((eb) =>
        eb.or([
          eb('profiles.displayName', 'ilike', `%${q.q}%`),
          eb('profiles.headline', 'ilike', `%${q.q}%`),
          sql<boolean>`profiles.skills::text ILIKE ${'%' + q.q + '%'}`,
        ])
      );
    }
    if (q.minRating) {
      query = query.where(sql<boolean>`COALESCE((
        SELECT avg(r.rating) FROM reviews r WHERE r.subject_id = profiles.user_id AND r.published_at IS NOT NULL
      ), 0) >= ${Number(q.minRating)}`);
    }
    if (q.lat && q.lng) {
      query = query.where(
        sql<boolean>`wl_distance_km(profiles.home_lat, profiles.home_lng, ${Number(q.lat)}, ${Number(q.lng)}) <= ${Number(q.radiusKm ?? 50)}`
      );
    }

    const rows = await query.execute();
    return {
      data: rows.map((r) => ({
        id: r.userId,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        headline: r.headline,
        bio: r.bio,
        city: r.homeCity,
        country: r.homeCountry,
        skills: ((r.skills as Array<{ name: string }>) ?? []).map((s) => s.name),
        languages: (r.languages as string[]) ?? [],
        ratingAvg: r.ratingAvg ? Number(r.ratingAvg) : null,
        ratingCount: Number(r.ratingCount ?? 0),
        completedJobs: 0,
        isVerified: true,
        role: 'BOTH' as const,
        memberSince: new Date(0).toISOString(),
      })),
      meta: { nextCursor: null },
    };
  });
}
