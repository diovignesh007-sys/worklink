import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { createJobSchema, updateJobSchema, applySchema, feedQuerySchema } from '@worklink/types';
import { validate } from '../lib/validate.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { getDb } from '../db/db.js';
import { newId } from '../lib/ids.js';
import { createJob, updateJob, closeJob, getJobDetailOr404, queryJobs, sweepExpiredJobs } from '../services/jobs-service.js';
import { getFeed, loadViewerContext } from '../services/feed-service.js';
import { notify, audit } from '../services/notify.js';
import { rateLimit } from '../lib/ratelimit.js';

export default async function jobsRoutes(app: FastifyInstance) {
  // ── Create job (wizard publish / autosave draft) ──────────────────────────
  app.post('/jobs', async (req, reply) => {
    const claims = req.auth();
    const input = validate(createJobSchema, req.body);
    const jobId = await createJob(claims.sub, input);
    await audit(claims.sub, 'job.create', 'JOB', jobId);

    if (input.publish) {
      // Notify matched nearby workers (deduped, preference-aware, §5.6)
      const db = getDb();
      const job = await db.selectFrom('jobs').select(['title', 'lat', 'lng', 'category']).where('id', '=', jobId).executeTakeFirst();
      if (job) {
        const nearby = await db
          .selectFrom('profiles')
          .innerJoin('users', 'users.id', 'profiles.userId')
          .select(['profiles.userId'])
          .where('users.deletedAt', 'is', null)
          .where('users.id', '!=', claims.sub)
          .where('profiles.homeLat', 'is not', null)
          .where(
            sql<boolean>`
            wl_distance_km(profiles.home_lat, profiles.home_lng, ${job.lat}, ${job.lng}) <= 25
            `
          )
          .limit(200)
          .execute();
        for (const w of nearby.slice(0, 50)) {
          await notify({
            userId: w.userId,
            type: 'NEW_MATCHING_JOB',
            title: 'New job nearby',
            body: job.title,
            linkPath: `/jobs/${jobId}`,
            dedupeKey: `job:${jobId}:user:${w.userId}`,
          });
        }
      }
      // Realtime broadcast (WS server attached in index.ts)
      const bus = (app as unknown as { wlBus?: { publishJobEvent: (jobId: string) => void } }).wlBus;
      bus?.publishJobEvent(jobId);
    }

    reply.code(201);
    return getJobDetailOr404(jobId, { id: claims.sub });
  });

  // ── List / search-lite (spec §8 filters) ─────────────────────────────────
  app.get('/jobs', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const claims = req.optionalAuth();
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
      sort: q.sort,
      cursor: q.cursor,
      limit: q.limit ? Math.min(Number(q.limit), 50) : undefined,
    });
  });

  // ── Feed ─────────────────────────────────────────────────────────────────
  app.get('/feed', async (req) => {
    const q = validate(feedQuerySchema, req.query);
    const claims = req.optionalAuth();
    const viewer = await loadViewerContext(claims?.sub ?? null);
    if (q.lat !== undefined && q.lng !== undefined) {
      viewer.lat = q.lat;
      viewer.lng = q.lng;
    }
    return getFeed(q.tab as NonNullable<typeof q.tab>, viewer, q.cursor, q.limit ?? 10);
  });

  // ── Job detail ───────────────────────────────────────────────────────────
  app.get('/jobs/:id', async (req) => {
    const claims = req.optionalAuth();
    const db = getDb();
    let applicationStatus: string | null = null;
    let saved = false;
    let viewerLat: number | undefined;
    let viewerLng: number | undefined;
    if (claims) {
      const appRow = await db
        .selectFrom('applications')
        .select('status')
        .where('jobId', '=', (req.params as { id: string }).id)
        .where('workerId', '=', claims.sub)
        .executeTakeFirst();
      applicationStatus = appRow?.status ?? null;
      const saveRow = await db
        .selectFrom('savedJobs')
        .select('id')
        .where('jobId', '=', (req.params as { id: string }).id)
        .where('userId', '=', claims.sub)
        .executeTakeFirst();
      saved = Boolean(saveRow);
      const p = await db.selectFrom('profiles').select(['homeLat', 'homeLng']).where('userId', '=', claims.sub).executeTakeFirst();
      if (p?.homeLat != null && p?.homeLng != null) {
        viewerLat = p.homeLat;
        viewerLng = p.homeLng;
      }
    }
    return getJobDetailOr404((req.params as { id: string }).id, {
      id: claims?.sub ?? null,
      lat: viewerLat,
      lng: viewerLng,
      applicationStatus,
      saved,
    });
  });

  // ── Update / close ───────────────────────────────────────────────────────
  app.patch('/jobs/:id', async (req) => {
    const claims = req.auth();
    const input = validate(updateJobSchema, req.body);
    await updateJob((req.params as { id: string }).id, claims.sub, input);
    return getJobDetailOr404((req.params as { id: string }).id, { id: claims.sub });
  });

  app.post('/jobs/:id/close', async (req) => {
    const claims = req.auth();
    await closeJob((req.params as { id: string }).id, claims.sub);
    return getJobDetailOr404((req.params as { id: string }).id, { id: claims.sub });
  });

  // ── Applications on a job (employer view) ────────────────────────────────
  app.get('/jobs/:id/applications', async (req) => {
    const claims = req.auth();
    const jobId = (req.params as { id: string }).id;
    const db = getDb();
    const job = await db.selectFrom('jobs').select(['employerId']).where('id', '=', jobId).executeTakeFirst();
    if (!job) throw notFound('Job not found');
    if (job.employerId !== claims.sub) throw forbidden('Not your post');
    const rows = await db
      .selectFrom('applications')
      .innerJoin('profiles', 'profiles.userId', 'applications.workerId')
      .innerJoin('users', 'users.id', 'applications.workerId')
      .select([
        'applications.id',
        'applications.workerId',
        'applications.message',
        'applications.proposedRateMinor',
        'applications.status',
        'applications.createdAt',
        'applications.updatedAt',
        'profiles.displayName',
        'profiles.avatarUrl',
        'profiles.skills',
        sql<string | null>`(
          SELECT round(avg(r.rating)::numeric, 2) FROM reviews r
          WHERE r.subject_id = applications.worker_id AND r.published_at IS NOT NULL
        )`.as('workerRating'),
        sql<number>`(
          SELECT count(*)::int FROM reviews r
          WHERE r.subject_id = applications.worker_id AND r.published_at IS NOT NULL
        )`.as('workerRatingCount'),
      ])
      .where('applications.jobId', '=', jobId)
      .orderBy('applications.createdAt', 'desc')
      .limit(100)
      .execute();

    const jobRow = await db.selectFrom('jobs').select(['title', 'status', 'currency']).where('id', '=', jobId).executeTakeFirstOrThrow();
    return {
      data: rows.map((r) => ({
        id: r.id,
        jobId,
        jobTitle: jobRow.title,
        jobStatus: jobRow.status,
        worker: {
          id: r.workerId,
          displayName: r.displayName,
          avatarUrl: r.avatarUrl,
          isVerified: false,
          ratingAvg: r.workerRating ? Number(r.workerRating) : null,
          ratingCount: Number(r.workerRatingCount ?? 0),
          skills: ((r.skills as Array<{ name: string }>) ?? []).map((s) => s.name),
          languages: [],
          completedJobs: 0,
          memberSince: '',
        },
        message: r.message,
        proposedRateMinor: r.proposedRateMinor === null ? null : Number(r.proposedRateMinor),
        currency: jobRow.currency,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      meta: { nextCursor: null },
    };
  });

  // ── Apply to a job ───────────────────────────────────────────────────────
  app.post('/jobs/:id/apply', { preHandler: rateLimit({ name: 'apply', max: 30, windowSeconds: 3600 }) }, async (req, reply) => {
    const claims = req.auth();
    const jobId = (req.params as { id: string }).id;
    const input = validate(applySchema, req.body);
    const db = getDb();

    const job = await db.selectFrom('jobs').select(['employerId', 'title', 'status', 'currency']).where('id', '=', jobId).executeTakeFirst();
    if (!job) throw notFound('Job not found');
    if (job.status !== 'OPEN') throw conflict('This job is not accepting applications');
    if (job.employerId === claims.sub) throw badRequest('You cannot apply to your own job');

    const existing = await db
      .selectFrom('applications')
      .select('id')
      .where('jobId', '=', jobId)
      .where('workerId', '=', claims.sub)
      .executeTakeFirst();
    if (existing) throw conflict('You have already applied to this job');

    const id = newId();
    await db
      .insertInto('applications')
      .values({
        id,
        jobId,
        workerId: claims.sub,
        message: input.message ?? null,
        proposedRateMinor: input.proposedRateMinor ?? null,
        status: 'APPLIED',
      })
      .execute();

    await notify({
      userId: job.employerId,
      type: 'NEW_APPLICATION',
      title: 'New application',
      body: `Someone applied for ${job.title}`,
      linkPath: `/jobs/${jobId}/applicants`,
      dedupeKey: `app:${id}`,
    });

    reply.code(201);
    return { id, status: 'APPLIED' };
  });

  // ── Save / unsave (optimistic UI on client) ──────────────────────────────
  app.post('/jobs/:id/save', async (req) => {
    const claims = req.auth();
    const jobId = (req.params as { id: string }).id;
    const db = getDb();
    const existing = await db
      .selectFrom('savedJobs')
      .select('id')
      .where('jobId', '=', jobId)
      .where('userId', '=', claims.sub)
      .executeTakeFirst();
    if (existing) {
      await db.deleteFrom('savedJobs').where('id', '=', existing.id).execute();
      return { saved: false };
    }
    await db.insertInto('savedJobs').values({ id: newId(), jobId, userId: claims.sub }).execute();
    return { saved: true };
  });

  // ── Employer: my posts ───────────────────────────────────────────────────
  app.get('/me/jobs', async (req) => {
    const claims = req.auth();
    return queryJobs({ employerId: claims.sub, status: 'ALL' });
  });

  // ── Maintenance (called by scheduler in index.ts) ────────────────────────
  app.get('/jobs/maintenance/expire', async () => {
    const n = await sweepExpiredJobs();
    return { expired: n };
  });
}
