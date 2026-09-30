# WorkLink — Agent Handoff

Status: ~95% built. API typechecks clean, 14/14 unit tests pass. One root-cause bug was mid-fix. Follow this doc top-to-bottom.

## Stack & environment (this machine)
- Windows + Git Bash. Node 24, npm 11. **No Docker installed** — always use `corepack pnpm` (pnpm comes via corepack). Example: `corepack pnpm install`, `corepack pnpm --filter @worklink/api test`.
- Database: **embedded Postgres** auto-starts from the API process (no install needed). Redis is optional; an in-memory KV fallback activates automatically.
- Workspace root: the repo root (monorepo: `apps/api`, `apps/web`, `packages/types`, `infra`).

## Commands
```bash
corepack pnpm install                          # deps (already done once)
corepack pnpm --filter @worklink/types build   # rebuild shared types after editing packages/types
corepack pnpm --filter @worklink/api typecheck # tsc --noEmit (currently clean)
corepack pnpm --filter @worklink/web typecheck # tsc --noEmit (currently clean)
corepack pnpm --filter @worklink/api test      # vitest: index.test.ts (14 ✓) + journey.test.ts (integration)
corepack pnpm --filter @worklink/api seed      # demo data: 30 users, 60 jobs; login demo@worklink.app / Worklink1
corepack pnpm --filter @worklink/api dev       # API on :4000
corepack pnpm --filter @worklink/web dev       # Web on :3000
```
Payments are deliberately OFF (`PAYMENTS_ENABLED=0` default). Leave it that way for now.

## Where the last session stopped
The integration journey (`src/journey.test.ts`) was red: **every test fails because signup returns 500**, which cascades (no session → every later step 401s).

Root cause (already diagnosed, fix was mid-flight):
- Postgres **jsonb** columns reject the JS-array wire format the `pg` driver sends (`{"English"}` instead of `["English"]`) → `invalid input syntax for type json` on any insert/update where a JS **array** is written to a **jsonb** column.
- Fix pattern: wrap array values in `jsonb(...)` from `apps/api/src/lib/jsonb.ts` (a JSON.stringify helper) at every write site. Objects are fine as-is; only arrays need it.

Progress at stop — `jsonb()` applied at these sites (verify they're present, don't redo):
- `services/auth/auth-service.ts` — signup profile insert (skills/languages/education/experience)
- `routes/users.routes.ts` — PATCH /users/me (same four fields)
- `services/jobs-service.ts` — create + update jobs (`skillsRequired`)
- `services/work-service.ts` — review insert (`tags`)
- `services/chat-service.ts` — message insert + system message (`attachments`)

Remaining sites still to fix (last task in progress when stopped):
- `apps/api/src/db/seed.ts` — four spots:
  - profile insert: `skills:` (Array.from block, ends with the `as Array<...>` cast), `languages: [pick(...), 'English']`, `education: [] as unknown[]`, `experience: [] as unknown[]`
  - jobs insert: `skillsRequired: Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => pick(SKILLS, rnd))`
  - reviews insert: `tags: ['punctual', 'hardworking']`
  - messages insert: both rows' `attachments: []`
  - Add `import { jsonb } from '../lib/jsonb.js';` (seed.ts is in src/db/).
- Also grep for any other array→jsonb writes missed: `corepack pnpm --filter @worklink/api exec rg -n "(skills|languages|education|experience|tags|attachments|skillsRequired):" apps/api/src --type ts` and check each.

## Related fix already applied (keep)
- Embedded Postgres has no PostGIS: migration now probes `pg_available_extensions` before `CREATE EXTENSION postgis`, and `jobs.location` (geography column + GiST index + trigger) is only created when PostGIS exists. Haversine fallback `wl_distance_km()` works everywhere. Do not reintroduce unconditional `geography` DDL.

## Verification steps after the jsonb fixes
1. `corepack pnpm --filter @worklink/api test` → all journey tests should go green (signup 201, verify-otp, profile PATCH, job post, feed, apply, shortlist/accept → assignment, logs, complete, double-blind reviews, search, report/block, refresh rotation). If individual ones still fail after signup passes, fix them as separate bugs — but expect the cascade to clear.
2. `corepack pnpm --filter @worklink/api seed` then `corepack pnpm --filter @worklink/api dev` + `corepack pnpm --filter @worklink/web dev` → open http://localhost:3000, login with demo@worklink.app / Worklink1, check the feed renders seeded jobs.
3. Full journey smoke in the browser: create account → post job → apply → accept → chat → complete → review.

## Known non-blockers / next steps after it runs
- Web app pages exist (feed, job detail, create wizard, search, my-work, chat, notifications, profile, settings, admin, safety, earnings) but were only typechecked, not manually exercised — click through and fix UX bugs as found.
- `run_file_change_hooks` / lint: ESLint config exists but has not been run across the repo yet.
- Playwright E2E (§9) is not yet written; journey.test.ts covers the API-level journey.
- Docs: README/ARCHITECTURE/DECISIONS/COMPLIANCE/Postman collection still to finalize (see BUILD PROMPT §9 deliverables).
