import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodType } from 'zod';
import { env } from './config/env.js';
import { initDb, closeDb, runMigrations } from './db/db.js';
import { initKv, closeKv } from './lib/kv.js';
import { AppError } from './lib/errors.js';
import authPlugin from './plugins/auth.js';
import { openApiSpec } from './openapi.js';
import { attachRealtime, type RealtimeBus } from './realtime/bus.js';
import { sweepExpiredJobs } from './services/jobs-service.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import jobsRoutes from './routes/jobs.routes.js';
import workRoutes from './routes/work.routes.js';
import chatRoutes from './routes/chat.routes.js';
import miscRoutes from './routes/misc.routes.js';
import uploadRoutes from './routes/uploads.routes.js';
import paymentRoutes from './routes/payments.routes.js';
import adminRoutes from './routes/admin.routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    wlBus: RealtimeBus;
  }
}

/** Shared holder for the realtime bus; bound in start(), null before that. */
export const chatDeps: { ws: import('./services/chat-service.js').WsDeps | null } = { ws: null };

export async function buildApp() {
  const app = Fastify({
    logger: { level: env.logLevel, transport: env.isProd ? undefined : { target: 'pino-pretty' } },
    trustProxy: true,
    bodyLimit: 12 * 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || env.corsOrigins.includes(origin) || env.corsOrigins.includes('*')) return cb(null, true);
      cb(new Error('CORS: origin not allowed'), false);
    },
    credentials: true,
  });
  await app.register(cookie, { secret: env.jwtRefreshSecret });
  await app.register(multipart, { limits: { fileSize: env.maxUploadMb * 1024 * 1024 } });
  await app.register(rateLimit, { global: false });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'WorkLink API',
        description: 'Short-term & permanent manual-work marketplace — v1',
        version: '1.0.0',
      },
      servers: [{ url: '/api/v1' }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(authPlugin);

  // Consistent error envelope (§8)
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      reply.code(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    if (err.validation) {
      reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.validation } });
      return;
    }
    const statusCode = err.statusCode ?? 500;
    if (statusCode === 429) {
      reply.code(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
      return;
    }
    req.log.error({ err }, 'unhandled error');
    reply.code(500).send({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.get('/api/v1/health', async () => ({ status: 'ok', time: new Date().toISOString() }));
  app.get('/api/v1/openapi.json', async () => openApiSpec);

  const prefix = '/api/v1';
  await app.register(authRoutes, { prefix });
  await app.register(usersRoutes, { prefix });
  await app.register(jobsRoutes, { prefix });
  await app.register(workRoutes, { prefix });
  await app.register(miscRoutes, { prefix });
  await app.register(uploadRoutes, { prefix });
  await app.register(paymentRoutes, { prefix });
  await app.register(adminRoutes, { prefix });

  // Chat routes need the realtime bus → a shared mutable holder lets chat
  // routes register up-front (so they exist for tests/inject) while the bus
  // binds itself when start() attaches Socket.IO. Before that, emits are
  // silently dropped — correct, since no sockets are connected yet.
  await chatRoutes(app, { prefix, ws: chatDeps.ws as import('./services/chat-service.js').WsDeps });

  return app;
}

export async function start() {
  await initDb();
  await runMigrations();
  await initKv();

  // Fresh deployments get demo content automatically (skips when demo user
  // already exists). Disable with SEED_ON_BOOT=0.
  if (process.env.SEED_ON_BOOT !== '0') {
    try {
      const { seedIfEmpty } = await import('./db/seed.js');
      await seedIfEmpty();
    } catch (err) {
      console.warn('[api] seed-on-boot skipped:', err instanceof Error ? err.message : err);
    }
  }

  const app = await buildApp();

  // Attach Socket.IO to the raw server and wire chat + bus
  const server = app.server;
  const bus = attachRealtime(server as never);
  app.wlBus = bus;
  chatDeps.ws = bus;

  // Background sweeps (job expiry). BullMQ in prod; a simple interval here.
  const sweep = setInterval(() => {
    sweepExpiredJobs().catch(() => undefined);
  }, 60 * 60 * 1000);

  await app.listen({ port: env.apiPort, host: '0.0.0.0' });
  console.log(`[api] listening on :${env.apiPort} (docs at /docs)`);

  const shutdown = async () => {
    clearInterval(sweep);
    await app.close().catch(() => {});
    await closeKv();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run when executed directly
if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  start().catch((err) => {
    console.error('[api] failed to start:', err);
    process.exit(1);
  });
}
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  start().catch((err) => {
    console.error('[api] failed to start:', err);
    process.exit(1);
  });
}
