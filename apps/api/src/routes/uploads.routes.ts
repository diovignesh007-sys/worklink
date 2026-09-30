import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import {
  presignUpload,
  validateUpload,
  localSave,
  localRead,
  verifyLocalUploadToken,
  reencodeImage,
  type UploadPurpose,
} from '../services/storage.js';
import { getDb } from '../db/db.js';
import { env } from '../config/env.js';

const presignBody = z.object({
  filename: z.string().max(200).optional(),
  contentType: z.string().min(3).max(100),
  sizeBytes: z.number().int().min(1).max(50 * 1024 * 1024),
  purpose: z.enum(['AVATAR', 'COVER', 'JOB', 'CHAT', 'PORTFOLIO']),
});

export default async function uploadRoutes(app: FastifyInstance) {
  /** Issue a presigned upload target (§7: MIME + size validated up front). */
  app.post('/uploads/presign', async (req) => {
    req.auth();
    const input = validate(presignBody, req.body);
    const err = validateUpload(input.purpose, input.contentType, input.sizeBytes);
    if (err) throw badRequest(err);
    return presignUpload(input.purpose, input.filename ?? 'image', input.contentType);
  });

  /** Local-disk sink for the presigned PUT (dev driver). */
  app.put('/uploads/local/*', async (req, reply) => {
    const raw = (req.params as { '*': string })['*'];
    const q = req.query as { token?: string; contentType?: string };
    const objectKey = decodeURIComponent(raw);
    if (!q.token || !q.contentType || !verifyLocalUploadToken(objectKey, q.contentType, q.token)) {
      throw badRequest('Invalid upload token');
    }
    const buf = req.body as Buffer;
    if (!buf || buf.length === 0) throw badRequest('Empty body');
    if (buf.length > env.maxUploadMb * 1024 * 1024) throw badRequest('File too large');

    const re = await reencodeImage(buf);
    await localSave(objectKey, re ?? buf);
    reply.code(200);
    return { ok: true };
  });

  /** Client confirms upload (optionally triggers server-side processing). */
  app.post('/uploads/confirm', async (req) => {
    req.auth();
    const input = validate(z.object({ objectKey: z.string().min(3).max(300) }), req.body);
    const url = `${env.apiBaseUrl}/api/v1/media/local/${input.objectKey}`;
    return { url };
  });

  /** Serve local media. */
  app.get('/media/local/*', async (req, reply) => {
    const objectKey = decodeURIComponent((req.params as { '*': string })['*']);
    const data = await localRead(objectKey);
    if (!data) throw notFound('Not found');
    const ext = objectKey.split('.').pop() ?? 'bin';
    const mime = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
    reply.header('Content-Type', mime);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return data;
  });

  /** Proxy S3-backed media through the API (keeps bucket private). */
  app.get('/media/s3/:bucket/*', async (req, reply) => {
    req.auth();
    const params = req.params as { bucket: string; '*': string };
    const objectKey = decodeURIComponent(params['*']);
    const res = await fetch(`${env.s3Endpoint}/${params.bucket}/${objectKey}`);
    if (!res.ok) throw notFound('Not found');
    const buf = Buffer.from(await res.arrayBuffer());
    reply.header('Content-Type', res.headers.get('content-type') ?? 'application/octet-stream');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return buf;
  });
}
