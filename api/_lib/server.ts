import { Redis } from '@upstash/redis';
import { createHash, timingSafeEqual } from 'node:crypto';

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Returns an error response if the request lacks the shared sync password. */
export function checkAuth(req: Request): Response | null {
  const expected = process.env.CLEANUP_PASSWORD;
  if (!expected) {
    return json(
      { error: 'not_configured', message: 'Sync is not set up on the server: CLEANUP_PASSWORD is missing.' },
      503,
    );
  }
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const digest = (s: string) => createHash('sha256').update(s).digest();
  if (!timingSafeEqual(digest(got), digest(expected))) {
    return json({ error: 'unauthorized', message: 'Wrong sync password.' }, 401);
  }
  return null;
}

export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

const PREFIX = 'cleanup:';

/**
 * Upstash Redis (connected via the Vercel Marketplace) in production.
 * Falls back to an in-memory store for local `npm run dev` only.
 */
export function getKV(): KV | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    const redis = new Redis({ url, token });
    return {
      get: (k) => redis.get(PREFIX + k),
      set: async (k, v) => {
        await redis.set(PREFIX + k, v);
      },
      del: async (k) => {
        await redis.del(PREFIX + k);
      },
    };
  }
  if (!process.env.VERCEL) {
    const g = globalThis as unknown as { __cleanupMem?: Map<string, string> };
    const mem = (g.__cleanupMem ??= new Map());
    return {
      get: async (k) => {
        const v = mem.get(k);
        return v === undefined ? null : JSON.parse(v);
      },
      set: async (k, v) => {
        mem.set(k, JSON.stringify(v));
      },
      del: async (k) => {
        mem.delete(k);
      },
    };
  }
  return null;
}

export function noStorage(): Response {
  return json(
    {
      error: 'no_storage',
      message: 'Sync is not set up on the server: connect an Upstash Redis store to this Vercel project.',
    },
    503,
  );
}
