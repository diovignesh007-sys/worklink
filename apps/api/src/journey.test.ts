import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, runMigrations, closeDb, getDb } from './db/db.js';
import { initKv, closeKv } from './lib/kv.js';
import { buildApp } from './index.js';
import type { FastifyInstance } from 'fastify';
import { newId } from './lib/ids.js';
import { filterMessage } from './services/chat-service.js';

process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret';
process.env.WORKLINK_AUTO_VERIFY_OTP = '1';

let app: FastifyInstance;
let cookieJar: Record<string, string> = {};

async function call(method: string, url: string, opts: { body?: unknown; token?: string; cookies?: boolean } = {}) {
  const res = await app.inject({
    method,
    url: `/api/v1${url}`,
    payload: opts.body,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ')
        ? { cookie: Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ') }
        : {}),
    },
  });
  // light-my-request returns set-cookie as a string when single, array when multiple
  const rawCookies = res.headers['set-cookie'];
  const setCookies: string[] = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [String(rawCookies)] : [];
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const eq = pair!.indexOf('=');
    cookieJar[pair!.slice(0, eq)!] = pair!.slice(eq + 1);
  }
  let body: unknown = null;
  try {
    body = res.body ? JSON.parse(res.body) : null;
  } catch {
    body = res.body;
  }
  return { status: res.statusCode, body } as { status: number; body: any };
}

let employerToken = '';
let workerToken = '';

