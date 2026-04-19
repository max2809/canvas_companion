export const runtime = 'nodejs';

import type { CanvasModule } from '@/lib/canvas';
import { parseCourseManual } from '@/lib/extract/parse';

const MANUAL_PATTERN = /course\s*manual|sqill|syllabus/i;
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'nl,en;q=0.9',
};

function findManualUrl(modules: CanvasModule[]): string | null {
  for (const mod of modules) {
    for (const item of mod.items ?? []) {
      if (item.type === 'ExternalUrl' && item.external_url) {
        if (MANUAL_PATTERN.test(item.title) || item.external_url.includes('sqill')) {
          return item.external_url;
        }
      }
    }
  }
  return null;
}

function sqillHtmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/td>\s*<td[^>]*>/gi, ' ')
    .replace(/<\/th>\s*<th[^>]*>/gi, ' ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(tr|p|div|br|h[1-6]|section|article|ul|ol|table|thead|tbody|header|footer|main)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&ndash;|&#8211;/g, '-').replace(/&mdash;|&#8212;/g, '-')
    .replace(/&bull;|&#8226;/g, '')
    .replace(/[ \t]+/g, ' ').replace(/^ +/gm, '').replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function getToken(request: Request): Promise<string | null> {
  return request.headers.get('x-canvas-token');
}

async function findSqillUrl(courseId: string, token: string): Promise<string | null> {
  const res = await fetch(
    `https://canvas.eur.nl/api/v1/courses/${courseId}/modules?include[]=items&per_page=100`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  const modules: CanvasModule[] = await res.json();
  return findManualUrl(modules);
}

// GET — auto-fetch or return sqill_url for paste fallback
export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await params;
  if (!/^\d+$/.test(courseId)) {
    return Response.json({ error: 'Invalid course ID' }, { status: 400 });
  }

  const token = await getToken(request);
  if (!token) return Response.json({ error: 'Missing Canvas token' }, { status: 401 });

  const sqillUrl = await findSqillUrl(courseId, token);
  if (!sqillUrl) {
    return Response.json({ error: 'No course manual found in modules' }, { status: 404 });
  }

  // The sqill SPA serves rendered HTML at {url}/html
  const htmlUrl = sqillUrl.replace(/\/$/, '') + '/html';
  const manualRes = await fetch(htmlUrl, {
    signal: AbortSignal.timeout(30_000),
    headers: BROWSER_HEADERS,
  }).catch(() => null);

  if (manualRes?.ok) {
    const contentType = manualRes.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
      const html = await manualRes.text();
      const bodyText = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (bodyText.length > 500) {
        // Full HTML — parse it directly
        try {
          const manual = parseCourseManual(sqillHtmlToText(html));
          return Response.json(manual);
        } catch (e) {
          return Response.json({ error: 'Extraction failed', detail: String(e) }, { status: 500 });
        }
      }
    }
  }

  return Response.json({ error: 'Could not load course manual content' }, { status: 502 });
}

// POST — parse text pasted by the user from the sqill page
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await params;
  if (!/^\d+$/.test(courseId)) {
    return Response.json({ error: 'Invalid course ID' }, { status: 400 });
  }

  const token = await getToken(request);
  if (!token) return Response.json({ error: 'Missing Canvas token' }, { status: 401 });

  const body = await request.json().catch(() => null) as { text?: string } | null;
  if (!body?.text?.trim()) {
    return Response.json({ error: 'Missing text in request body' }, { status: 400 });
  }

  try {
    const manual = parseCourseManual(body.text);
    return Response.json(manual);
  } catch (e) {
    return Response.json({ error: 'Extraction failed', detail: String(e) }, { status: 500 });
  }
}
