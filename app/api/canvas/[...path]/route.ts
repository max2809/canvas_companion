export const runtime = 'nodejs';

const CANVAS_BASE = 'https://canvas.eur.nl/api/v1';
const MAX_PAGES = 10;
const TIMEOUT_MS = 15_000;

function parseLinkNext(linkHeader: string): string | null {
  for (const part of linkHeader.split(',')) {
    const urlMatch = part.match(/<([^>]+)>/);
    const relMatch = part.match(/rel="([^"]+)"/);
    if (urlMatch && relMatch?.at(1) === 'next') return urlMatch[1];
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const token = request.headers.get('x-canvas-token');
  if (!token?.trim()) {
    return Response.json({ error: 'missing token' }, { status: 401 });
  }

  const { path } = await params;
  const { search } = new URL(request.url);
  let upstreamUrl = `${CANVAS_BASE}/${path.join('/')}${search}`;

  const results: unknown[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(upstreamUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : 'upstream fetch failed';
      return Response.json({ error: message }, { status: 502 });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const canvasBody = await res.text().catch(() => '');
      return Response.json(
        { error: 'Canvas upstream error', canvasStatus: res.status, canvasBody },
        { status: res.status }
      );
    }

    const body: unknown = await res.json();

    if (Array.isArray(body)) {
      results.push(...body);
    } else {
      return Response.json(body, { status: 200 });
    }

    const linkHeader = res.headers.get('link');
    const next = linkHeader ? parseLinkNext(linkHeader) : null;
    if (!next) break;
    upstreamUrl = next;
  }

  return Response.json(results, { status: 200 });
}
