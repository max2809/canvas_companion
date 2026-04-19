import type {
  CourseManual,
  Assessment,
  LearningGoal,
  WorkloadEntry,
  CourseModule,
  StudyMaterial,
  ImportantDate,
} from './types';

// Only the actual document section headings from the spec §2.
// Assessment table row labels and GenAI sub-labels are intentionally excluded —
// they are parsed within their parent section and must not act as split anchors.
// Sorted longest-first so longer headings match before their shorter prefixes
// (e.g. "Examination schedule" before "Examination").
const SECTION_HEADINGS = [
  'Reflection on UN Sustainable Development Goals',
  'Entry requirements/required background knowledge',
  'Contact information and availability',
  'Generative AI - RSM Policy',
  'Other relevant information',
  'Examination registration',
  'Examination perusal',
  'Examination schedule',
  'Retaking the course',
  'Validity of grades',
  'Integrity statement',
  'Session overview',
  'Course activities',
  'Course overview',
  'Attendance rules',
  'Learning goals',
  'Registrations',
  'Bonus points',
  'Study materials',
  'Assessment plan',
  'Examination',
  'Workload',
  'Details',
];

const ASSESSMENT_TABLE_LABELS = [
  'Weighting factor',
  'Form of examination',
  'Group or Individual',
  'Formative or Summative',
  'Mandatory for final grade',
  'Minimum grade applicable',
  'Opportunity to re-sit within the academic year',
  'Interaction/contact with company or organisation',
  'Feedback or evaluation provided by:',
  'Assessment of which course educational goal(s)',
];

const GOAL_REGEX = /^(BT\d{4}(?:\s+[A-Za-z]+)?\s+Goal\s+\d+)\s*[-:]\s*(.+)$/m;
const GOAL_REGEX_G = /(BT\d{4}(?:\s+[A-Za-z]+)?\s+Goal\s+\d+)/g;

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[–—]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Section splitting
// ---------------------------------------------------------------------------

