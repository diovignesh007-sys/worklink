import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// ioredis has broken CJS default-export types under NodeNext; require it.
const RedisCtor = require('ioredis') as typeof import('ioredis').default;
type RedisClient = InstanceType<typeof RedisCtor>;
import { env } from '../config/env.js';

/**
 * KV abstraction. Production: Redis (OTP store, rate limits, caches).
 * Dev/CI without Docker: in-memory Map with TTL — same interface, see
 * DECISIONS.md. All data is ephemeral-by-design (no durable KV use).
 */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, ttlSeconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

class RedisKV implements KV {
  constructor(private readonly r: RedisClient) {}
  get(key: string) {
    return this.r.get(key);
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) await this.r.set(key, value, 'EX', ttlSeconds);
    else await this.r.set(key, value);
  }
  del(key: string) {
    return this.r.del(key).then(() => undefined);
  }
  async incr(key: string, ttlSeconds: number): Promise<number> {
    const n = await this.r.incr(key);
    if (n === 1) await this.r.expire(key, ttlSeconds);
    return n;
  }
  async ttl(key: string): Promise<number> {
    return this.r.ttl(key);
  }
}

class MemoryKV implements KV {
  private m = new Map<string, { v: string; exp: number | null }>();
  private sweep() {
    const now = Date.now();
    for (const [k, e] of this.m) if (e.exp !== null && e.exp < now) this.m.delete(k);
  }
  async get(key: string) {
    this.sweep();
    return this.m.get(key)?.v ?? null;
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    this.sweep();
    this.m.set(key, { v: value, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  }
  async del(key: string) {
    this.m.delete(key);
  }
  async incr(key: string, ttlSeconds: number) {
    this.sweep();
    const cur = this.m.get(key);
    if (!cur) {
      this.m.set(key, { v: '1', exp: Date.now() + ttlSeconds * 1000 });
      return 1;
    }
    const n = Number(cur.v) + 1;
    cur.v = String(n);
    return n;
  }
  async ttl(key: string) {
    this.sweep();
    const e = this.m.get(key);
    if (!e || e.exp === null) return -1;
    return Math.max(0, Math.ceil((e.exp - Date.now()) / 1000));
  }
}

let kv: KV | null = null;
let redisClient: RedisClient | null = null;

export async function initKv(): Promise<KV> {
  if (kv) return kv;
  if (!env.inMemoryRedis && env.redisUrl) {
    try {
      const r = new RedisCtor(env.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: false });
      await r.ping();
      redisClient = r;
      kv = new RedisKV(r);
      console.log('[kv] using Redis');
      return kv;
    } catch (err) {
      console.warn('[kv] Redis unreachable — using in-memory fallback');
    }
  }
  kv = new MemoryKV();
  console.log('[kv] using in-memory fallback');
  return kv;
}

export function getKv(): KV {
  if (!kv) throw new Error('KV not initialized — call initKv() first');
  return kv;
}

export async function closeKv(): Promise<void> {
  if (redisClient) redisClient.disconnect();
  redisClient = null;
  kv = null;
}
