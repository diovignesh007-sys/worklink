import { sql } from 'kysely';
import { getDb } from '../db/db.js';
import { newId } from '../lib/ids.js';
import { jsonb } from '../lib/jsonb.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { notify, audit } from './notify.js';
import type { ApplicationAction, AssignmentView, DayLog, ReviewView } from '@worklink/types';

const APP_TRANSITIONS: Record<string, string[]> = {
  APPLIED: ['SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export async function actOnApplication(applicationId: string, userId: string, action: ApplicationAction) {
  const db = getDb();
  const appRow = await db
    .selectFrom('applications')
    .innerJoin('jobs', 'jobs.id', 'applications.jobId')
    .select([
      'applications.id',
      'applications.workerId',
      'applications.status',
      'applications.jobId',
      'jobs.employerId',
      'jobs.title',
      'jobs.payAmountMinor',
      'jobs.payType',
      'jobs.currency',
      'jobs.workersNeeded',
      'jobs.filledCount',
      'jobs.status as jobStatus',
    ])
    .where('applications.id', '=', applicationId)
    .executeTakeFirst();
  if (!appRow) throw notFound('Application not found');

  const isEmployer = appRow.employerId === userId;
  const isWorker = appRow.workerId === userId;

  if (action === 'WITHDRAW') {
    if (!isWorker) throw forbidden('Only the applicant can withdraw');
    if (!APP_TRANSITIONS[appRow.status]?.includes('WITHDRAWN')) throw conflict(`Cannot withdraw from ${appRow.status}`);
    await db.updateTable('applications').set({ status: 'WITHDRAWN', updatedAt: new Date() }).where('id', '=', applicationId).execute();
    await notify({
      userId: appRow.employerId,
      type: 'SYSTEM',
      title: 'Application withdrawn',
      body: `An applicant withdrew from ${appRow.title}`,
      linkPath: `/jobs/${appRow.jobId}/applicants`,
    });
    return { id: applicationId, status: 'WITHDRAWN' };
  }

  if (!isEmployer) throw forbidden('Only the employer can manage applications');
  if (appRow.jobStatus !== 'OPEN') throw conflict('This post is no longer open');

  const target =
    action === 'SHORTLIST' ? 'SHORTLISTED' : action === 'ACCEPT' ? 'ACCEPTED' : action === 'REJECT' ? 'REJECTED' : null;
  if (!target) throw badRequest('Unknown action');
  if (!APP_TRANSITIONS[appRow.status]?.includes(target)) throw conflict(`Cannot move from ${appRow.status} to ${target}`);

  if (target === 'ACCEPTED') {
    const openSlots = appRow.workersNeeded - Number(appRow.filledCount);
    if (openSlots <= 0) throw conflict('All positions for this job are already filled');
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('applications')
      .set({ status: target, updatedAt: new Date() })
      .where('id', '=', applicationId)
      .execute();

    if (target === 'ACCEPTED') {
      await trx
        .insertInto('assignments')
        .values({
          id: newId(),
          jobId: appRow.jobId,
          workerId: appRow.workerId,
          employerId: appRow.employerId,
          agreedRateMinor: Number(appRow.payAmountMinor),
          payType: appRow.payType,
          currency: appRow.currency,
          status: 'SCHEDULED',
        })
        .execute();

      const updated = await trx
        .updateTable('jobs')
        .set({ filledCount: Number(appRow.filledCount) + 1, updatedAt: new Date() })
        .where('id', '=', appRow.jobId)
        .returningAll()
        .executeTakeFirstOrThrow();

      // When every slot is filled, move the job into IN_PROGRESS
      if (Number(updated.filledCount) >= updated.workersNeeded) {
        await trx.updateTable('jobs').set({ status: 'IN_PROGRESS' }).where('id', '=', appRow.jobId).execute();
      }
    }
  });

  const type = target === 'ACCEPTED' ? 'APPLICATION_ACCEPTED' : target === 'SHORTLISTED' ? 'APPLICATION_SHORTLISTED' : 'APPLICATION_REJECTED';
  await notify({
    userId: appRow.workerId,
    type,
    title: `Application ${target.toLowerCase()}`,
    body: target === 'ACCEPTED' ? `You were accepted for ${appRow.title} 🎉` : `${appRow.title}: application ${target.toLowerCase()}`,
    linkPath: target === 'ACCEPTED' ? '/work' : `/jobs/${appRow.jobId}`,
    dedupeKey: `app:${applicationId}:${target}`,
  });

  if (target === 'ACCEPTED') {
    // System message into the brand-new conversation space (created lazily on first chat)
    await audit(userId, 'application.accepted', 'APPLICATION', applicationId, { jobId: appRow.jobId });
  }

  return { id: applicationId, status: target };
}

