# RSM Course Manual Extraction Spec

Deterministic parser spec for RSM/Osiris course-manual PDFs (e.g. BT1207, BT1213, BT1214). These PDFs are generated from a fixed template: almost every field appears as `Label: Value` or under a stable section heading, so a line-oriented scanner with a section-dispatch table is sufficient. No LLM required for the structured fields below.

---

## 1. Target output schema

```json
{
  "course_code": "BT1207",
  "course_name": "Philosophy of science",
  "teaching_block": "Block 1.4",
  "course_load_ec": 3,
  "coordinator": ["Isidora Sidorovska"],
  "teaching_staff": ["Pursey Heugens"],
  "course_activities": ["Lectures"],
  "examination_format": ["Assignment", "Written test", "(Practical) Exercise"],
  "mandatory_attendance": false,
  "pre_requisites": false,
  "pre_requisites_note": null,
  "contact_email": "philosophyofscience@rsm.nl",
  "genai": {
    "category": "Stimulated use of GenAI",
    "explanation": "Students are permitted to use GenAI to complete specific elements..."
  },
  "learning_goals": [
    { "id": "BT1207 PoS Goal 1", "description": "Understand the philosophical foundations underlying key concepts in management science" }
  ],
  "workload": [
    { "activity": "Readings (6 modules x 6 hours)", "hours": 36 },
    { "activity": "Plenary sessions (6 lectures x 2 hours)", "hours": 12 },
    { "activity": "Total", "hours": 84 }
  ],
  "modules": [
    { "number": 1, "title": "What is scientific knowledge?" }
  ],
  "assessments": [
    {
      "name": "Group project",
      "weighting_factor": 30,
      "form": "Assignment",
      "group_or_individual": "Group",
      "formative_or_summative": "Summative",
      "mandatory": true,
      "minimum_grade": null,
      "resit": true,
      "resit_note": "Improvement option for failed components 3.5–5.4; max grade 5.5.",
      "company_interaction": false,
      "feedback_by": "Teacher",
      "goals_assessed": ["BT1207 PoS Goal 1", "BT1207 PoS Goal 5", "BT1207 PoS Goal 6"],
      "deadlines": ["2026-03-13"]
    }
  ],
  "sdgs": ["Goal 4: Quality education"],
  "study_materials": [
    { "isbn": null, "citation": "Staley, K. W. (2025). An Introduction to the Philosophy of Science (2nd ed.). Cambridge: Cambridge University Press." }
  ],
  "important_dates": [
    { "label": "Written Exam", "start": "2026-06-02T13:30", "end": "2026-06-02T15:30" }
  ],
  "raw_sections": {
    "course_overview": "...",
    "course_activities_prose": "...",
    "session_overview_raw": "...",
    "course_plan_raw": "..."
  },
  "template_version_hint": {
    "export_date": "2025-11-21",
    "headings_present": ["Details", "Contact information...", "..."]
  }
}
```

Fields not present in a given manual should be `null` (or empty list), never omitted.

---

## 2. Fixed section headings (split anchors)

These strings appear verbatim as section markers. Split the full document text on them and dispatch each chunk to the parser for that section. Order is stable but a section may be missing — handle gracefully.

- `Details`
- `Contact information and availability`
- `Entry requirements/required background knowledge` *(optional)*
- `Generative AI - RSM Policy`
- `Course overview`
- `Learning goals`
- `Workload`
- `Course activities`
- `Attendance rules` *(optional)*
- `Registrations` *(optional)*
- `Session overview`
- `Examination`
- `Integrity statement`
- `Examination schedule`
- `Examination registration`
- `Examination perusal`
- `Retaking the course`
- `Validity of grades`
- `Assessment plan`
- `Bonus points` *(optional)*
- `Study materials`
- `Reflection on UN Sustainable Development Goals`
- `Other relevant information` *(optional)*

---

## 3. Per-section parsers

### 3.1 `Details` block

Flat `Label Value` pairs, one per line (label is left-aligned, value right-aligned in the PDF but `pdfplumber` output preserves the order). Expected labels and their targets:

| Label in PDF | JSON field | Type / notes |
|---|---|---|
| `Teaching block(s)` | `teaching_block` | string |
| `Course load` | `course_load_ec` | int (strip ` EC`) |
| `Coordinator` | `coordinator` | list of strings (split on newline) |
| `Teaching staff` | `teaching_staff` | list of strings |
| `Course activities` | `course_activities` | list of strings (split on `,`) |
| `Examination format` | `examination_format` | list of strings (split on `,`) |
| `Mandatory attendance` | `mandatory_attendance` | bool (`Yes`→true) |
| `Pre-requisites` | `pre_requisites` | bool; if `Yes, ...`, capture rest into `pre_requisites_note` |
| `Schedule` | discard (always the boilerplate about timetables.eur.nl) | — |

### 3.2 `Contact information and availability`

