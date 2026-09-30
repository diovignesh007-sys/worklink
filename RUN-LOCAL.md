# Run WorkLink locally (Windows / VS Code, no Docker)

## TL;DR — 3 commands
```bash
corepack pnpm install                          # once
corepack pnpm --filter @worklink/api db:seed   # once (demo data + demo login)
corepack pnpm --filter @worklink/api dev & corepack pnpm --filter @worklink/web dev
```
Open **http://localhost:3000** — API runs on **http://localhost:4000** (docs: /docs).

Demo login: **demo@worklink.app / Worklink1**

## Option A — VS Code UI (recommended)

1. Open the workspace root folder in VS Code.
2. **Terminal → Run Task…** → pick:
   - `setup: install + seed` — first time only
   - `dev (API + Web)` — starts both servers (each in its own terminal)
3. Ctrl+Click the printed `http://localhost:3000` to open the app.

**Debugging with breakpoints:** press **F5** and choose **"Full stack (API + Web)"** —
both servers start under the debugger; breakpoints in `apps/api/src/**` and
`apps/web/src/**` just work. The API config auto-opens `http://localhost:4000/docs`
when the server is ready.

## Option B — two terminals

Terminal 1 (API):
```bash
corepack pnpm --filter @worklink/api dev
```
Terminal 2 (Web):
```bash
corepack pnpm --filter @worklink/web dev
```

## What runs where

| Thing | Where | Notes |
|---|---|---|
| Web (Next.js) | http://localhost:3000 | `apps/web` |
| API (Fastify) | http://localhost:4000 | `apps/api`; Swagger UI at /docs |
| OpenAPI JSON | http://localhost:4000/api/v1/openapi.json | |
| Postgres | **embedded**, auto-started by the API on port **5433** | data in `apps/api/.db/` — nothing to install |
| Redis | not needed | in-memory fallback activates automatically |
| Payments | disabled | `PAYMENTS_ENABLED=0` by design for now |

## Common commands

```bash
corepack pnpm --filter @worklink/api test      # unit + integration journey (29 tests)
corepack pnpm --filter @worklink/api typecheck # strict TS check
corepack pnpm --filter @worklink/web typecheck
node scripts/smoke.mjs                         # boots stack, probes 12 endpoints, tears down
corepack pnpm --filter @worklink/api db:seed   # demo data (skips if demo@worklink.app exists)
```

## Reset the database
Stop the API, then:
```bash
rm -rf apps/api/.db
corepack pnpm --filter @worklink/api db:seed
```

## Troubleshooting
- **Port 3000/4000 in use** — a previous `next`/node process is still alive:
  `netstat -ano | findstr :3000` → `taskkill /F /PID <pid>` (and `:4000` for the API).
- **Login says "Invalid credentials"** — run the seed task; check `demo@worklink.app` exists.
- **Web compiles but pages 500 with `Can't resolve './globals.css'`** — fixed already; if it
  reappears, the import in `apps/web/src/app/layout.tsx` was reverted.
- **pnpm not found** — always prefix with `corepack` (ships with Node 24).