function splitSections(text: string): Record<string, string> {
  const positions: { name: string; index: number }[] = [];

  for (const heading of SECTION_HEADINGS) {
    let searchFrom = 0;
    while (true) {
      const idx = text.indexOf(heading, searchFrom);
      if (idx === -1) break;

      // Only treat this as a section boundary if it sits at the start of a line.
      // This prevents matching heading text that appears mid-sentence in prose
      // (e.g. 'please see the section "Bonus points" of this course manual').
      const charBefore = idx > 0 ? text[idx - 1] : '\n';
      const isLineStart = charBefore === '\n';

      if (isLineStart) {
        const alreadyClaimed = positions.some(
          (p) => idx >= p.index && idx < p.index + p.name.length,
        );
        if (!alreadyClaimed) {
          positions.push({ name: heading, index: idx });
          break;
        }
      }
      searchFrom = idx + 1;
    }
  }

  positions.sort((a, b) => a.index - b.index);

  const sections: Record<string, string> = {};
  for (let i = 0; i < positions.length; i++) {
    const { name, index } = positions[i];
    const contentStart = index + name.length;
    const contentEnd =
      i + 1 < positions.length ? positions[i + 1].index : text.length;
    sections[name] = text.slice(contentStart, contentEnd).trim();
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function extractValue(text: string, label: string, stopLabels: string[]): string {
  const idx = text.indexOf(label);
  if (idx === -1) return '';
  const after = text.slice(idx + label.length).replace(/^[:\s]+/, '');
  let end = after.length;
  for (const stop of stopLabels) {
    const si = after.indexOf(stop);
    if (si !== -1 && si < end) end = si;
  }
  // Return just first meaningful line if the value is inline, else all until stop
  const firstLine = after.slice(0, end).split('\n')[0].trim();
  const full = after.slice(0, end).trim();
  return firstLine || full;
}

function extractBlock(text: string, label: string, stopLabels: string[]): string {
  const idx = text.indexOf(label);
  if (idx === -1) return '';
  const after = text.slice(idx + label.length).replace(/^[:\s]+/, '');
  let end = after.length;
  for (const stop of stopLabels) {
    const si = after.indexOf(stop);
    if (si !== -1 && si < end) end = si;
  }
  return after.slice(0, end).trim();
}

function parseBool(raw: string): boolean {
  return /^yes/i.test(raw.trim());
}

function parseBoolNullable(raw: string): boolean | null {
  const t = raw.trim().toLowerCase();
  if (t.startsWith('yes')) return true;
  if (t.startsWith('no')) return false;
  return null;
}

function parseBoolNote(raw: string): { value: boolean | null; note: string | null } {
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (lower.startsWith('yes')) {
    const note = t.slice(3).replace(/^[,\s]+/, '').trim() || null;
    return { value: true, note };
  }
  if (lower.startsWith('no')) {
    const note = t.slice(2).replace(/^[,\s]+/, '').trim() || null;
    return { value: false, note: note || null };
  }
  return { value: null, note: null };
}

function parseMinGrade(raw: string): number | null {
  if (/not applicable/i.test(raw)) return null;
  const m = raw.match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// ---------------------------------------------------------------------------
// Section parsers
// ---------------------------------------------------------------------------

function parseDetails(text: string) {
  const DETAIL_LABELS = [
    'Teaching block(s)',
    'Course load',
    'Coordinator',
    'Teaching staff',
    'Course activities',
    'Examination format',
    'Mandatory attendance',
    'Pre-requisites',
    'Schedule',
  ];

  const teachingBlock =
    extractValue(text, 'Teaching block(s)', DETAIL_LABELS.filter((l) => l !== 'Teaching block(s)')) || null;

  const courseLoadRaw = extractValue(text, 'Course load', DETAIL_LABELS.filter((l) => l !== 'Course load'));
  const courseLoad = parseInt(courseLoadRaw) || null;

  const coordinatorRaw = extractBlock(text, 'Coordinator', ['Teaching staff', 'Course activities', 'Examination format', 'Mandatory attendance']);
  const coordinator = coordinatorRaw ? coordinatorRaw.split('\n').map((s) => s.trim()).filter(Boolean) : [];

  const teachingStaffRaw = extractBlock(text, 'Teaching staff', ['Course activities', 'Examination format', 'Mandatory attendance', 'Pre-requisites']);
  const teachingStaff = teachingStaffRaw ? teachingStaffRaw.split('\n').map((s) => s.trim()).filter(Boolean) : [];

  const courseActivitiesRaw = extractValue(text, 'Course activities', DETAIL_LABELS.filter((l) => l !== 'Course activities'));
  const courseActivities = courseActivitiesRaw
    ? courseActivitiesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const examFormatRaw = extractValue(text, 'Examination format', DETAIL_LABELS.filter((l) => l !== 'Examination format'));
  const examinationFormat = examFormatRaw
    ? examFormatRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const mandatoryRaw = extractValue(text, 'Mandatory attendance', DETAIL_LABELS.filter((l) => l !== 'Mandatory attendance'));
  const mandatoryAttendance = parseBoolNullable(mandatoryRaw);

  const preReqRaw = extractBlock(text, 'Pre-requisites', ['Schedule', 'Teaching block']);
  const firstPreReqLine = preReqRaw.split('\n')[0].trim();
  const { value: preRequisites, note: preRequisitesNote } = parseBoolNote(firstPreReqLine);

  return {
    teachingBlock,
    courseLoad,
    coordinator,
    teachingStaff,
    courseActivities,
    examinationFormat,
    mandatoryAttendance,
    preRequisites,
    preRequisitesNote,
  };
}

function parseContactEmail(text: string): string | null {
  const emails = [...text.matchAll(/[a-zA-Z0-9._%+-]+@rsm\.nl/g)].map((m) => m[0]);
  if (emails.length === 0) return null;
  // Prefer course-level emails (no dot in local part = not a personal email)
  const courseEmails = emails.filter((e) => !e.split('@')[0].includes('.'));
  return courseEmails[0] ?? emails[0];
}

function parseGenAI(text: string) {
  const catIdx = text.indexOf('Category of GenAI usage');
  const expIdx = text.indexOf('GenAI usage explained');
  if (catIdx === -1 && expIdx === -1) return null;

  const catEnd = expIdx !== -1 ? expIdx : text.length;
  const category = text
    .slice(catIdx !== -1 ? catIdx + 'Category of GenAI usage'.length : 0, catEnd)
    .replace(/^[:\s]+/, '')
    .split('\n')[0]
    .trim();

  const explanation =
    expIdx !== -1
      ? text.slice(expIdx + 'GenAI usage explained'.length).replace(/^[:\s]+/, '').trim()
      : '';

  return { category, explanation };
}

function parseLearningGoals(text: string): LearningGoal[] {
  const goals: LearningGoal[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(GOAL_REGEX);
    if (!m) continue;
    let description = m[2].trim();
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() &&
      !lines[i + 1].match(GOAL_REGEX)
    ) {
      i++;
      description += ' ' + lines[i].trim();
    }
    goals.push({ id: m[1].trim(), description });
  }
  return goals;
}

function parseWorkload(text: string): WorkloadEntry[] {
  const entries: WorkloadEntry[] = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(.+?)\s+(\d+)\s+hours?\s*$/i);
    if (m) entries.push({ activity: m[1].trim(), hours: parseInt(m[2]) });
  }
  return entries;
}

