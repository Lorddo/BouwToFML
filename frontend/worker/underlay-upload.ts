/**
 * Converter Worker: SPA-assets + POST /api/underlay → R2.
 * GET /u/{key} serveert de plaat same-origin (COEP) met CORP + CORS.
 * Publieke teken-URL in .plg/.fml blijft r2.dev.
 */

export interface ConverterEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  UNDERLAYS: {
    get: (
      key: string,
    ) => Promise<{
      body: ReadableStream
      httpMetadata?: { contentType?: string }
    } | null>
    put: (
      key: string,
      value: ArrayBuffer | ReadableStream | Blob,
      options?: { httpMetadata?: { contentType?: string } },
    ) => Promise<unknown>
    head: (key: string) => Promise<{ size: number } | null>
  }
  UNDERLAY_PUBLIC_BASE: string
  UNDERLAY_UPLOAD_TOKEN: string
}

const KEY_RE = /^v1\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[a-f0-9]{64}\.png$/
const MAX_BYTES = 12 * 1024 * 1024

function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Underlay-Token, X-Underlay-Key',
    'Access-Control-Max-Age': '86400',
  }
}

function readHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  }
}

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  })
}

async function handleUpload(request: Request, env: ConverterEnv): Promise<Response> {
  const origin = request.headers.get('Origin')
  const token = request.headers.get('X-Underlay-Token') ?? ''
  const expected = (env.UNDERLAY_UPLOAD_TOKEN ?? '').trim()
  if (!expected || token !== expected) {
    return json(401, { error: 'unauthorized' }, origin)
  }
  const key = (request.headers.get('X-Underlay-Key') ?? '').trim()
  if (!KEY_RE.test(key)) {
    return json(400, { error: 'bad-key' }, origin)
  }
  const buf = await request.arrayBuffer()
  if (buf.byteLength < 32 || buf.byteLength > MAX_BYTES) {
    return json(400, { error: 'bad-size' }, origin)
  }
  const existing = await env.UNDERLAYS.head(key)
  if (!existing) {
    await env.UNDERLAYS.put(key, buf, {
      httpMetadata: { contentType: 'image/png' },
    })
  }
  const base = (env.UNDERLAY_PUBLIC_BASE || '').replace(/\/$/, '')
  if (!base) return json(500, { error: 'no-public-base' }, origin)
  return json(200, { url: `${base}/${key}`, key }, origin)
}

async function handleRead(key: string, env: ConverterEnv): Promise<Response> {
  if (!KEY_RE.test(key)) {
    return new Response('Not found', { status: 404, headers: readHeaders() })
  }
  const obj = await env.UNDERLAYS.get(key)
  if (!obj) {
    return new Response('Not found', { status: 404, headers: readHeaders() })
  }
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...readHeaders(),
    },
  })
}

export default {
  async fetch(request: Request, env: ConverterEnv): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/u/')) {
      const key = url.pathname.slice('/u/'.length)
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: readHeaders() })
      }
      if (request.method === 'GET' || request.method === 'HEAD') {
        return handleRead(key, env)
      }
      return new Response('Method not allowed', { status: 405, headers: readHeaders() })
    }
    if (url.pathname === '/api/underlay' && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) })
    }
    if (url.pathname === '/api/underlay' && request.method === 'POST') {
      return handleUpload(request, env)
    }
    return env.ASSETS.fetch(request)
  },
}
