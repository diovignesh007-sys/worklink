import type { FastifyRequest, FastifyReply } from 'fastify';
import { getKv } from './kv.js';
import { rateLimited } from './errors.js';

export interface RateLimitOpts {
  /** logical bucket, e.g. 'auth:login' */
  name: string;
  /** max requests per window */
  max: number;
  /** window seconds */
  windowSeconds: number;
  /** extra identity component (e.g. login identifier) — hashed into the key */
  identifier?: string;
}

function clientIp(req: FastifyRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
}

/**
 * Sliding-window-ish fixed counter rate limiter (§5.1: every auth endpoint is
 * limited per IP and per identifier; §7: per-route limits everywhere).
 */
export async function enforceRateLimit(req: FastifyRequest, opts: RateLimitOpts): Promise<void> {
  const kv = getKv();
  const ip = clientIp(req);
  const ident = opts.identifier ? `:i:${Buffer.from(opts.identifier).toString('base64url').slice(0, 40)}` : '';
  const bucket = Math.floor(Date.now() / (opts.windowSeconds * 1000));
  const key = `rl:${opts.name}:${ip}${ident}:${bucket}`;

  const count = await kv.incr(key, opts.windowSeconds * 2);
  if (count > opts.max) {
    const ttl = await kv.ttl(key);
    const retry = Math.max(1, ttl);
    throw rateLimited(`Too many requests. Retry in ${retry}s`);
  }
}

/** Fastify preHandler factory. */
export function rateLimit(opts: RateLimitOpts) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    await enforceRateLimit(req, opts);
  };
}
