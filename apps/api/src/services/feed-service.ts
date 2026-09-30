import { sql } from 'kysely';
import { getDb, type DB } from '../db/db.js';
import { DefaultFeedRanker, type RankerCandidate, type RankedCandidate } from './feed-ranker.js';
import { encodeCursor, decodeCursor } from '../lib/cursor.js';
import { mapJobSummary, type JobRow } from './jobs-service.js';
import type { FeedPost, FeedTab, ListResponse } from '@worklink/types';

/**
 * Feed assembly (§5.2): fetch a candidate window from Postgres, rank in the
 * app via the pluggable FeedRanker, then keyset-paginate by (score, jobId).
 * The score cursor keeps pagination stable across requests.
 */

const CANDIDATE_WINDOW = 150;
const DEFAULT_LIMIT = 10;

interface ViewerContext {
  id: string | null;
  lat: number | null;
  lng: number | null;
  skills: string[];
  savedJobIds: Set<string>;
  appliedJobIds: Set<string>;
  followingEmployerIds: string[];
}

export async function loadViewerContext(userId: string | null): Promise<ViewerContext> {
  const db = getDb();
  const ctx: ViewerContext = {
    id: userId,
    lat: null,
    lng: null,
    skills: [],
    savedJobIds: new Set(),
    appliedJobIds: new Set(),
    followingEmployerIds: [],
  };
  if (!userId) return ctx;

  const p = await db.selectFrom('profiles').select(['homeLat', 'homeLng', 'skills']).where('userId', '=', userId).executeTakeFirst();
  if (p) {
    ctx.lat = p.homeLat;
    ctx.lng = p.homeLng;
    ctx.skills = ((p.skills as Array<{ name: string }>) ?? []).map((s) => s.name);
  }
  const saved = await db.selectFrom('savedJobs').select('jobId').where('userId', '=', userId).execute();
  ctx.savedJobIds = new Set(saved.map((s) => s.jobId));
  const applied = await db.selectFrom('applications').select('jobId').where('workerId', '=', userId).execute();
  ctx.appliedJobIds = new Set(applied.map((a) => a.jobId));
  return ctx;
}

export async function getFeed(
  tab: FeedTab,
  viewer: ViewerContext,
  cursor: string | undefined,
  limit: number
): Promise<ListResponse<FeedPost>> {
  const db = getDb();
  limit = Math.min(Math.max(1, limit || DEFAULT_LIMIT), 30);

  let q = db
    .selectFrom('jobs')
    .innerJoin('users', 'users.id', 'jobs.employerId')
    .leftJoin('profiles', 'profiles.userId', 'jobs.employerId')
    .leftJoin('jobImages', (join) =>
      join.onRef('jobImages.jobId', '=', 'jobs.id').on('jobImages.position', '=', sql.lit(0))
    )
    .select((f) => [
      'jobs.id',
      'jobs.employerId',
      'jobs.title',
      'jobs.description',
      'jobs.category',
      'jobs.skillsRequired',
      'jobs.payType',
      'jobs.payAmountMinor',
      'jobs.currency',
      'jobs.negotiable',
      'jobs.startAt',
      'jobs.endAt',
      'jobs.durationHours',
      'jobs.reportingTime',
      'jobs.workersNeeded',
      'jobs.filledCount',
      'jobs.lat',
      'jobs.lng',
      'jobs.addressText',
      'jobs.city',
      'jobs.country',
      'jobs.showApproximateLocation',
      'jobs.contactPhone',
      'jobs.contactVisibility',
      'jobs.status',
      'jobs.expiresAt',
      'jobs.createdAt',
      'jobImages.url as imageUrl',
      'profiles.displayName as employerName',
      'profiles.avatarUrl as employerAvatar',
      sql<string | null>`(
        SELECT round(avg(r.rating)::numeric, 2) FROM reviews r
        WHERE r.subject_id = jobs.employer_id AND r.published_at IS NOT NULL
      )`.as('employerRating'),
      sql<number>`(
        SELECT count(*)::int FROM reviews r
        WHERE r.subject_id = jobs.employer_id AND r.published_at IS NOT NULL
      )`.as('employerRatingCount'),
    ])
    .where('jobs.status', '=', 'OPEN')
    .where('users.deletedAt', 'is', null)
    .orderBy('jobs.createdAt', 'desc')
    .limit(CANDIDATE_WINDOW);

  if (tab === 'nearby' && viewer.lat !== null && viewer.lng !== null) {
    q = q.where(
      sql<boolean>`wl_distance_km(jobs.lat, jobs.lng, ${viewer.lat}, ${viewer.lng}) <= 50`
    );
  }

  const rows = (await q.execute()) as unknown as Array<JobRow & { employerId: string }>;

  const candidates: RankerCandidate[] = rows.map((r) => ({
    jobId: r.id,
    employerId: r.employerId,
    createdAt: r.createdAt,
    startAt: r.startAt,
    lat: r.lat,
    lng: r.lng,
    city: r.city,
    category: r.category,
    skillsRequired: (r.skillsRequired as string[]) ?? [],
    payAmountMinor: Number(r.payAmountMinor),
    currency: r.currency,
    payType: r.payType,
    employerRatingAvg: r.employerRating === null ? null : Number(r.employerRating),
    employerRatingCount: Number(r.employerRatingCount ?? 0),
    workersNeeded: r.workersNeeded,
    filledCount: r.filledCount,
  }));

  const ranker = new DefaultFeedRanker();
  const ranked: RankedCandidate[] = ranker.rank(candidates, {
    lat: viewer.lat,
    lng: viewer.lng,
    skills: viewer.skills,
    followingEmployerIds: viewer.followingEmployerIds,
  }, tab);

  // Keyset over (score DESC, jobId DESC)
  let startIdx = 0;
  if (cursor) {
    const [cScore, cId] = decodeCursor(cursor);
    const cs = Number(cScore);
    startIdx = ranked.findIndex((r) => r.score < cs || (r.score === cs && r.jobId < String(cId)));
    if (startIdx === -1) startIdx = ranked.length;
  }

  const page = ranked.slice(startIdx, startIdx + limit);
  const nextCursor =
    startIdx + limit < ranked.length && page.length > 0
      ? encodeCursor([page[page.length - 1]!.score, page[page.length - 1]!.jobId])
      : null;

  const byId = new Map(rows.map((r) => [r.id, r]));
  const data: FeedPost[] = [];
  for (const rc of page) {
    const row = byId.get(rc.jobId);
    if (!row) continue;
    const summary = mapJobSummary({ ...row, distanceKm: rc.distanceKm });
    data.push({
      job: summary,
      saved: viewer.savedJobIds.has(rc.jobId),
      applied: viewer.appliedJobIds.has(rc.jobId),
      reason: rc.reason,
    });
  }

  return { data, meta: { nextCursor } };
}