// ── Assignments ──────────────────────────────────────────────────────────────

export async function listMyAssignments(userId: string): Promise<AssignmentView[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('assignments')
    .innerJoin('jobs', 'jobs.id', 'assignments.jobId')
    .leftJoin('jobImages', (join) => join.onRef('jobImages.jobId', '=', 'jobs.id').on('jobImages.position', '=', sql.lit(0)))
    .select([
      'assignments.id',
      'assignments.jobId',
      'assignments.workerId',
      'assignments.employerId',
      'assignments.agreedRateMinor',
      'assignments.payType',
      'assignments.currency',
      'assignments.status',
      'assignments.startedAt',
      'assignments.completedAt',
      'assignments.hoursOrDaysLogged',
      'jobs.title as jobTitle',
      'jobImages.url as jobImageUrl',
    ])
    .where((eb) => eb.or([eb('assignments.workerId', '=', userId), eb('assignments.employerId', '=', userId)]))
    .orderBy('assignments.createdAt', 'desc')
    .limit(100)
    .execute();

  const result: AssignmentView[] = [];
  for (const r of rows) {
    const peerId = r.workerId === userId ? r.employerId : r.workerId;
    const peer = await db.selectFrom('profiles').select(['displayName', 'avatarUrl']).where('userId', '=', peerId).executeTakeFirst();
    const logs = await db
      .selectFrom('dayLogs')
      .selectAll()
      .where('assignmentId', '=', r.id)
      .orderBy('date', 'desc')
      .limit(31)
      .execute();

    const payment = await db
      .selectFrom('payments')
      .select('status')
      .where('assignmentId', '=', r.id)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst();

    const reviews = await db
      .selectFrom('reviews')
      .select(['authorId'])
      .where('assignmentId', '=', r.id)
      .execute();

    result.push({
      id: r.id,
      jobId: r.jobId,
      jobTitle: r.jobTitle,
      jobImageUrl: r.jobImageUrl,
      worker: { id: r.workerId, displayName: '', avatarUrl: null, isVerified: true, ratingAvg: null },
      employer: { id: r.employerId, displayName: '', avatarUrl: null, isVerified: true, ratingAvg: null },
      agreedRateMinor: Number(r.agreedRateMinor),
      payType: r.payType as AssignmentView['payType'],
      currency: r.currency,
      status: r.status as AssignmentView['status'],
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      hoursOrDaysLogged: Number(r.hoursOrDaysLogged),
      paymentStatus: (payment?.status as AssignmentView['paymentStatus']) ?? null,
      logs: logs.map((l) => ({
        id: l.id,
        date: String(l.date).slice(0, 10),
        hoursOrDays: Number(l.hoursOrDays),
        note: l.note,
        status: l.status as DayLog['status'],
        createdAt: l.createdAt.toISOString(),
      })),
      viewerRole: r.workerId === userId ? 'WORKER' : 'EMPLOYER',
      conversationId: null,
      review: {
        byViewer: reviews.some((rv) => rv.authorId === userId),
        byOther: reviews.some((rv) => rv.authorId !== userId),
      },
    });
    // fill peer display names
    const view = result[result.length - 1]!;
    if (peer) {
      if (view.viewerRole === 'WORKER') view.employer = { ...view.employer, displayName: peer.displayName, avatarUrl: peer.avatarUrl };
      else view.worker = { ...view.worker, displayName: peer.displayName, avatarUrl: peer.avatarUrl };
    }
  }
  return result;
}

