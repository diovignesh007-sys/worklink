import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../lib/validate.js';
import { getDb } from '../db/db.js';
import { newId } from '../lib/ids.js';
import { audit } from '../services/notify.js';

export default async function adminRoutes(app: FastifyInstance) {
  // Every route calls req.requireAdmin() (plugin-provided).
  app.get('/admin/reports', async (req) => {
    req.requireAdmin();
    const q = req.query as { status?: string };
    const db = getDb();
    let query = db
      .selectFrom('reports')
      .innerJoin('profiles', 'profiles.userId', 'reports.reporterId')
      .select([
        'reports.id',
        'reports.targetType',
        'reports.targetId',
        'reports.reason',
        'reports.details',
        'reports.status',
        'reports.createdAt',
        'reports.reporterId',
        'profiles.displayName',
      ])
      .orderBy('reports.createdAt', 'desc')
      .limit(100);
    if (q.status) query = query.where('reports.status', '=', q.status);
    const rows = await query.execute();
    return {
      data: rows.map((r) => ({
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        details: r.details,
        reporter: { id: r.reporterId, displayName: r.displayName },
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { nextCursor: null },
    };
  });

  app.post('/admin/reports/:id/decision', async (req) => {
    const claims = req.requireAdmin();
    const input = validate(z.object({ decision: z.enum(['DISMISS', 'ACTION']) }), req.body);
    const db = getDb();
    const id = (req.params as { id: string }).id;
    await db
      .updateTable('reports')
      .set({ status: input.decision === 'DISMISS' ? 'DISMISSED' : 'ACTION_TAKEN', decidedAt: new Date() })
      .where('id', '=', id)
      .execute();
    await audit(claims.sub, `admin.report.${input.decision.toLowerCase()}`, 'REPORT', id);
    return { id, status: input.decision === 'DISMISS' ? 'DISMISSED' : 'ACTION_TAKEN' };
  });

  app.post('/admin/users/:id/status', async (req) => {
    const claims = req.requireAdmin();
    const input = validate(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'SHADOW_BANNED']) }), req.body);
    const db = getDb();
    const id = (req.params as { id: string }).id;
    await db.updateTable('users').set({ status: input.status, updatedAt: new Date() }).where('id', '=', id).execute();
    await audit(claims.sub, 'admin.user.status', 'USER', id, { status: input.status });
    return { id, status: input.status };
  });
}