function parseModules(text: string): CourseModule[] {
  const modules: CourseModule[] = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(?:Module\s+)?(\d+)[:.]\s+(.+)$/);
    if (m) modules.push({ number: parseInt(m[1]), title: m[2].trim() });
  }
  return modules;
}

function extractAssessmentField(block: string, label: string): string {
  const idx = block.indexOf(label);
  if (idx === -1) return '';
  const after = block.slice(idx + label.length).replace(/^[:\s]+/, '');
  let end = after.length;
  for (const next of ASSESSMENT_TABLE_LABELS) {
    if (next === label) continue;
    const ni = after.indexOf(next);
    if (ni !== -1 && ni < end) end = ni;
  }
  return after.slice(0, end).trim().split('\n')[0].trim();
}

function extractGoalsFromBlock(block: string, allGoalIds: string[]): string[] {
  const goalSection = extractBlock(
    block,
    'Assessment of which course educational goal(s)',
    [],
  );
  if (!goalSection) return [];
  // Cross-reference with known goal IDs
  const found = allGoalIds.filter((id) => goalSection.includes(id));
  if (found.length > 0) return found;
  // Fallback: regex
  return [...goalSection.matchAll(GOAL_REGEX_G)].map((m) => m[1].trim());
}

function parseAssessments(text: string, goalIds: string[]): Assessment[] {
  const assessments: Assessment[] = [];

  // Anchor on "Weighting factor" occurrences to find each assessment block
  const wfPattern = /Weighting factor\s+(\d+)\s*%?/g;
  const wfMatches: { index: number; weight: number; len: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = wfPattern.exec(text)) !== null) {
    wfMatches.push({ index: m.index, weight: parseInt(m[1]), len: m[0].length });
  }

  for (let i = 0; i < wfMatches.length; i++) {
    const wf = wfMatches[i];
    const blockEnd = i + 1 < wfMatches.length ? wfMatches[i + 1].index : text.length;
    const block = text.slice(wf.index, blockEnd);

    // Find the assessment name: last short heading-like line before "Weighting factor".
    // Exclude: table label lines, goal-ID lines (BT\d{4}...), prose sentences
    // (end with . or ;), lines starting lowercase, and lines over 80 chars.
    const precedingStart = i > 0 ? wfMatches[i - 1].index + wfMatches[i - 1].len : 0;
    const preceding = text.slice(precedingStart, wf.index).trim();
    const nameLines = preceding
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 2 &&
          l.length < 80 &&
          !/^[a-z]/.test(l) &&
          !/[.;]$/.test(l) &&
          !/^BT\d{4}/.test(l) &&
          !ASSESSMENT_TABLE_LABELS.some((label) => l.startsWith(label)),
      );
    const name = nameLines[nameLines.length - 1] ?? 'Assessment';

    const resitRaw = extractAssessmentField(block, 'Opportunity to re-sit within the academic year');
    const resit = parseBool(resitRaw);
    const resitNote =
      resit && resitRaw.length > 3
        ? resitRaw.replace(/^yes[,.\s]*/i, '').trim() || null
        : null;

    // Submission deadlines from preceding prose
    const deadlines: string[] = [];
    for (const dm of preceding.matchAll(/(\d{2})-(\d{2})-(\d{4})/g)) {
      deadlines.push(`${dm[3]}-${dm[2]}-${dm[1]}`);
    }

    assessments.push({
      name,
      weighting_factor: wf.weight,
      form: extractAssessmentField(block, 'Form of examination'),
      group_or_individual: extractAssessmentField(block, 'Group or Individual'),
      formative_or_summative: extractAssessmentField(block, 'Formative or Summative'),
      mandatory: parseBool(extractAssessmentField(block, 'Mandatory for final grade')),
      minimum_grade: parseMinGrade(extractAssessmentField(block, 'Minimum grade applicable')),
      resit,
      resit_note: resitNote,
      company_interaction: parseBool(
        extractAssessmentField(block, 'Interaction/contact with company or organisation'),
      ),
      feedback_by: extractAssessmentField(block, 'Feedback or evaluation provided by:') ||
        extractAssessmentField(block, 'Feedback or evaluation provided by'),
      goals_assessed: extractGoalsFromBlock(block, goalIds),
      deadlines,
    });
  }

  return assessments;
}

function parseStudyMaterials(text: string): StudyMaterial[] {
  const isbnRegex = /\b(?:97[89])?\d{9}[\dX]\b/g;
  const materials: StudyMaterial[] = [];
  const seen = new Set<string>();

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const isbns = [...line.matchAll(isbnRegex)].map((m) => m[0]);
    const looksLikeCitation =
      /\(\d{4}\)/.test(line) || /^[A-Z][a-z]+,\s+[A-Z]/.test(line);

    const key = isbns[0] ?? line.slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);

    if (isbns.length > 0 || looksLikeCitation) {
      materials.push({ isbn: isbns[0] ?? null, citation: line });
    }
  }

  return materials;
}