export async function submitLog(assignmentId: string, userId: string, input: { date: string; hoursOrDays: number; note?: string | null }) {
  const db = getDb();
  const a = await db.selectFrom('assignments').selectAll().where('id', '=', assignmentId).executeTakeFirst();
  if (!a) throw notFound('Assignment not found');
  if (a.workerId !== userId) throw forbidden('Only the worker submits logs');
  if (!['ONGOING', 'SCHEDULED'].includes(a.status)) throw conflict(`Cannot log time while ${a.status}`);

  const existing = await db
    .selectFrom('dayLogs')
    .select('id')
    .where('assignmentId', '=', assignmentId)
    .where('date', '=', input.date)
    .executeTakeFirst();
  if (existing) throw conflict('A log for this date already exists');

  const id = newId();
  await db
    .insertInto('dayLogs')
    .values({ id, assignmentId, date: input.date, hoursOrDays: input.hoursOrDays, note: input.note ?? null })
    .execute();

  await db
    .updateTable('assignments')
    .set({ hoursOrDaysLogged: Number(a.hoursOrDaysLogged) + input.hoursOrDays, status: a.status === 'SCHEDULED' ? 'ONGOING' : a.status, updatedAt: new Date() })
    .where('id', '=', assignmentId)
    .execute();

  await notify({
    userId: a.employerId,
    type: 'SYSTEM',
    title: 'Time log submitted',
    body: `A day log (${input.hoursOrDays}) is waiting for your approval`,
    linkPath: '/work',
    dedupeKey: `log:${id}`,
  });

  return { id, date: input.date, hoursOrDays: input.hoursOrDays, note: input.note ?? null, status: 'PENDING' as const, createdAt: new Date().toISOString() };
}

