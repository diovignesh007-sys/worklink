import { sql, type Kysely } from 'kysely';
import { getDb } from '../db/db.js';
import { newId } from '../lib/ids.js';
import { jsonb } from '../lib/jsonb.js';
import { encodeCursor, decodeCursor } from '../lib/cursor.js';
import { forbidden, notFound } from '../lib/errors.js';
import { getMapProvider } from './maps.js';
import type { DB } from '../db/db.js';
import type { ApplicationStatus, CreateJobInput, JobDetail, JobSummary, ListResponse, UpdateJobInput } from '@worklink/types';

const PAGE_LIMIT = 20;

// ── Row mapping (Kysely + CamelCasePlugin → camelCase keys) ─────────────────

export interface JobRow {
  id: string;
  employerId: string;
  title: string;
  description: string;
  category: string;
  skillsRequired: unknown;
  payType: string;
  payAmountMinor: string | number;
  currency: string;
  negotiable: boolean;
  startAt: Date;
  endAt: Date | null;
  durationHours: number | null;
  reportingTime: string | null;
  workersNeeded: number;
  filledCount: number;
  lat: number;
  lng: number;
  addressText: string;
  city: string | null;
  country: string | null;
  showApproximateLocation: boolean;
  contactPhone: string | null;
  contactVisibility: string;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
  imageUrl: string | null;
  employerName: string | null;
  employerAvatar: string | null;
  employerRating: string | number | null;
  employerRatingCount: number;
  distanceKm?: string | number | null;
}

function toNum(v: string | number | null | undefined): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export function mapJobSummary(r: JobRow): JobSummary {
  return {
    id: r.id,
    title: r.title,
    category: r.category as JobSummary['category'],
    payType: r.payType as JobSummary['payType'],
    payAmountMinor: Number(r.payAmountMinor),
    currency: r.currency,
    negotiable: r.negotiable,
    startAt: r.startAt.toISOString(),
    durationDays: r.durationHours ? Math.ceil(r.durationHours / 24) : null,
    city: r.city,
    imageUrl: r.imageUrl,
    distanceKm:
      r.distanceKm !== undefined && r.distanceKm !== null ? Math.round(Number(r.distanceKm) * 10) / 10 : null,
    workersNeeded: r.workersNeeded,
    filledCount: r.filledCount,
    createdAt: r.createdAt.toISOString(),
    status: r.status as JobSummary['status'],
    employer: {
      id: r.employerId,
      displayName: r.employerName ?? 'WorkLink user',
      avatarUrl: r.employerAvatar,
      isVerified: true,
      ratingAvg: toNum(r.employerRating),
      ratingCount: Number(r.employerRatingCount ?? 0),
    },
  };
}

function approxAddress(addressText: string): string {
  // Privacy (§7): area-level info only until an applicant is accepted
  const parts = addressText.split(',');
  return parts.length > 1 ? `${parts[0]!.trim()}, ${parts[parts.length - 1]!.trim()}` : 'Approximate location';
}

export function mapJobDetail(
  r: JobRow,
  images: Array<{ url: string; width: number | null; height: number | null; position: number }>,
  viewer: { id: string | null; applicationStatus?: string | null; saved?: boolean } | null
): JobDetail {
  const isOwner = viewer !== null && viewer.id === r.employerId;
  return {
    ...mapJobSummary(r),
    description: r.description,
    skillsRequired: (r.skillsRequired as string[]) ?? [],
    endAt: r.endAt ? r.endAt.toISOString() : null,
    reportingTime: r.reportingTime,
    status: r.status as JobDetail['status'],
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    addressText: isOwner || !r.showApproximateLocation ? r.addressText : approxAddress(r.addressText),
    approximateLocation: { lat: r.lat, lng: r.lng },
    contactVisibility: r.contactVisibility as JobDetail['contactVisibility'],
    images: images.map((i) => ({ id: '', url: i.url, width: i.width, height: i.height, position: i.position })),
    viewerRelationship: {
      hasApplied: Boolean(viewer?.applicationStatus),
      applicationStatus: (viewer?.applicationStatus ?? null) as ApplicationStatus | null,
      saved: Boolean(viewer?.saved),
      isOwner,
    },
  };
}

// ── Shared select ────────────────────────────────────────────────────────────