- `contact_email`: regex `[a-zA-Z0-9._%+-]+@rsm\.nl`, take the first match that is **not** a personal name (i.e. prefer addresses like `philosophyofscience@rsm.nl`, `informationmanagement@rsm.nl` over `poole@rsm.nl`). Heuristic: longest local-part, or local-part without a dot.
- Store the full section prose under `raw_sections.contact_prose` as fallback.

### 3.3 `Generative AI - RSM Policy`

Two sub-labels, always in this order:

- `Category of GenAI usage` → `genai.category`. Known controlled values so far: `Stimulated use of GenAI`, `Restrained use of GenAI`. Treat as free string but log unseen values.
- `GenAI usage explained` → `genai.explanation` (paragraph).

### 3.4 `Learning goals`

One goal per line. Regex:

```regex
^(BT\d{4}(?:\s+[A-Za-z]+)?\s+Goal\s+\d+)\s*[-:]\s*(.+)$
```

Capture groups → `{id, description}`. Handles both `BT1207 PoS Goal 1 - ...` and `BT1213 Goal 1 - ...`. Trim trailing whitespace. Some descriptions may wrap across lines — join continuation lines until the next line matches the goal-id regex or the section ends.

### 3.5 `Workload`

Lines of shape `<activity text>  <number> hours`. Regex:

```regex
^(.+?)\s+(\d+)\s+hours\s*$
```

Keep the `Total` row in the list (downstream validation uses it). **Checksum:** sum of non-total rows must equal the total; if not, flag in a `warnings` array but don't fail.

### 3.6 `Session overview`

Lines of shape `<number>: <title>` or `Module <number>: <title>`. Regex:

```regex
^(?:Module\s+)?(\d+):\s+(.+)$
```

### 3.7 `Assessment plan` — most important block

The section contains 1..N assessments. Each assessment has:

1. A **sub-heading** (the assessment name) on its own line. Examples seen: `Weekly Quizzes`, `Group project`, `Group Assignment`, `Written Exam`, `Written exam`.
2. Optional prose paragraph(s).
3. A **10-field template table**, always in this order:

| Label | JSON field | Parse |
|---|---|---|
| `Weighting factor` | `weighting_factor` | int, strip ` %` |
| `Form of examination` | `form` | string |
| `Group or Individual` | `group_or_individual` | enum: `Group`, `Individual` |
| `Formative or Summative` | `formative_or_summative` | enum: `Formative`, `Summative` |
| `Mandatory for final grade` | `mandatory` | bool |
| `Minimum grade applicable` | `minimum_grade` | float, or `null` if `Not applicable` |
| `Opportunity to re-sit within the academic year` | `resit` | bool; trailing prose → `resit_note` |
| `Interaction/contact with company or organisation` | `company_interaction` | bool |
| `Feedback or evaluation provided by:` | `feedback_by` | string (`Teacher`, `TA - Teaching assistant`, etc.) |
| `Assessment of which course educational goal(s)` | `goals_assessed` | list of goal IDs |

**Detection strategy.** Walk the section line by line. When you see `Weighting factor`, rewind to find the most recent non-empty line that is *not* one of the 10 labels and *not* prose starting with a lowercase letter — that's the assessment name. Then read the next 10 labeled rows (some values span multiple lines — a value continues until the next known label or a blank line).

**`goals_assessed` parsing.** The value is a multi-line block of goal IDs with descriptions. Extract just the IDs with the learning-goals regex from §3.4 and cross-reference them with the `learning_goals` list. Warn if a referenced ID isn't in that list.

**Deadlines.** If the prose above the table contains `Submission deadline: <DD-MM-YYYY>` or a `deadline group assignment` date in a schedule elsewhere in the doc, add to `deadlines` (ISO 8601).

### 3.8 `Study materials`

- **ISBNs:** regex `\b(?:97[89])?\d{9}[\dX]\b` (covers ISBN-10 and ISBN-13). Pair each ISBN with the nearest preceding citation-like line.
- **Citations:** lines that look like `Author, Title, edition, publisher, year.` — heuristic, no strict regex. Safe fallback: store the whole section under `raw_sections.study_materials_raw` and populate `study_materials` on a best-effort basis.

### 3.9 `Reflection on UN Sustainable Development Goals`

Lines of shape `Goal <N>: <name>`. Validate `N` is 1–17.

### 3.10 `Important dates` / course schedule tables

