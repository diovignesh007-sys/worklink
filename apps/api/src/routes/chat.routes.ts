import type { FastifyInstance } from 'fastify';
import { createConversationSchema, sendMessageSchema, uuidSchema } from '@worklink/types';
import { validate } from '../lib/validate.js';
import { getOrCreateConversation, listConversations, getMessages, sendMessage, markRead } from '../services/chat-service.js';
import { getDb } from '../db/db.js';
import { notFound } from '../lib/errors.js';
import type { WsDeps } from '../services/chat-service.js';

export default async function chatRoutes(
  app: FastifyInstance,
  deps: { ws: WsDeps; prefix?: string },
) {
  const register = deps.prefix
    ? (fn: (scope: FastifyInstance) => Promise<void>) => app.register(fn, { prefix: deps.prefix })
    : (fn: (scope: FastifyInstance) => Promise<void>) => app.register(fn);

  await register(async (scope) => {
    scope.get('/conversations', async (req) => {
      const claims = req.auth();
      return listConversations(claims.sub);
    });

    scope.post('/conversations', async (req, reply) => {
      const claims = req.auth();
      const input = validate(createConversationSchema, req.body);
      const job = await getDb().selectFrom('jobs').select('id').where('id', '=', input.jobId).executeTakeFirst();
      if (!job) throw notFound('Job not found');
      const id = await getOrCreateConversation(input.jobId, claims.sub, input.peerUserId);
      reply.code(201);
      return { id };
    });

    scope.get('/conversations/:id/messages', async (req) => {
      const claims = req.auth();
      const q = req.query as { cursor?: string };
      return getMessages((req.params as { id: string }).id, claims.sub, q.cursor);
    });

    scope.post('/conversations/:id/messages', async (req, reply) => {
      const claims = req.auth();
      const input = validate(sendMessageSchema, req.body);
      const msg = await sendMessage((req.params as { id: string }).id, claims.sub, input, deps.ws);
      reply.code(201);
      return msg;
    });

    scope.post('/conversations/:id/read', async (req) => {
      const claims = req.auth();
      await markRead((req.params as { id: string }).id, claims.sub);
      return { ok: true };
    });
  });
}