function parseSDGs(text: string): string[] {
  const sdgs: string[] = [];
  const seen = new Set<number>();
  for (const m of text.matchAll(/Goal\s+(\d+)[:\s]+([^\n]+)/g)) {
    const n = parseInt(m[1]);
    if (n >= 1 && n <= 17 && !seen.has(n)) {
      seen.add(n);
      sdgs.push(`Goal ${n}: ${m[2].trim()}`);
    }
  }
  return sdgs;
}

function parseImportantDates(text: string): ImportantDate[] {
  const dates: ImportantDate[] = [];
  const timeRe = /(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})[.:](\d{2})/;

  for (const dm of text.matchAll(/(\d{2})-(\d{2})-(\d{4})/g)) {
    const iso = `${dm[3]}-${dm[2]}-${dm[1]}`;
    const lineStart = text.lastIndexOf('\n', dm.index) + 1;
    const lineEnd = text.indexOf('\n', dm.index);
    const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);

    const tm = line.match(timeRe);
    const start = tm
      ? `${iso}T${tm[1].padStart(2, '0')}:${tm[2]}`
      : iso;
    const end = tm ? `${iso}T${tm[3].padStart(2, '0')}:${tm[4]}` : null;

    const label = line
      .replace(/\d{2}-\d{2}-\d{4}/, '')
      .replace(timeRe, '')
      .trim()
      .replace(/[:-]+$/, '')
      .trim();

    dates.push({ label: label || 'Date', start, end });
  }

  return dates;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseCourseManual(rawText: string): CourseManual {
  const text = normalize(rawText);
  const sections = splitSections(text);
  const warnings: string[] = [];

  const details = parseDetails(sections['Details'] ?? '');
  const contactEmail = parseContactEmail(sections['Contact information and availability'] ?? '');
  const genai = parseGenAI(sections['Generative AI - RSM Policy'] ?? '');
  const learningGoals = parseLearningGoals(sections['Learning goals'] ?? '');
  const goalIds = learningGoals.map((g) => g.id);

  // Derive course code from goal IDs (e.g. "BT1207 PoS Goal 1" → "BT1207")
  const codeMatch = goalIds[0]?.match(/^(BT\d{4})/);
  const courseCode = codeMatch ? codeMatch[1] : '';

  const workload = parseWorkload(sections['Workload'] ?? '');
  const nonTotalRows = workload.filter((w) => w.activity.toLowerCase() !== 'total');
  const totalRow = workload.find((w) => w.activity.toLowerCase() === 'total');
  if (totalRow) {
    const computed = nonTotalRows.reduce((s, r) => s + r.hours, 0);
    if (computed !== totalRow.hours) {
      warnings.push(`Workload sum (${computed}h) does not match Total (${totalRow.hours}h)`);
    }
  }

  const modules = parseModules(sections['Session overview'] ?? '');

  const assessments = parseAssessments(sections['Assessment plan'] ?? '', goalIds);
  const weightSum = assessments.reduce((s, a) => s + (a.weighting_factor ?? 0), 0);
  if (assessments.length > 0 && weightSum !== 100) {
    warnings.push(`Assessment weights sum to ${weightSum}%, expected 100%`);
  }

  const studyMaterials = parseStudyMaterials(sections['Study materials'] ?? '');
  const sdgs = parseSDGs(sections['Reflection on UN Sustainable Development Goals'] ?? '');
  const importantDates = parseImportantDates(text);

  return {
    course_code: courseCode,
    course_name: '',
    teaching_block: details.teachingBlock,
    course_load_ec: details.courseLoad,
    coordinator: details.coordinator,
    teaching_staff: details.teachingStaff,
    course_activities: details.courseActivities,
    examination_format: details.examinationFormat,
    mandatory_attendance: details.mandatoryAttendance,
    pre_requisites: details.preRequisites,
    pre_requisites_note: details.preRequisitesNote,
    contact_email: contactEmail,
    genai,
    learning_goals: learningGoals,
    workload,
    modules,
    assessments,
    sdgs,
    study_materials: studyMaterials,
    important_dates: importantDates,
    raw_sections: {
      course_overview: sections['Course overview'] ?? '',
      course_activities_prose: sections['Course activities'] ?? '',
      session_overview_raw: sections['Session overview'] ?? '',
      assessment_plan_raw: sections['Assessment plan'] ?? '',
    },
    warnings,
    template_version_hint: {
      export_date: new Date().toISOString().slice(0, 10),
      headings_present: Object.keys(sections),
    },
  };
}
