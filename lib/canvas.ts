export interface CanvasUser {
  id: number;
  name: string;
  short_name: string;
  email?: string;
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  term?: { name: string };
  enrollment_state?: string;
}

export interface CanvasAssignment {
  id: number;
  course_id: number;
  name: string;
  description?: string | null;
  due_at: string | null;
  points_possible: number | null;
  html_url: string;
  submission_types: string[];
  has_submitted_submissions: boolean;
  omit_from_final_grade: boolean;
  submission?: CanvasSubmission;
}

export interface CanvasSubmission {
  id: number;
  assignment_id: number;
  submitted_at: string | null;
  score: number | null;
  grade: string | null;
  workflow_state: 'submitted' | 'unsubmitted' | 'graded' | 'pending_review';
  late: boolean;
  missing: boolean;
}

export interface EnrichedAssignment extends CanvasAssignment {
  course_name: string;
  course_code_short: string;
}

export function parseCourseCode(name: string): string {
  const match = name.match(/^([A-Z]{2,4}\d{4})/);
  return match ? match[1] : name.slice(0, 6);
}

export class CanvasError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`Canvas ${status}`);
  }
}

export async function canvasFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`/api/canvas/${path}`, {
    headers: { 'x-canvas-token': token },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new CanvasError(res.status, body);
  }
  return res.json() as Promise<T>;
}

export async function fetchUser(token: string): Promise<CanvasUser> {
  return canvasFetch<CanvasUser>('users/self', token);
}

export async function fetchCourses(token: string): Promise<CanvasCourse[]> {
  return canvasFetch<CanvasCourse[]>(
    'courses?enrollment_state=active&include[]=term&per_page=100',
    token
  );
}

export async function fetchAssignments(
  token: string,
  courseId: number
): Promise<CanvasAssignment[]> {
  return canvasFetch<CanvasAssignment[]>(
    `courses/${courseId}/assignments?include[]=submission&per_page=100`,
    token
  );
}

export interface CanvasModuleItem {
  id: number;
  title: string;
  position: number;
  type: 'File' | 'ExternalUrl' | 'Page' | 'Assignment' | 'Discussion' | 'Quiz' | 'ExternalTool' | 'SubHeader';
  content_id?: number;   // present when type === 'File'
  page_url?: string;     // present when type === 'Page', e.g. "resit-exam-2025"
  external_url?: string; // present when type === 'ExternalUrl'
  new_tab?: boolean;
  html_url?: string;
}

export interface CanvasPage {
  page_id: number;
  url: string;
  title: string;
  body: string | null;
  updated_at: string;
  published: boolean;
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  items_count: number;
  items?: CanvasModuleItem[];
}

export async function fetchCourseModules(token: string, courseId: number): Promise<CanvasModule[]> {
  return canvasFetch<CanvasModule[]>(
    `courses/${courseId}/modules?include[]=items&per_page=100`,
    token
  );
}

export async function fetchCoursePage(
  token: string,
  courseId: number,
  pageUrl: string
): Promise<CanvasPage> {
  return canvasFetch<CanvasPage>(`courses/${courseId}/pages/${pageUrl}`, token);
}

function parseContentDispositionFilename(cd: string): string | null {
  const starMatch = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (starMatch) return decodeURIComponent(starMatch[1].trim());
  const quotedMatch = cd.match(/filename="([^"]+)"/i);
  if (quotedMatch) return quotedMatch[1];
  const bareMatch = cd.match(/filename=([^;]+)/i);
  if (bareMatch) return bareMatch[1].trim();
  return null;
}

export interface CanvasAnnouncement {
  id: number;
  title: string;
  message: string | null;
  posted_at: string;
  html_url: string;
  author?: { display_name: string };
}

export async function fetchCourseAnnouncements(
  token: string,
  courseId: number
): Promise<CanvasAnnouncement[]> {
  return canvasFetch<CanvasAnnouncement[]>(
    `courses/${courseId}/discussion_topics?only_announcements=true&per_page=10`,
    token
  );
}

export async function downloadModuleFile(
  token: string,
  courseId: number,
  fileId: number
): Promise<{ blob: Blob; filename: string }> {
  const url = `https://canvas.eur.nl/courses/${courseId}/files/${fileId}/download?download_frd=1`;
  const res = await fetch(`/api/canvas-file?url=${encodeURIComponent(url)}`, {
    headers: { 'x-canvas-token': token },
  });
  if (!res.ok) throw new CanvasError(res.status, await res.text());
  const cd = res.headers.get('content-disposition');
  const filename = (cd ? parseContentDispositionFilename(cd) : null) ?? `file_${fileId}`;
  return { blob: await res.blob(), filename };
}
