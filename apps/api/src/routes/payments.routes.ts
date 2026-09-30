import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { paymentIntentSchema } from '@worklink/types';
import { validate } from '../lib/validate.js';
import { env } from '../config/env.js';
import { createIntent, capture, release, refund, handleWebhook, assignmentPayments, myEarnings } from '../services/payments/payments-service.js';
import { forbidden } from '../lib/errors.js';

export default async function paymentRoutes(app: FastifyInstance) {
  app.get('/payments/config', async () => {
    return {
      enabled: env.paymentsEnabled,
      provider: env.paymentProvider,
      canAccept: env.paymentsEnabled && (env.paymentProvider !== 'razorpay' || Boolean(env.razorpayKeyId)),
    };
  });

  const guard = async () => {
    if (!env.paymentsEnabled) throw forbidden('Payments are disabled (feature flag PAYMENTS_ENABLED=0)');
  };

  app.post('/payments/intent', { preHandler: guard }, async (req, reply) => {
    const claims = req.auth();
    const input = validate(paymentIntentSchema, req.body);
    const result = await createIntent(claims.sub, input);
    reply.code(201);
    return result;
  });

  app.post('/payments/:id/capture', { preHandler: guard }, async (req) => {
    const claims = req.auth();
    return capture((req.params as { id: string }).id, claims.sub);
  });

  app.post('/payments/:id/release', { preHandler: guard }, async (req) => {
    const claims = req.auth();
    const parsed = z.object({ amountMinor: z.number().int().min(1).optional() }).default({}).parse(req.body ?? {});
    return release((req.params as { id: string }).id, claims.sub, parsed.amountMinor);
  });

  app.post('/payments/:id/refund', { preHandler: guard }, async (req) => {
    const claims = req.auth();
    return refund((req.params as { id: string }).id, claims.sub);
  });

  app.get('/assignments/:id/payments', { preHandler: guard }, async (req) => {
    const claims = req.auth();
    return assignmentPayments((req.params as { id: string }).id, claims.sub);
  });

  app.get('/me/earnings', { preHandler: guard }, async (req) => {
    const claims = req.auth();
    return myEarnings(claims.sub);
  });

  // Signed webhook with replay protection (§5.9)
  app.post('/webhooks/:provider', async (req, reply) => {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const signature = (req.headers['x-razorpay-signature'] as string) ?? (req.headers['x-webhook-signature'] as string) ?? null;
    const result = await handleWebhook((req.params as { provider: string }).provider, raw, signature);
    reply.code(result.received ? 200 : 400);
    return result;
  });
}