export async function decideLog(assignmentId: string, logId: string, employerId: string, decision: 'APPROVE' | 'REJECT') {
  const db = getDb();
  const a = await db.selectFrom('assignments').selectAll().where('id', '=', assignmentId).executeTakeFirst();
  if (!a) throw notFound('Assignment not found');
  if (a.employerId !== employerId) throw forbidden('Only the employer approves logs');
  const log = await db.selectFrom('dayLogs').selectAll().where('id', '=', logId).executeTakeFirst();
  if (!log || log.assignmentId !== assignmentId) throw notFound('Log not found');

  await db
    .updateTable('dayLogs')
    .set({ status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' })
    .where('id', '=', logId)
    .execute();

  await notify({
    userId: a.workerId,
    type: 'SYSTEM',
    title: decision === 'APPROVE' ? 'Log approved' : 'Log rejected',
    body: `Your log for ${log.date} was ${decision === 'APPROVE' ? 'approved' : 'rejected'}`,
    linkPath: '/work',
    dedupeKey: `log:${logId}:${decision}`,
  });

  return { id: logId, status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' };
}

export async function completeAssignment(assignmentId: string, userId: string) {
  const db = getDb();
  const a = await db.selectFrom('assignments').selectAll().where('id', '=', assignmentId).executeTakeFirst();
  if (!a) throw notFound('Assignment not found');
  const isWorker = a.workerId === userId;
  const isEmployer = a.employerId === userId;
  if (!isWorker && !isEmployer) throw forbidden('Not a participant');
  if (!['ONGOING', 'SCHEDULED'].includes(a.status)) throw conflict(`Cannot complete while ${a.status}`);

  await db
    .updateTable('assignments')
    .set({ status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() })
    .where('id', '=', assignmentId)
    .execute();

  const job = await db.selectFrom('jobs').select(['title', 'employerId']).where('id', '=', a.jobId).executeTakeFirst();
  const peerId = isWorker ? a.employerId : a.workerId;
  await notify({
    userId: peerId,
    type: 'WORK_MARKED_COMPLETE',
    title: 'Work marked complete',
    body: job ? `${job.title} is marked complete — leave a review` : 'Work marked complete — leave a review',
    linkPath: '/work',
    dedupeKey: `assign:${assignmentId}:completed:${userId}`,
  });

  const completedCount = await db
    .selectFrom('assignments')
    .select((f) => f.fn.countAll().as('cnt'))
    .where('jobId', '=', a.jobId)
    .where('status', 'in', ['COMPLETED', 'PAID'])
    .executeTakeFirst();
  const jobRow = await db.selectFrom('jobs').select(['workersNeeded', 'filledCount']).where('id', '=', a.jobId).executeTakeFirst();
  if (jobRow && Number(completedCount?.cnt ?? 0) >= jobRow.workersNeeded) {
    await db.updateTable('jobs').set({ status: 'COMPLETED', updatedAt: new Date() }).where('id', '=', a.jobId).execute();
  }

  return listAssignmentView(assignmentId, userId);
}

export async function listAssignmentView(assignmentId: string, viewerId: string): Promise<AssignmentView> {
  const all = await listMyAssignments(viewerId);
  const found = all.find((a) => a.id === assignmentId);
  if (!found) throw notFound('Assignment not found');
  return found;
}

// ── Reviews (mutual, double-blind) ───────────────────────────────────────────

const REVIEW_REVEAL_DAYS = 7;

export async function submitReview(assignmentId: string, authorId: string, input: { rating: number; comment?: string | null; tags?: string[] }) {
  const db = getDb();
  const a = await db.selectFrom('assignments').selectAll().where('id', '=', assignmentId).executeTakeFirst();
  if (!a) throw notFound('Assignment not found');
  if (!['COMPLETED', 'PAID'].includes(a.status)) throw conflict('Reviews unlock after the assignment is completed');

  const subjectId = a.workerId === authorId ? a.employerId : a.employerId === authorId ? a.workerId : null;
  if (!subjectId) throw forbidden('Not a participant of this assignment');

  const existing = await db
    .selectFrom('reviews')
    .select('id')
    .where('assignmentId', '=', assignmentId)
    .where('authorId', '=', authorId)
    .executeTakeFirst();
  if (existing) throw conflict('You already reviewed this assignment');

  const id = newId();
  await db
    .insertInto('reviews')
    .values({ id, assignmentId, authorId, subjectId, rating: input.rating, comment: input.comment ?? null, tags: jsonb(input.tags ?? []) })
    .execute();

  await tryPublishReviews(assignmentId);

  await notify({
    userId: subjectId,
    type: 'REVIEW_RECEIVED',
    title: 'You received a review',
    body: `${'★'.repeat(input.rating)} on a completed job`,
    linkPath: `/users/${subjectId}`,
    dedupeKey: `review:${id}`,
  });

  return { id, hiddenUntilMutual: true };
}

/** Double-blind reveal: publish once both sides submit, or 7 days after the first. */
export async function tryPublishReviews(assignmentId: string): Promise<void> {
  const db = getDb();
  const reviews = await db.selectFrom('reviews').selectAll().where('assignmentId', '=', assignmentId).execute();
  const a = await db.selectFrom('assignments').select(['workerId', 'employerId']).where('id', '=', assignmentId).executeTakeFirst();
  if (!a) return;

  const both = [a.workerId, a.employerId].every((uid) => reviews.some((r) => r.authorId === uid));
  const first = reviews.reduce<Date | null>((acc, r) => (acc === null || r.createdAt < acc ? r.createdAt : acc), null);
  const weekPassed = first !== null && Date.now() - first.getTime() > REVIEW_REVEAL_DAYS * 24 * 3600 * 1000;

  if (both || weekPassed) {
    await db
      .updateTable('reviews')
      .set({ publishedAt: new Date() })
      .where('assignmentId', '=', assignmentId)
      .where('publishedAt', 'is', null)
      .execute();
  }
}

export async function reviewState(assignmentId: string, viewerId: string) {
  const db = getDb();
  const rows = await db
    .selectFrom('reviews')
    .select(['authorId'])
    .where('assignmentId', '=', assignmentId)
    .execute();
  if (!rows.length) return null;
  return { byViewer: rows.some((r) => r.authorId === viewerId), byOther: rows.some((r) => r.authorId !== viewerId) };
}

export async function myApplications(userId: string, status?: string) {
  const db = getDb();
  let q = db
    .selectFrom('applications')
    .innerJoin('jobs', 'jobs.id', 'applications.jobId')
    .leftJoin('jobImages', (join) => join.onRef('jobImages.jobId', '=', 'jobs.id').on('jobImages.position', '=', sql.lit(0)))
    .select([
      'applications.id',
      'applications.status',
      'applications.createdAt',
      'jobs.id as jobId',
      'jobs.title as jobTitle',
      'jobs.payType',
      'jobs.payAmountMinor',
      'jobs.currency',
      'jobs.startAt',
      'jobs.city',
      'jobImages.url as jobImageUrl',
    ])
    .where('applications.workerId', '=', userId)
    .orderBy('applications.createdAt', 'desc')
    .limit(100);
  if (status) q = q.where('applications.status', '=', status);

  const rows = await q.execute();
  return rows.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    jobTitle: r.jobTitle,
    jobPayType: r.payType,
    jobPayAmountMinor: Number(r.payAmountMinor),
    currency: r.currency,
    jobStartAt: r.startAt.toISOString(),
    jobCity: r.city,
    jobImageUrl: r.jobImageUrl,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
}