function baseJobSelect(db: Kysely<DB>, viewer: { lat?: number; lng?: number } | undefined) {
  return db
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
      ...(viewer?.lat !== undefined && viewer?.lng !== undefined
        ? [
            sql<number>`wl_distance_km(jobs.lat, jobs.lng, ${viewer.lat}, ${viewer.lng})`.as('distanceKm'),
          ]
        : []),
    ]);
}

// ── Queries ──────────────────────────────────────────────────────────────────

export interface JobQueryOpts {
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  category?: string;
  payType?: string;
  minPay?: number;
  maxPay?: number;
  startAfter?: string;
  hiringNow?: boolean;
  sort?: string;
  status?: string;
  employerId?: string;
  viewerId?: string | null;
  cursor?: string;
  limit?: number;
}

export async function queryJobs(opts: JobQueryOpts): Promise<ListResponse<JobSummary>> {
  const db = getDb();
  const limit = Math.min(opts.limit ?? PAGE_LIMIT, 50);
  const viewerPos = opts.lat !== undefined && opts.lng !== undefined ? { lat: opts.lat, lng: opts.lng } : undefined;

  let q = baseJobSelect(db, viewerPos).where('users.deletedAt', 'is', null);
  if (opts.status && opts.status !== 'ALL') q = q.where('jobs.status', '=', opts.status);

  if (opts.employerId) q = q.where('jobs.employerId', '=', opts.employerId);
  if (opts.category) q = q.where('jobs.category', '=', opts.category);
  if (opts.payType) q = q.where('jobs.payType', '=', opts.payType);
  if (opts.minPay !== undefined) q = q.where('jobs.payAmountMinor', '>=', opts.minPay);
  if (opts.maxPay !== undefined) q = q.where('jobs.payAmountMinor', '<=', opts.maxPay);
  if (opts.startAfter) q = q.where('jobs.startAt', '>=', new Date(opts.startAfter));
  if (opts.hiringNow) q = q.where(sql<boolean>`jobs.filled_count < jobs.workers_needed`);
  if (opts.q) {
    q = q.where(
      sql<boolean>`jobs.search_vector @@ websearch_to_tsquery('simple', ${opts.q}) OR jobs.title ILIKE ${'%' + opts.q + '%'}`
    );
  }
  if (opts.lat !== undefined && opts.lng !== undefined) {
    const radius = opts.radiusKm ?? 50;
    q = q.where(
      sql<boolean>`wl_distance_km(jobs.lat, jobs.lng, ${opts.lat}, ${opts.lng}) <= ${radius}`
    );
  }

  // Keyset pagination over (createdAt, id) DESC
  if (opts.cursor) {
    const [ts, id] = decodeCursor(opts.cursor);
    q = q.where((eb) =>
      eb.or([
        eb('jobs.createdAt', '<', new Date(String(ts))),
        eb.and([eb('jobs.createdAt', '=', new Date(String(ts))), eb('jobs.id', '<', String(id))]),
      ])
    );
  }

  const sortCol = opts.sort === 'pay' ? 'jobs.payAmountMinor' : 'jobs.createdAt';
  let rows = await q.orderBy(sortCol, 'desc').orderBy('jobs.id', 'desc').limit(limit + 1).execute();

  const hasMore = rows.length > limit;
  rows = rows.slice(0, limit);
  const last = rows[rows.length - 1];
  const nextCursor = hasMore && last ? encodeCursor([last.createdAt.toISOString(), last.id]) : null;

  return { data: rows.map((r) => mapJobSummary(r as unknown as JobRow)), meta: { nextCursor } };
}

export async function getJobDetailOr404(
  id: string,
  viewer: { id: string | null; lat?: number; lng?: number; applicationStatus?: string | null; saved?: boolean } | null
): Promise<JobDetail> {
  const db = getDb();
  const viewerPos = viewer?.lat !== undefined && viewer?.lng !== undefined ? viewer : undefined;
  let q = baseJobSelect(db, viewerPos).where('jobs.id', '=', id);
  if (viewer?.id) {
    q = q.where((eb) =>
      eb.or([
        eb('jobs.status', '!=', 'DRAFT'),
        eb.and([eb('jobs.status', '=', 'DRAFT'), eb('jobs.employerId', '=', viewer.id)]),
      ])
    );
  } else {
    q = q.where('jobs.status', '!=', 'DRAFT');
  }
  const row = (await q.limit(1).execute())[0] as JobRow | undefined;
  if (!row) throw notFound('Job not found');

  const images = await db
    .selectFrom('jobImages')
    .select(['url', 'width', 'height', 'position'])
    .where('jobId', '=', id)
    .orderBy('position')
    .execute();

  return mapJobDetail(row, images, viewer ?? null);
}

