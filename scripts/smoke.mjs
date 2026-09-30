#!/usr/bin/env node
/**
 * Self-contained smoke test (no Docker needed):
 *   node scripts/smoke.mjs
 * Boots the API (embedded Postgres) and the Next.js web server, probes the
 * health endpoint, OpenAPI docs, login and feed with the seeded demo user,
 * then tears everything down.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.cwd();
const API_URL = 'http://localhost:4000';
const WEB_URL = 'http://localhost:3000';

const procs = [];
function run(name, cmd, args, opts = {}) {
  const p = spawn(cmd, args, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  p.stdout.on('data', (d) => process.env.SMOKE_VERBOSE && process.stdout.write(`[${name}] ${d}`));
  p.stderr.on('data', (d) => process.env.SMOKE_VERBOSE && process.stderr.write(`[${name}] ${d}`));
  procs.push(p);
  return p;
}

async function waitFor(url, label, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch { /* not up yet */ }
    await sleep(1500);
    process.stdout.write('.');
  }
  throw new Error(`timeout waiting for ${label} (${url})`);
}

let failures = 0;
function check(label, cond, extra = '') {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${cond ? '' : ` — ${extra}`}`);
  if (!cond) failures++;
}

try {
  const alreadyUp = async (url) => {
    try { return (await fetch(url)).ok; } catch { return false; }
  };

  if (await alreadyUp(`${API_URL}/api/v1/health`)) {
    console.log('▸ API already running — reusing');
  } else {
    console.log('▸ starting API (embedded Postgres)…');
    run('api', 'corepack pnpm --filter @worklink/api dev', [], { cwd: root });
    process.stdout.write('  waiting for API');
    await waitFor(`${API_URL}/api/v1/health`, 'API');
    console.log(' ok');
  }

  if (await alreadyUp(WEB_URL)) {
    console.log('▸ web already running — reusing');
  } else {
    console.log('▸ starting web…');
    run('web', 'corepack pnpm --filter @worklink/web dev', [], { cwd: root });
    process.stdout.write('  waiting for web');
    await waitFor(`${WEB_URL}/`, 'web');
    console.log(' ok');
  }

  // ── API probes ──────────────────────────────────────────────────────────
  const health = await fetch(`${API_URL}/api/v1/health`).then((r) => r.json());
  check('API health', health.status === 'ok');

  const openapi = await fetch(`${API_URL}/api/v1/openapi.json`).then((r) => r.json());
  check('OpenAPI spec served', Boolean(openapi?.openapi || openapi?.swagger));
  check('OpenAPI lists /feed', Boolean(openapi?.paths?.['/feed']));

  // login as the seeded demo user
  const login = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'demo@worklink.app', password: 'Worklink1' }),
  });
  check('demo login works', login.status === 200, `status ${login.status}`);
  const { accessToken } = await login.json();

  // feed with auth
  const feed = await fetch(`${API_URL}/api/v1/feed?tab=all`, { headers: { authorization: `Bearer ${accessToken}` } });
  const feedBody = await feed.json();
  check('feed returns data', feed.status === 200 && Array.isArray(feedBody.data));
  check('feed has seeded jobs', (feedBody.data?.length ?? 0) > 0, `got ${feedBody.data?.length} items`);
  const first = feedBody.data?.[0];
  check(
    'feed item shape (title/pay/distance/employer)',
    first && typeof first.job?.title === 'string' && typeof first.job?.payAmountMinor === 'number' && typeof first.job?.distanceKm === 'number' && typeof first.job?.employer?.displayName === 'string' && typeof first.saved === 'boolean' && typeof first.applied === 'boolean',
    JSON.stringify(first)?.slice(0, 120),
  );

  // search
  const search = await fetch(`${API_URL}/api/v1/search/jobs?q=`, { headers: { authorization: `Bearer ${accessToken}` } });
  check('search endpoint', search.status === 200);

  // notifications
  const notifs = await fetch(`${API_URL}/api/v1/notifications`, { headers: { authorization: `Bearer ${accessToken}` } });
  check('notifications endpoint', notifs.status === 200);

  // conversations list
  const convs = await fetch(`${API_URL}/api/v1/conversations`, { headers: { authorization: `Bearer ${accessToken}` } });
  check('conversations endpoint', convs.status === 200);

  // ── Web probes ──────────────────────────────────────────────────────────
  const webRes = await fetch(WEB_URL);
  const html = await webRes.text();
  check('web home renders', webRes.status === 200 && html.includes('<html'));
  check('web home is the feed shell', /id="__next"|_next\/static/.test(html));
  const loginPage = await fetch(`${WEB_URL}/login`);
  check('login page renders', loginPage.status === 200);

  console.log(`\n${failures === 0 ? '✅ SMOKE PASSED' : `❌ ${failures} SMOKE FAILURE(S)`}`);
} finally {
  console.log('▸ tearing down…');
  for (const p of procs) {
    p.kill('SIGTERM');
    setTimeout(() => p.kill('SIGKILL'), 3000).unref();
  }
  await sleep(1000);
}
process.exit(failures === 0 ? 0 : 1);
