'use client';

import { useEffect, useState, useCallback } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Mail, ClipboardPaste, ExternalLink, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import * as Storage from '@/lib/storage';
import type { CourseManual, Assessment } from '@/lib/extract/types';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(courseId: number) {
  return `cc.manual.${courseId}`;
}

type ManualState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'not-extractable' }
  | { status: 'error'; message: string }
  | { status: 'paste-required'; sqillUrl: string }
  | { status: 'pasting' }
  | { status: 'ok'; data: CourseManual };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
      {children}
    </p>
  );
}

function CardRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-4 py-3 rounded-xl bg-card ring-1 ring-foreground/10 ${className ?? ''}`}>
      {children}
    </div>
  );
}

function AssessmentCard({ a }: { a: Assessment }) {
  return (
    <CardRow>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{a.name}</span>
          {a.weighting_factor !== null && (
            <Badge variant="outline" className="font-mono text-xs">{a.weighting_factor}%</Badge>
          )}
          {a.form && <Badge variant="outline" className="text-xs">{a.form}</Badge>}
          {a.group_or_individual && (
            <Badge variant="outline" className="text-xs">{a.group_or_individual}</Badge>
          )}
          {a.mandatory && (
            <Badge className="text-xs bg-foreground/10 text-foreground hover:bg-foreground/10">
              Mandatory
            </Badge>
          )}
          {a.minimum_grade !== null && (
            <Badge variant="outline" className="text-xs">Min grade: {a.minimum_grade}</Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {a.formative_or_summative && <span>{a.formative_or_summative}</span>}
          {a.feedback_by && <span>Feedback by {a.feedback_by}</span>}
          {a.resit && (
            <span>Resit available{a.resit_note ? ` — ${a.resit_note}` : ''}</span>
          )}
        </div>

        {a.deadlines.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {a.deadlines.map((d) => (
              <span key={d} className="text-muted-foreground">
                Deadline: <span className="text-foreground font-mono">{d}</span>
              </span>
            ))}
          </div>
        )}

      </div>
    </CardRow>
  );
}

function RawSectionsCollapsible({ sections }: { sections: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(sections).filter(([, v]) => v);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide w-fit hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Raw sections
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          {entries.map(([key, value]) => (
            <CardRow key={key}>
              <p className="text-xs font-mono text-muted-foreground mb-1">{key}</p>
              <p className="text-sm whitespace-pre-wrap">{value}</p>
            </CardRow>
          ))}
        </div>
      )}
    </div>
  );
}

function isPdfManual(data: CourseManual): boolean {
  return data.template_version_hint.headings_present[0] === '__pdf__';
}

function FullTextCollapsible({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide w-fit hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Full manual text
      </button>
      {open && (
        <CardRow>
          <p className="text-xs whitespace-pre-wrap leading-relaxed font-mono text-muted-foreground max-h-[60vh] overflow-y-auto">
            {text}
          </p>
        </CardRow>
      )}
    </div>
  );
}

function PdfManualView({ data: m }: { data: CourseManual }) {
  return (
    <div className="flex flex-col gap-6">

      <CardRow className="flex items-start gap-3 ring-amber-500/40">
        <BookOpen className="size-4 text-amber-500 mt-0.5 shrink-0" />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">Partial extraction from PDF</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This manual uses a non-standard format. Some fields were extracted automatically
            but may be incomplete — expand the full text below to read the original.
          </p>
        </div>
      </CardRow>

      {m.course_name && (
        <div className="flex flex-col gap-1">
          <SectionLabel>Course</SectionLabel>
          <p className="text-base font-semibold">{m.course_name}</p>
        </div>
      )}

      {m.mandatory_attendance !== null && (
        <CardRow className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            Attendance: {m.mandatory_attendance ? 'Mandatory' : 'Not mandatory'}
          </Badge>
        </CardRow>
      )}

      {(m.coordinator.length > 0 || m.contact_email) && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Contact</SectionLabel>
          <CardRow>
            <div className="flex flex-col gap-1 text-sm">
              {m.coordinator.length > 0 && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-28 shrink-0">Coordinator</span>
                  <span className="font-medium">{m.coordinator.join(', ')}</span>
                </div>
              )}
              {m.contact_email && (
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5 text-muted-foreground shrink-0" />
                  <a
                    href={`mailto:${m.contact_email}`}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {m.contact_email}
                  </a>
                </div>
              )}
            </div>
          </CardRow>
        </div>
      )}

      {m.assessments.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Grade components (extracted)</SectionLabel>
          {m.assessments.map((a) => <AssessmentCard key={a.name} a={a} />)}
          <p className="text-xs text-muted-foreground px-1">
            Weights extracted from document text — verify against the original PDF.
          </p>
        </div>
      )}

      {m.study_materials.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Study materials</SectionLabel>
          {m.study_materials.map((mat, i) => (
            <CardRow key={i} className="flex flex-col gap-1">
              <p className="text-sm">{mat.citation}</p>
              {mat.isbn && <p className="text-xs font-mono text-muted-foreground">ISBN {mat.isbn}</p>}
            </CardRow>
          ))}
        </div>
      )}

      {m.important_dates.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Important dates</SectionLabel>
          {m.important_dates.map((d, i) => (
            <CardRow key={i} className="flex items-center justify-between gap-3 text-sm">
              <span>{d.label}</span>
              <span className="font-mono tabular-nums text-xs text-muted-foreground">
                {new Date(d.start).toLocaleString('en-GB', { dateStyle: 'medium' })}
              </span>
            </CardRow>
          ))}
        </div>
      )}

      <FullTextCollapsible text={m.raw_sections.full_text ?? ''} />

      {m.warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {m.warnings.map((w, i) => (
            <div key={i} className="px-4 py-3 rounded-xl bg-card ring-1 ring-amber-500/40 text-xs text-muted-foreground">
              {w}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

export function ManualTab({ courseId }: { courseId: number }) {
  const [state, setState] = useState<ManualState>({ status: 'loading' });

  useEffect(() => {
    const cached = Storage.getWithTTL<CourseManual>(cacheKey(courseId), CACHE_TTL_MS);
    if (cached && 'course_code' in cached && Array.isArray(cached.examination_format)) {
      if (cached.template_version_hint.headings_present.length === 0) {
        setState({ status: 'not-extractable' });
      } else {
        setState({ status: 'ok', data: cached });
      }
      return;
    }

    const token = Storage.get<string>('cc.token');
    if (!token) {
      setState({ status: 'error', message: 'No Canvas token configured.' });
      return;
    }

    setState({ status: 'loading' });
    fetch(`/api/manual/${courseId}`, {
      headers: { 'x-canvas-token': token },
      signal: AbortSignal.timeout(60_000),
    })
      .then(async (res) => {
        if (res.status === 404) { setState({ status: 'not-found' }); return; }
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (!res.ok) {
          setState({ status: 'error', message: (body.error as string) ?? 'Failed to load manual.' });
          return;
        }
        if (body.requires_paste) {
          setState({ status: 'paste-required', sqillUrl: body.sqill_url as string });
          return;
        }
        const data = body as unknown as CourseManual;
        const isEmpty = data.template_version_hint.headings_present.length === 0;
        if (isEmpty) { setState({ status: 'not-extractable' }); return; }
        Storage.setWithTTL(cacheKey(courseId), data);
        setState({ status: 'ok', data });
      })
      .catch(() => setState({ status: 'error', message: 'Network error.' }));
  }, [courseId]);

  const handlePaste = useCallback(async () => {
    const token = Storage.get<string>('cc.token');
    if (!token) return;
    setState({ status: 'pasting' });
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { setState((s) => s.status === 'pasting' ? { status: 'error', message: 'Clipboard is empty.' } : s); return; }
      const res = await fetch(`/api/manual/${courseId}`, {
        method: 'POST',
        headers: { 'x-canvas-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json() as CourseManual;
      if (!res.ok) { setState({ status: 'error', message: (data as unknown as { error?: string }).error ?? 'Parse failed.' }); return; }
      Storage.setWithTTL(cacheKey(courseId), data);
      setState({ status: 'ok', data });
    } catch {
      setState({ status: 'error', message: 'Could not read clipboard. Make sure you copied the page text first.' });
    }
  }, [courseId]);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    );
  }

  if (state.status === 'paste-required' || state.status === 'pasting') {
    const sqillUrl = state.status === 'paste-required' ? state.sqillUrl : '';
    return (
      <div className="flex flex-col items-center gap-5 py-12 text-center">
        <BookOpen className="size-10 opacity-20 text-muted-foreground" />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Manual requires one-time setup</p>
          <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
            Open the course manual, select all text{' '}
            <kbd className="px-1 py-0.5 rounded bg-foreground/10 font-mono text-xs">Ctrl+A</kbd>{' '}
            and copy it{' '}
            <kbd className="px-1 py-0.5 rounded bg-foreground/10 font-mono text-xs">Ctrl+C</kbd>,
            then click the button below.
          </p>
        </div>
        {sqillUrl && (
          <a
            href={sqillUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="size-3.5" />
            Open course manual
          </a>
        )}
        <button
          onClick={handlePaste}
          disabled={state.status === 'pasting'}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium disabled:opacity-50 transition-opacity"
        >
          {state.status === 'pasting'
            ? <><Loader2 className="size-4 animate-spin" /> Parsing…</>
            : <><ClipboardPaste className="size-4" /> Parse from clipboard</>}
        </button>
      </div>
    );
  }

  if (state.status === 'not-extractable') {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground text-center">
        <BookOpen className="size-12 opacity-20" />
        <p className="text-sm font-medium text-foreground">Manual found but format not supported</p>
        <p className="text-xs max-w-sm leading-relaxed">
          This course uses a PDF manual that doesn&apos;t follow the standard template.
          Open it directly in Canvas to read it.
        </p>
      </div>
    );
  }

  if (state.status === 'not-found') {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <BookOpen className="size-12 opacity-20" />
        <p className="text-sm">No course manual link found in Canvas modules.</p>
        <p className="text-xs opacity-60">
          Add an &quot;Open course manual&quot; external link to the course modules to enable this tab.
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">{state.message}</p>
    );
  }

  if (isPdfManual(state.data)) {
    return <PdfManualView data={state.data} />;
  }

  const { data: m } = state;

  return (
    <div className="flex flex-col gap-6">

      {/* 1. Meta strip */}
      <CardRow className="flex flex-wrap items-center gap-2">
        {m.course_load_ec !== null && (
          <Badge variant="outline" className="font-mono text-xs">{m.course_load_ec} EC</Badge>
        )}
        {m.teaching_block && (
          <Badge variant="outline" className="text-xs">Block {m.teaching_block}</Badge>
        )}
        {m.mandatory_attendance !== null && (
          <Badge variant="outline" className="text-xs">
            Attendance: {m.mandatory_attendance ? 'Mandatory' : 'Not mandatory'}
          </Badge>
        )}
        {m.genai && (
          <Badge variant="outline" className="text-xs">{m.genai.category}</Badge>
        )}
        {m.examination_format.map((f) => (
          <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
        ))}
      </CardRow>

      {/* 2. Staff */}
      {(m.coordinator.length > 0 || m.teaching_staff.length > 0) && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Staff</SectionLabel>
          <CardRow>
            <div className="flex flex-col gap-1 text-sm">
              {m.coordinator.length > 0 && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-28 shrink-0">Coordinator</span>
                  <span className="font-medium">{m.coordinator.join(', ')}</span>
                </div>
              )}
              {m.teaching_staff.length > 0 && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-28 shrink-0">Teaching staff</span>
                  <span>{m.teaching_staff.join(', ')}</span>
                </div>
              )}
            </div>
          </CardRow>
        </div>
      )}

      {/* 3. Assessments */}
      {m.assessments.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Assessments</SectionLabel>
          {m.assessments.map((a) => (
            <AssessmentCard key={a.name} a={a} />
          ))}
        </div>
      )}

      {/* 4. Learning Goals */}
      {m.learning_goals.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Learning Goals</SectionLabel>
          {m.learning_goals.map((g) => (
            <CardRow key={g.id} className="flex items-start gap-3">
              <Badge variant="outline" className="font-mono text-xs shrink-0 mt-0.5">
                {g.id}
              </Badge>
              <span className="text-sm">{g.description}</span>
            </CardRow>
          ))}
        </div>
      )}

      {/* 5. Modules */}
      {m.modules.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Modules</SectionLabel>
          {m.modules.map((mod) => (
            <CardRow key={mod.number} className="flex items-center gap-3">
              <Badge variant="outline" className="font-mono text-xs shrink-0">
                {mod.number}
              </Badge>
              <span className="text-sm">{mod.title}</span>
            </CardRow>
          ))}
        </div>
      )}

      {/* 6. Workload */}
      {m.workload.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Workload</SectionLabel>
          <CardRow>
            <div className="flex flex-col divide-y divide-foreground/5">
              {m.workload.map((row, i) => {
                const isTotal = row.activity.toLowerCase() === 'total';
                return (
                  <div
                    key={i}
                    className={`flex justify-between items-center py-2 first:pt-0 last:pb-0 text-sm${isTotal ? ' font-semibold' : ''}`}
                  >
                    <span className={isTotal ? '' : 'text-muted-foreground'}>{row.activity}</span>
                    <span className="font-mono tabular-nums">{row.hours}h</span>
                  </div>
                );
              })}
            </div>
          </CardRow>
        </div>
      )}

      {/* 7. Important Dates */}
      {m.important_dates.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Important Dates</SectionLabel>
          {m.important_dates.map((d, i) => (
            <CardRow key={i} className="flex items-center justify-between gap-3 text-sm">
              <span>{d.label}</span>
              <span className="font-mono tabular-nums text-xs text-muted-foreground">
                {new Date(d.start).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                {d.end &&
                  ` – ${new Date(d.end).toLocaleTimeString('en-GB', { timeStyle: 'short' })}`}
              </span>
            </CardRow>
          ))}
        </div>
      )}

      {/* 8. Study Materials */}
      {m.study_materials.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Study Materials</SectionLabel>
          {m.study_materials.map((mat, i) => (
            <CardRow key={i} className="flex flex-col gap-1">
              <p className="text-sm">{mat.citation}</p>
              {mat.isbn && (
                <p className="text-xs font-mono text-muted-foreground">ISBN {mat.isbn}</p>
              )}
            </CardRow>
          ))}
        </div>
      )}

      {/* 9. SDGs */}
      {m.sdgs.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>UN Sustainable Development Goals</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {m.sdgs.map((sdg) => (
              <Badge key={sdg} variant="outline" className="text-xs">{sdg}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* 10. Contact */}
      {m.contact_email && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Contact</SectionLabel>
          <CardRow className="flex items-center gap-2 text-sm">
            <Mail className="size-3.5 text-muted-foreground shrink-0" />
            <a
              href={`mailto:${m.contact_email}`}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {m.contact_email}
            </a>
          </CardRow>
        </div>
      )}

      {/* 11. GenAI Policy */}
      {m.genai && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Generative AI Policy</SectionLabel>
          <CardRow className="flex flex-col gap-2">
            <Badge variant="outline" className="text-xs w-fit">{m.genai.category}</Badge>
            <p className="text-sm text-muted-foreground leading-relaxed">{m.genai.explanation}</p>
          </CardRow>
        </div>
      )}

      {/* 12. Pre-requisites */}
      {m.pre_requisites !== null && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Pre-requisites</SectionLabel>
          <CardRow className="text-sm">
            {m.pre_requisites ? (
              <>
                <span>Yes</span>
                {m.pre_requisites_note && (
                  <p className="text-muted-foreground mt-1">{m.pre_requisites_note}</p>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">No pre-requisites</span>
            )}
          </CardRow>
        </div>
      )}

      {/* 13. Warnings */}
      {m.warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Warnings</SectionLabel>
          {m.warnings.map((w, i) => (
            <div key={i} className="px-4 py-3 rounded-xl bg-card ring-1 ring-yellow-500/40 text-sm">
              {w}
            </div>
          ))}
        </div>
      )}

      {/* 14. Raw sections (debug, collapsed) */}
      <RawSectionsCollapsible sections={m.raw_sections} />
    </div>
  );
}
