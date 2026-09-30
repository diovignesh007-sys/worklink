import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { applicationActionSchema, createLogSchema, reviewSchema, uuidSchema } from '@worklink/types';
import { validate } from '../lib/validate.js';
import { getDb } from '../db/db.js';
import {
  actOnApplication,
  listMyAssignments,
  submitLog,
  decideLog,
  completeAssignment,
  submitReview,
  reviewState,
  myApplications,
} from '../services/work-service.js';
import { notFound, forbidden } from '../lib/errors.js';

export default async function workRoutes(app: FastifyInstance) {
  app.get('/me/applications', async (req) => {
    const claims = req.auth();
    const q = req.query as { status?: string };
    return myApplications(claims.sub, q.status);
  });

  app.patch('/applications/:id', async (req) => {
    const claims = req.auth();
    const input = validate(applicationActionSchema, req.body);
    return actOnApplication((req.params as { id: string }).id, claims.sub, input.action);
  });

  app.get('/me/assignments', async (req) => {
    const claims = req.auth();
    return listMyAssignments(claims.sub);
  });

  app.post('/assignments/:id/logs', async (req, reply) => {
    const claims = req.auth();
    const input = validate(createLogSchema, req.body);
    const log = await submitLog((req.params as { id: string }).id, claims.sub, input);
    reply.code(201);
    return log;
  });

  app.post('/assignments/:id/logs/:logId/decision', async (req) => {
    const claims = req.auth();
    const input = validate(z.object({ decision: z.enum(['APPROVE', 'REJECT']) }), req.body);
    return decideLog((req.params as { id: string }).id, (req.params as { logId: string }).logId, claims.sub, input.decision);
  });

  app.post('/assignments/:id/complete', async (req) => {
    const claims = req.auth();
    return completeAssignment((req.params as { id: string }).id, claims.sub);
  });

  app.post('/assignments/:id/reviews', async (req, reply) => {
    const claims = req.auth();
    const input = validate(reviewSchema, req.body);
    const result = await submitReview((req.params as { id: string }).id, claims.sub, input);
    reply.code(201);
    return result;
  });

  app.get('/assignments/:id/review-state', async (req) => {
    const claims = req.auth();
    return reviewState((req.params as { id: string }).id, claims.sub);
  });
}
