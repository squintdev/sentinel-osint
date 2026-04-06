/**
 * Camera image proxy.
 *
 * The modal needs fresh frames, but browsers cache images by URL aggressively.
 * A client-side `?_t={tick}` cache-bust in theory works, but:
 *  - Some browsers coalesce query-string variants when Cache-Control allows
 *  - CORS issues prevent client-side fetch() from reading some camera hosts
 *  - Insecam IP cams have no CORS headers at all
 *
 * Proxying through our server:
 *  - Forces a fresh upstream fetch each time (`cache: 'no-store'`)
 *  - Returns `Cache-Control: no-store` to the browser
 *  - Bypasses all CORS concerns (same-origin response)
 *
 * Called as: /api/camera-image?url=<encoded-upstream-url>
 */

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url');
  if (!target) {
    return new Response('missing url', { status: 400 });
  }

  // Light sanity check — must be http/https
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response('invalid url', { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return new Response('unsupported protocol', { status: 400 });
  }

  try {
    const upstream = await fetch(target, {
      cache: 'no-store',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) {
      return new Response(`upstream ${upstream.status}`, { status: 502 });
    }

    const body = await upstream.arrayBuffer();
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
      },
    });
  } catch (err) {
    return new Response(`proxy error: ${(err as Error).message}`, { status: 502 });
  }
}