Not every manual has this as a distinct section (BT1214 does under `Important Dates`; BT1207 and BT1213 don't). Use two regexes across the whole document:

- Short form: `\b(\d{2})-(\d{2})-(\d{4})\b` → `YYYY-MM-DD`
- Long form: `\b(?:Mon|Tues?|Wed(?:nes)?|Thur?s?|Fri|Sat|Sun)[a-z]*,\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b`
- Time range: `(\d{1,2}[:.]\d{2})\s*[–-]\s*(\d{1,2}[:.]\d{2})` (note: PDF uses both `:` and `.` and both `–` and `-`; normalize to `:` and `-`).

Attach a label by taking the text of the line (or the immediately preceding non-empty line).

---

## 4. Booleans, enums, nulls

- Yes/No → `true`/`false`. Accept case-insensitively. `Yes, <note>` → `true` + capture note in a sibling `*_note` field.
- `Not applicable` → `null` for numeric fields.
- `Not applicable`/`N/A` → `null` for string fields only when the field is nullable by design; otherwise keep the raw string.

---

## 5. Validation checks (non-fatal)

Run after parsing; append failures to a top-level `warnings: string[]`:

1. Workload rows (excluding `Total`) sum to the `Total` hours.
2. Assessment `weighting_factor` values sum to 100.
3. Every `goals_assessed` ID resolves to an entry in `learning_goals`.
4. `course_code` from filename matches any `BT\d{4}` appearing in goal IDs.
5. Every extracted date is in the current or next academic year range (sanity bound — e.g. `2025-08-01` to `2027-08-01`).

---

## 6. Extraction pipeline

1. **Text extraction.** Use `pdfplumber` — preserves reading order adequately for these template PDFs and can fall back to `extract_tables()` for the `Details` block and the course-plan table in BT1214. If `pdfplumber` misorders columns, `pymupdf`'s `get_text("blocks")` sorted by `(y, x)` is a good alternative.
2. **Normalize.** Collapse runs of whitespace to single spaces *within lines*; preserve newlines. Normalize unicode dashes (`–`, `—`) to `-` for regex matching but keep the original in prose fields.
3. **Section split.** Use the heading list from §2 as split anchors. Produce a `dict[section_name, text]`.
4. **Dispatch.** Call the per-section parser from §3.
5. **Assemble.** Build the JSON object from §1.
6. **Validate.** Run §5 checks, attach `warnings`.
7. **Persist.** Emit one JSON file per course (e.g. `BT1207.json`). Index these for the website.

---

## 7. Out of scope (keep as raw text or defer to an LLM)

These are free prose or irregular tables. Store under `raw_sections.*` for now; a later pass can summarize them with an LLM if needed.

- `Course overview` / `Subject` / `Relevance` narrative
- `Course activities` prose (beyond the enum list already in `Details`)
- `Bonus points` section (variable structure: ERIM bonus, ETHE bonus, ERPS bonus — parseable per course but rule-writing cost is high for one-offs)
- BT1214's week-by-week **Course Plan** table (mixed cells with dates, subjects, chapter refs, instructors, and notes like "No on-campus lecture due to public holiday"). `pdfplumber.extract_tables()` gets most of it but row-level exceptions are common.
- BT1214's **chapter exclusion list** in study materials ("Pages 349-350 on … do not need to be studied")

---

## 8. Directory layout suggestion

```
/data
  /manuals-pdf
    BT1207.pdf
    BT1213.pdf
    BT1214.pdf
  /manuals-json
    BT1207.json
    BT1213.json
    BT1214.json
/lib
  /extract
    index.ts            # orchestrator
    sections.ts         # split anchors + dispatch
    details.ts          # §3.1
    genai.ts            # §3.3
    goals.ts            # §3.4
    workload.ts         # §3.5
    modules.ts          # §3.6
    assessments.ts      # §3.7 (most complex — warrants its own test suite)
    materials.ts        # §3.8
    sdgs.ts             # §3.9
    dates.ts            # §3.10
    validate.ts         # §5
    types.ts            # schema from §1
```

---

## 9. Test fixtures

Use the three attached manuals (BT1207, BT1213, BT1214) as golden fixtures. Expected highlights per course to drive test assertions:

**BT1207 — Philosophy of science**
- 3 EC, Block 1.4
- GenAI: `Stimulated use of GenAI`
- 6 learning goals, 6 modules
- 3 assessments: Weekly Quizzes (10%), Group project (30%, mandatory, deadline 2026-03-13), Written Exam (60%, min grade 4.5, mandatory)
- SDG: Goal 4

**BT1213 — Business information management**
- 4 EC, Block 1.5
- GenAI: `Restrained use of GenAI`
- 6 learning goals, 7 modules
- 2 assessments: Group Assignment (25%), Written exam (75%, min grade 4.5, mandatory)
- SDGs: Goal 8, Goal 9, Goal 12
- ISBN present: `9781292450360`, `9781292450452`

**BT1214 — Operations management**
- 4 EC, Block 1.5
- GenAI: `Restrained use of GenAI`
- 4 learning goals, no numbered module list (has a week-by-week course plan instead)
- 1 assessment (Written exam, 100%, mandatory); bonus points documented separately
- Important Dates section with 4 entries: 2 ETHEs (2026-04-23, 2026-05-15), Written Exam (2026-06-02 13:30–15:30), Resit (2026-07-10 09:30–11:30)
- ISBNs present: `9781292444833`, `9781292444918`, `9781292444932`
- SDGs: Goal 8, Goal 9