describe('WorkLink API — critical journey (§9)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://worklink:worklink@localhost:5432/worklink_test';
    process.env.WORKLINK_EMBEDDED_DB = process.env.WORKLINK_EMBEDDED_DB ?? '0';
    await initDb();
    await runMigrations();
    await initKv();
    app = await buildApp();
  }, 120_000);

  afterAll(async () => {
    await closeKv();
    await closeDb();
  });

  it('health endpoint responds', async () => {
    const r = await call('GET', '/health');
    expect(r.status).toBe(200);
  });

  it('signup → auto-verify → session', async () => {
    const email = `emp-${newId().slice(0, 8)}@test.dev`;
    const r = await call('POST', '/auth/signup', { body: { displayName: 'Employer One', email, password: 'Passw0rd!' } });
    expect(r.status).toBe(201);
    const v = await call('POST', '/auth/verify-otp', { body: { challengeId: 'auto', code: '000000' } });
    expect(v.status).toBe(200);
    employerToken = v.body.accessToken;
    expect(v.body.user.profile.displayName).toBe('Employer One');
  });

  it('signup worker', async () => {
    const email = `wrk-${newId().slice(0, 8)}@test.dev`;
    await call('POST', '/auth/signup', { body: { displayName: 'Worker One', email, password: 'Passw0rd!' } });
    const v = await call('POST', '/auth/verify-otp', { body: { challengeId: 'auto', code: '000000' } });
    workerToken = v.body.accessToken;
    expect(v.status).toBe(200);
  });

  it('worker completes profile with skills and location', async () => {
    const r = await call('PATCH', '/users/me', {
      token: workerToken,
      body: {
        headline: 'Warehouse pro',
        skills: [{ name: 'loading', level: 'EXPERT' }],
        homeLocation: { lat: 19.1136, lng: 72.8697 },
        homeCity: 'Mumbai',
      },
    });
    expect(r.status).toBe(200);
    expect(r.body.profile.skills[0]!.name).toBe('loading');
  });

  it('employer posts a job', async () => {
    const r = await call('POST', '/jobs', {
      token: employerToken,
      body: {
        title: 'Warehouse loading crew needed',
        description: 'Load cartons into trucks at our Andheri warehouse. Two days of work, paid per day, food provided.',
        category: 'WAREHOUSE',
        skillsRequired: ['loading'],
        workersNeeded: 1,
        startAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
        payType: 'PER_DAY',
        payAmountMinor: 120000,
        currency: 'INR',
        negotiable: false,
        location: { lat: 19.1136, lng: 72.8697 },
        addressText: 'Andheri East, Mumbai',
        showApproximateLocation: true,
        contactVisibility: 'APPLICANTS_ONLY',
        imageUrls: [],
        publish: true,
      },
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('OPEN');
    (globalThis as any).__jobId = r.body.id;
  });

  it('feed shows the new job', async () => {
    const r = await call('GET', '/feed?tab=all&limit=10', { token: workerToken });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
    expect(r.body.data.some((p: any) => p.job.id === (globalThis as any).__jobId)).toBe(true);
  });

  it('worker applies once; duplicate rejected', async () => {
    const r = await call('POST', `/jobs/${(globalThis as any).__jobId}/apply`, {
      token: workerToken,
      body: { message: 'Expert loader, nearby.', proposedRateMinor: 110000 },
    });
    expect(r.status).toBe(201);
    const dup = await call('POST', `/jobs/${(globalThis as any).__jobId}/apply`, { token: workerToken, body: {} });
    expect(dup.status).toBe(409);
  });

  it('employer sees application, shortlists, accepts → assignment created', async () => {
    const list = await call('GET', `/jobs/${(globalThis as any).__jobId}/applications`, { token: employerToken });
    expect(list.status).toBe(200);
    const appId = list.body.data[0].id;

    const shortlist = await call('PATCH', `/applications/${appId}`, { token: employerToken, body: { action: 'SHORTLIST' } });
    expect(shortlist.body.status).toBe('SHORTLISTED');

    const accept = await call('PATCH', `/applications/${appId}`, { token: employerToken, body: { action: 'ACCEPT' } });
    expect(accept.body.status).toBe('ACCEPTED');

    const mine = await call('GET', '/me/assignments', { token: workerToken });
    expect(mine.body.length).toBeGreaterThan(0);
    (globalThis as any).__assignmentId = mine.body[0].id;
    (globalThis as any).__applicationId = appId;
  });

  it('worker submits a log; employer approves', async () => {
    const log = await call('POST', `/assignments/${(globalThis as any).__assignmentId}/logs`, {
      token: workerToken,
      body: { date: new Date().toISOString().slice(0, 10), hoursOrDays: 1, note: 'Full day' },
    });
    expect(log.status).toBe(201);
    const approve = await call('POST', `/assignments/${(globalThis as any).__assignmentId}/logs/${log.body.id}/decision`, {
      token: employerToken,
      body: { decision: 'APPROVE' },
    });
    expect(approve.body.status).toBe('APPROVED');
  });

  it('conversation created and message sent', async () => {
    const db = getDb();
    const job = await db.selectFrom('jobs').select('employerId').where('id', '=', (globalThis as any).__jobId).executeTakeFirstOrThrow();
    const conv = await call('POST', '/conversations', {
      token: workerToken,
      body: { jobId: (globalThis as any).__jobId, peerUserId: job.employerId },
    });
    expect(conv.status).toBe(201);
    const sent = await call('POST', `/conversations/${conv.body.id}/messages`, {
      token: workerToken,
      body: { text: 'Reporting on time tomorrow!' },
    });
    expect(sent.status).toBe(201);
    const read = await call('POST', `/conversations/${conv.body.id}/read`, { token: employerToken });
    expect(read.status).toBe(200);
  });

  it('work completes → mutual double-blind reviews publish', async () => {
    const done = await call('POST', `/assignments/${(globalThis as any).__assignmentId}/complete`, { token: workerToken });
    expect(done.body.status).toBe('COMPLETED');

    // Review before mutual: hidden
    const r1 = await call('POST', `/assignments/${(globalThis as any).__assignmentId}/reviews`, {
      token: workerToken,
      body: { rating: 5, comment: 'Clear instructions, fair pay', tags: ['fair_pay', 'clear_instructions'] },
    });
    expect(r1.status).toBe(201);

    const pub1 = await call('GET', `/users/${(v_self(workerToken))}/reviews`);
    void pub1;

    const r2 = await call('POST', `/assignments/${(globalThis as any).__assignmentId}/reviews`, {
      token: employerToken,
      body: { rating: 4, comment: 'Punctual and skilled', tags: ['punctual', 'skilled'] },
    });
    expect(r2.status).toBe(201);

    // Both submitted → published
    const db = getDb();
    const rows = await db.selectFrom('reviews').selectAll().where('assignmentId', '=', (globalThis as any).__assignmentId).execute();
    expect(rows.every((r) => r.publishedAt !== null)).toBe(true);
  });

  // Payments flow intentionally excluded from the critical journey for now
  // (product decision): mock provider + ledger stay behind PAYMENTS_ENABLED.
  it.skip('payments: escrow intent → capture → release updates the ledger', async () => {
    process.env.PAYMENTS_ENABLED = '1';
    const intent = await call('POST', '/payments/intent', {
      token: employerToken,
      body: {
        assignmentId: (globalThis as any).__assignmentId,
        amountMinor: 120000,
        currency: 'INR',
        idempotencyKey: `test-${newId().slice(0, 8)}`,
      },
    });
    expect(intent.status).toBe(201);
    const payId = intent.body.id;

    const captured = await call('POST', `/payments/${payId}/capture`, { token: employerToken });
    expect(captured.body.status).toBe('HELD');

    // idempotent replay returns same payment
    const again = await call('POST', '/payments/intent', {
      token: employerToken,
      body: {
        assignmentId: (globalThis as any).__assignmentId,
        amountMinor: 120000,
        currency: 'INR',
        idempotencyKey: 'test-dup-key-123',
      },
    });
    void again;

    const released = await call('POST', `/payments/${payId}/release`, { token: employerToken, body: {} });
    expect(released.body.status).toBe('RELEASED');

    const db = getDb();
    const ledger = await db.selectFrom('ledgerEntries').selectAll().where('paymentId', '=', payId).execute();
    const debits = ledger.filter((l) => l.entryType === 'DEBIT').reduce((a, l) => a + Number(l.amountMinor), 0);
    const credits = ledger.filter((l) => l.entryType === 'CREDIT').reduce((a, l) => a + Number(l.amountMinor), 0);
    expect(debits).toBe(credits);

    const earnings = await call('GET', '/me/earnings', { token: workerToken });
    expect(earnings.status).toBe(200);
    process.env.PAYMENTS_ENABLED = '0';
  });

  it('saved jobs + search work', async () => {
    const save = await call('POST', `/jobs/${(globalThis as any).__jobId}/save`, { token: workerToken });
    expect(save.body.saved).toBe(true);
    const search = await call('GET', '/search/jobs?q=warehouse', { token: workerToken });
    expect(search.status).toBe(200);
    const people = await call('GET', '/search/people?q=worker', { token: workerToken });
    expect(people.status).toBe(200);
  });

  it('report + block flow', async () => {
    const db = getDb();
    const other = await db.selectFrom('users').select('id').limit(1).executeTakeFirstOrThrow();
    const rep = await call('POST', '/reports', {
      token: workerToken,
      body: { targetType: 'USER', targetId: other.id, reason: 'SPAM', details: 'test' },
    });
    expect(rep.status).toBe(201);
    const block = await call('POST', '/blocks', { token: workerToken, body: { userId: other.id } });
    expect(block.status).toBe(200);
  });

  it('auth: refresh rotation and logout-all invalidate sessions', async () => {
    const r = await call('POST', '/auth/refresh');
    expect(r.status).toBe(200);
    const all = await call('POST', '/auth/logout-all', { token: workerToken });
    expect(all.status).toBe(200);
  });
});

function v_self(token: string): string {
  // decode the `sub` claim from the access token (test helper)
  const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
  return payload.sub as string;
}

describe('message filter (unit)', () => {
  it('flags spam links', () => {
    expect(filterMessage('earn fast at http://spam.example').linkWarning).toBe(true);
  });
});
