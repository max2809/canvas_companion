import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  if (!url.startsWith('https://timetables.eur.nl/')) {
    return Response.json({ error: 'Only timetables.eur.nl URLs are accepted' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const upstream = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      return Response.json(
        { error: 'Upstream fetch failed', upstreamStatus: upstream.status, body },
        { status: upstream.status }
      );
    }

    const text = await upstream.text();
    return new Response(text, {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
    });
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : 'Fetch failed';
    return Response.json({ error: message }, { status: 502 });
  }
}