// ── Commands ─────────────────────────────────────────────────────────────────

export async function createJob(employerId: string, input: CreateJobInput): Promise<string> {
  const db = getDb();
  const jobId = newId();

  let city = input.city ?? null;
  let country = input.country ?? null;
  if (!city || !country) {
    const rg = await getMapProvider()
      .reverseGeocode(input.location.lat, input.location.lng)
      .catch(() => null);
    if (rg) {
      city = city ?? rg.city ?? null;
      country = country ?? rg.country ?? null;
    }
  }

  const startAt = new Date(input.startAt);
  const expiresAt = input.publish
    ? new Date(Math.min(startAt.getTime(), Date.now() + 14 * 24 * 3600 * 1000))
    : null;
  const endAt = input.durationDays ? new Date(startAt.getTime() + input.durationDays * 24 * 3600 * 1000) : null;

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('jobs')
      .values({
        id: jobId,
        employerId,
        title: input.title,
        description: input.description,
        category: input.category,
        skillsRequired: jsonb(input.skillsRequired),
        payType: input.payType,
        payAmountMinor: input.payAmountMinor,
        currency: input.currency,
        negotiable: input.negotiable,
        startAt,
        endAt,
        durationHours: input.durationHours ?? null,
        reportingTime: input.reportingTime ?? null,
        recurring: input.recurring,
        workersNeeded: input.workersNeeded,
        lat: input.location.lat,
        lng: input.location.lng,
        addressText: input.addressText,
        placeId: input.placeId ?? null,
        city,
        country,
        showApproximateLocation: input.showApproximateLocation,
        contactPhone: input.contactPhone ?? null,
        contactVisibility: input.contactVisibility,
        status: input.publish ? 'OPEN' : 'DRAFT',
        expiresAt,
      })
      .execute();

    if (input.imageUrls.length) {
      await trx
        .insertInto('jobImages')
        .values(
          input.imageUrls.map((url, i) => ({
            id: newId(),
            jobId,
            url,
            width: null,
            height: null,
            position: i,
          }))
        )
        .execute();
    }
  });

  return jobId;
}

export async function updateJob(jobId: string, employerId: string, input: UpdateJobInput): Promise<void> {
  const db = getDb();
  const job = await db.selectFrom('jobs').select(['employerId']).where('id', '=', jobId).executeTakeFirst();
  if (!job) throw notFound('Job not found');
  if (job.employerId !== employerId) throw forbidden('Not your post');

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.category !== undefined) patch.category = input.category;
  if (input.skillsRequired !== undefined) patch.skillsRequired = jsonb(input.skillsRequired);
  if (input.workersNeeded !== undefined) patch.workersNeeded = input.workersNeeded;
  if (input.payAmountMinor !== undefined) patch.payAmountMinor = input.payAmountMinor;
  if (input.payType !== undefined) patch.payType = input.payType;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.negotiable !== undefined) patch.negotiable = input.negotiable;
  if (input.startAt !== undefined) patch.startAt = new Date(input.startAt);
  if (input.reportingTime !== undefined) patch.reportingTime = input.reportingTime;
  if (input.addressText !== undefined) patch.addressText = input.addressText;
  if (input.location !== undefined) {
    patch.lat = input.location.lat;
    patch.lng = input.location.lng;
  }
  if (input.contactVisibility !== undefined) patch.contactVisibility = input.contactVisibility;
  if (input.publish === true) patch.status = 'OPEN';

  await db.updateTable('jobs').set(patch as never).where('id', '=', jobId).execute();
}

export async function closeJob(jobId: string, employerId: string): Promise<void> {
  const db = getDb();
  const job = await db.selectFrom('jobs').select(['employerId', 'status']).where('id', '=', jobId).executeTakeFirst();
  if (!job) throw notFound('Job not found');
  if (job.employerId !== employerId) throw forbidden('Not your post');
  await db.updateTable('jobs').set({ status: 'CANCELLED', updatedAt: new Date() }).where('id', '=', jobId).execute();
}

export async function sweepExpiredJobs(): Promise<number> {
  const db = getDb();
  const res = await sql`UPDATE jobs SET status = 'EXPIRED', updated_at = now()
    WHERE status = 'OPEN' AND expires_at IS NOT NULL AND expires_at < now()`.execute(db);
  return Number(res.numAffectedRows ?? 0);
}
