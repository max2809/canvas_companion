export const runtime = 'nodejs';

const ALLOWED_PREFIXES = [
  'https://canvas.eur.nl/',
  'https://eur.instructure.com/',
];

const TIMEOUT_MS = 60_000;

export async function GET(request: Request) {
  const token = request.headers.get('x-canvas-token');
  if (!token?.trim()) {
    return new Response('Missing token', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  if (!url) {
    return new Response('Missing url parameter', { status: 400 });
  }

  const allowed = ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix));
  if (!allowed) {
    return new Response('URL not allowed', { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : 'upstream fetch failed';
    return new Response(message, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    return new Response(await upstream.text().catch(() => ''), { status: upstream.status });
  }

  const headers = new Headers();
  const ct = upstream.headers.get('content-type');
  const cl = upstream.headers.get('content-length');
  const cd = upstream.headers.get('content-disposition');
  if (ct) headers.set('content-type', ct);
  if (cl) headers.set('content-length', cl);
  if (cd) headers.set('content-disposition', cd);

  return new Response(upstream.body, { status: 200, headers });
}
