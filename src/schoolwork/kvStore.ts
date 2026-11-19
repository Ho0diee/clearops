import { createHash } from 'node:crypto';
import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from '@vercel/blob';

export { BlobPreconditionFailedError };

interface UpstashRestConfig {
  url: string;
  token: string;
}

function resolveUpstashRestConfig(): UpstashRestConfig | null {
  const explicitPairs: Array<[string, string]> = [
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['INTUITION_KV_REST_API_URL', 'INTUITION_KV_REST_API_TOKEN'],
    ['INTUITION_UPSTASH_REDIS_REST_URL', 'INTUITION_UPSTASH_REDIS_REST_TOKEN'],
  ];

  for (const [urlKey, tokenKey] of explicitPairs) {
    const url = process.env[urlKey]?.trim();
    const token = process.env[tokenKey]?.trim();
    if (url && token) {
      return { url: url.replace(/\/+$/, ''), token };
    }
  }

  // Fallback: match any Vercel Marketplace custom prefix (e.g. MYSTORE_KV_REST_API_URL / *_TOKEN)
  for (const [key, rawUrl] of Object.entries(process.env)) {
    const url = rawUrl?.trim();
    if (!url || !/^https:\/\//i.test(url)) continue;
    if (key.endsWith('_REST_API_URL') || key.endsWith('_REDIS_REST_URL')) {
      const tokenKey = key.replace(/_URL$/, '_TOKEN');
      const token = process.env[tokenKey]?.trim();
      if (token) {
        return { url: url.replace(/\/+$/, ''), token };
      }
    }
  }

  return null;
}

export function getActiveStorageBackend(): 'upstash-redis' | 'vercel-blob' {
  return resolveUpstashRestConfig() ? 'upstash-redis' : 'vercel-blob';
}

function sha256Etag(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 24);
}

async function upstashCommand<T = unknown>(
  cfg: UpstashRestConfig,
  command: string[]
): Promise<T> {
  const resp = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Upstash Redis HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const json = (await resp.json()) as { result?: T; error?: string };
  if (json.error) {
    throw new Error(`Upstash Redis error: ${json.error}`);
  }
  return json.result as T;
}

/**
 * Reads a private JSON document by pathname from Upstash Redis (preferred, 500k free ops/mo)
 * or falls back to Vercel Blob if Upstash Redis env vars are not configured.
 */
export async function readPrivateJsonStore<T>(
  pathname: string
): Promise<{ data: T | null; etag: string | null }> {
  const redis = resolveUpstashRestConfig();
  if (redis) {
    const raw = await upstashCommand<string | null>(redis, ['GET', pathname]);
    if (typeof raw !== 'string' || !raw.trim()) {
      return { data: null, etag: null };
    }
    return {
      data: JSON.parse(raw) as T,
      etag: sha256Etag(raw),
    };
  }

  try {
    const res = await get(pathname, { access: 'private', useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) {
      return { data: null, etag: res?.blob?.etag ?? null };
    }
    const text = await new Response(res.stream).text();
    if (!text.trim()) {
      return { data: null, etag: res.blob.etag };
    }
    return {
      data: JSON.parse(text) as T,
      etag: res.blob.etag,
    };
  } catch (err) {
    if (err instanceof BlobNotFoundError) {
      return { data: null, etag: null };
    }
    throw err;
  }
}

/**
 * Writes a private JSON document by pathname to Upstash Redis (preferred)
 * or falls back to Vercel Blob if Upstash Redis env vars are not configured.
 */
export async function writePrivateJsonStore<T>(
  pathname: string,
  data: T,
  options?: { ifMatch?: string | null; pretty?: boolean }
): Promise<{ etag: string }> {
  const serialized = options?.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  const redis = resolveUpstashRestConfig();
  if (redis) {
    await upstashCommand(redis, ['SET', pathname, serialized]);
    return { etag: sha256Etag(serialized) };
  }

  const saved = await put(pathname, serialized, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    ...(options?.ifMatch ? { ifMatch: options.ifMatch } : {}),
  });
  return { etag: saved.etag };
}
