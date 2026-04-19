export const runtime = 'nodejs';

import type { CanvasModule } from '@/lib/canvas';
import { parseCourseManual } from '@/lib/extract/parse';
import { extractText } from 'unpdf';
import Anthropic from '@anthropic-ai/sdk';

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

const TOP_ITEMS_LIMIT = 10;
// Phase 2 downloads this many File items in parallel — parallel so total time ≈ one download
const CONTENT_SCAN_FILE_LIMIT = 5;
const COURSE_MANUAL_KEYWORDS = /\b(exam|tutorial|lecture|assessment|attendance|grade|grading|credit|ects|coordinator|midterm|retake|resit)\b/gi;
const COURSE_MANUAL_KEYWORD_MIN = 3;

async function getFileDownloadUrl(contentId: number, token: string): Promise<string | null> {
  const res = await fetch(
    `https://canvas.eur.nl/api/v1/files/${contentId}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  const file = await res.json() as { url?: string };
  return file.url ?? null;
}

function looksLikeCourseManual(text: string): boolean {
  if (text.length < 300) return false;
  const matches = text.match(COURSE_MANUAL_KEYWORDS);
  return (matches?.length ?? 0) >= COURSE_MANUAL_KEYWORD_MIN;
}

// Phase 1: title pattern match among top items (no download needed).
async function findManualPdfByTitle(modules: CanvasModule[], token: string): Promise<string | null> {
  let scanned = 0;
  for (const mod of modules) {
    for (const item of mod.items ?? []) {
      if (scanned >= TOP_ITEMS_LIMIT) return null;
      scanned++;
      if (item.type !== 'File' || item.content_id == null) continue;
      if (!MANUAL_PATTERN.test(item.title)) continue;
      return getFileDownloadUrl(item.content_id, token);
    }
  }
  return null;
}

// Phase 2: content-based — download top File items IN PARALLEL and return the first (by position)
// that reads like a course manual. Parallel execution keeps total time ≈ one download's duration.
async function findManualPdfByContent(modules: CanvasModule[], token: string): Promise<string | null> {
  const candidateIds: number[] = [];
  let itemsScanned = 0;
  outer: for (const mod of modules) {
    for (const item of mod.items ?? []) {
      if (itemsScanned >= TOP_ITEMS_LIMIT) break outer;
      itemsScanned++;
      if (item.type === 'File' && item.content_id != null) {
        candidateIds.push(item.content_id);
        if (candidateIds.length >= CONTENT_SCAN_FILE_LIMIT) break outer;
      }
    }
  }

  if (candidateIds.length === 0) return null;

  const results = await Promise.allSettled(
    candidateIds.map(async (contentId) => {
      const url = await getFileDownloadUrl(contentId, token);
      if (!url) return null;
      const pdfRes = await fetch(url, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
      if (!pdfRes?.ok) return null;
      const buffer = await pdfRes.arrayBuffer();
      const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
      return looksLikeCourseManual(text) ? url : null;
    })
  );

  // Respect original ordering: return the earliest-positioned file that passes the check
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) return r.value;
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

// Returns null when no API key is configured (fall back to regex).
// Throws when the key is present but the call fails (surface the error).
async function parseWithClaude(text: string): Promise<import('@/lib/extract/types').CourseManual | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: [{ type: 'text', text: 'You are an expert at extracting structured course information from university course manuals. Extract all available information accurately. For assessments, pay special attention to grade weights, minimum grades, and resit policies. Return null/empty for fields not mentioned in the text.', cache_control: { type: 'ephemeral' } }],
      tools: [{
        name: 'extract_course_manual',
        description: 'Extract structured course information from a course manual',
        input_schema: {
          type: 'object' as const,
          properties: {
            course_name: { type: 'string', description: 'Full name of the course' },
            coordinator: { type: 'array', items: { type: 'string' }, description: 'Names of course coordinators/lecturers' },
            contact_email: { type: ['string', 'null'], description: 'Primary contact email address' },
            mandatory_attendance: { type: ['boolean', 'null'], description: 'Whether attendance is mandatory' },
            examination_format: { type: 'array', items: { type: 'string' }, description: 'Types of examination (e.g. "written exam", "oral exam")' },
            assessments: {
              type: 'array',
              description: 'All graded components and assessments',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Name of the assessment' },
                  weighting_factor: { type: ['number', 'null'], description: 'Percentage weight in final grade (0-100)' },
                  minimum_grade: { type: ['number', 'null'], description: 'Minimum required grade to pass this component' },
                  resit: { type: 'boolean', description: 'Whether a resit/retake is available' },
                  resit_note: { type: ['string', 'null'], description: 'Details about resit policy' },
                  form: { type: 'string', description: 'Form of assessment (e.g. written, oral, assignment)' },
                  mandatory: { type: 'boolean', description: 'Whether passing this component is mandatory for the course' },
                  deadlines: { type: 'array', items: { type: 'string' }, description: 'Deadline dates in YYYY-MM-DD format' },
                },
                required: ['name', 'weighting_factor', 'minimum_grade', 'resit', 'resit_note', 'form', 'mandatory', 'deadlines'],
              },
            },
            workload: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  activity: { type: 'string' },
                  hours: { type: 'number' },
                },
                required: ['activity', 'hours'],
              },
            },
            study_materials: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  citation: { type: 'string', description: 'Full citation of the book or resource' },
                  isbn: { type: ['string', 'null'], description: 'ISBN if available' },
                },
                required: ['citation', 'isbn'],
              },
            },
            important_dates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  start: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                  end: { type: ['string', 'null'] },
                },
                required: ['label', 'start', 'end'],
              },
            },
          },
          required: ['course_name', 'coordinator', 'contact_email', 'mandatory_attendance', 'examination_format', 'assessments', 'workload', 'study_materials', 'important_dates'],
        },
      }],
      tool_choice: { type: 'tool', name: 'extract_course_manual' },
      messages: [{
        role: 'user',
        content: `Extract all course information from this PDF manual:\n\n${text.slice(0, 60_000)}`,
      }],
    });

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) return null;

    const d = toolUse.input as {
      course_name: string;
      coordinator: string[];
      contact_email: string | null;
      mandatory_attendance: boolean | null;
      examination_format: string[];
      assessments: Array<{
        name: string; weighting_factor: number | null; minimum_grade: number | null;
        resit: boolean; resit_note: string | null; form: string; mandatory: boolean; deadlines: string[];
      }>;
      workload: Array<{ activity: string; hours: number }>;
      study_materials: Array<{ citation: string; isbn: string | null }>;
      important_dates: Array<{ label: string; start: string; end: string | null }>;
    };

    return {
      course_code: '',
      course_name: d.course_name ?? '',
      teaching_block: null,
      course_load_ec: null,
      coordinator: d.coordinator ?? [],
      teaching_staff: [],
      course_activities: [],
      examination_format: d.examination_format ?? [],
      mandatory_attendance: d.mandatory_attendance ?? null,
      pre_requisites: null,
      pre_requisites_note: null,
      contact_email: d.contact_email ?? null,
      genai: null,
      learning_goals: [],
      workload: d.workload ?? [],
      modules: [],
      assessments: (d.assessments ?? []).map((a) => ({
        name: a.name,
        weighting_factor: a.weighting_factor,
        form: a.form ?? '',
        group_or_individual: '',
        formative_or_summative: '',
        mandatory: a.mandatory ?? false,
        minimum_grade: a.minimum_grade,
        resit: a.resit ?? false,
        resit_note: a.resit_note,
        company_interaction: false,
        feedback_by: '',
        goals_assessed: [],
        deadlines: a.deadlines ?? [],
      })),
      sdgs: [],
      study_materials: d.study_materials ?? [],
      important_dates: d.important_dates ?? [],
      raw_sections: { full_text: text },
      warnings: [],
      template_version_hint: {
        export_date: new Date().toISOString().slice(0, 10),
        headings_present: ['__pdf__'],
      },
    };
  } catch (e) {
    throw e;
  }
}

async function getToken(request: Request): Promise<string | null> {
  return request.headers.get('x-canvas-token');
}

async function fetchModules(courseId: string, token: string): Promise<CanvasModule[] | null> {
  const res = await fetch(
    `https://canvas.eur.nl/api/v1/courses/${courseId}/modules?include[]=items&per_page=100`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  return res.json();
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

  const modules = await fetchModules(courseId, token);
  if (!modules) return Response.json({ error: 'Could not fetch modules' }, { status: 502 });

  const sqillUrl = findManualUrl(modules);

  if (sqillUrl) {
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

  // Fallback phase 1: title pattern match among top items
  let pdfUrl = await findManualPdfByTitle(modules, token);

  // Fallback phase 2: content-based detection if no title match
  if (!pdfUrl) pdfUrl = await findManualPdfByContent(modules, token);

  if (!pdfUrl) {
    return Response.json({ error: 'No course manual found in modules' }, { status: 404 });
  }

  const pdfRes = await fetch(pdfUrl, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!pdfRes?.ok) {
    return Response.json({ error: 'Could not download course manual PDF' }, { status: 502 });
  }

  try {
    const buffer = await pdfRes.arrayBuffer();
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
    const sqill = parseCourseManual(text);
    if (sqill.template_version_hint.headings_present.length > 0) {
      return Response.json(sqill);
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'PDF manual found but ANTHROPIC_API_KEY is not configured' }, { status: 503 });
    }
    const manual = await parseWithClaude(text);
    return Response.json(manual);
  } catch (e: unknown) {
    const isAuth = e instanceof Error && e.message.includes('authentication_error');
    const msg = isAuth
      ? 'Invalid Anthropic API key — update ANTHROPIC_API_KEY in .env.local and restart the server'
      : `Extraction failed: ${String(e)}`;
    return Response.json({ error: msg }, { status: 500 });
  }
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
