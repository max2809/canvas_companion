'use client';

import { useMemo, useState } from 'react';
import { RefreshCcw, ExternalLink, BookOpen, CalendarCheck, MapPin, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useCanvasData } from '@/lib/hooks';
import type { EnrichedAssignment } from '@/lib/canvas';
import type { TimetableEvent } from '@/lib/timetable';
import { eventsInRange } from '@/lib/timetable';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// 6-hue palette, vary H, fixed S/L for dark mode legibility
const COURSE_HUES = [200, 30, 145, 280, 15, 170];

function courseColor(courseId: number): string {
  const hash = (courseId * 2654435761) >>> 0;
  return `hsl(${COURSE_HUES[hash % COURSE_HUES.length]}, 65%, 60%)`;
}

function courseColorByCode(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  return `hsl(${COURSE_HUES[hash % COURSE_HUES.length]}, 65%, 60%)`;
}

function isSubmitted(a: EnrichedAssignment): boolean {
  const ws = a.submission?.workflow_state;
  return ws === 'submitted' || ws === 'graded' || ws === 'pending_review';
}

function humanizeDue(dueAt: string | null, submitted: boolean): string {
  if (submitted) return 'Submitted';
  if (!dueAt) return 'No due date';

  const now = new Date();
  const due = new Date(dueAt);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - todayStart.getTime()) / 86400000);

  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(due.getHours())}:${pad(due.getMinutes())}`;

  if (diffDays < -1) return `Due ${Math.abs(diffDays)} days ago`;
  if (diffDays === -1) return 'Due yesterday';
  if (diffDays === 0) return `Due today at ${time}`;
  if (diffDays === 1) return `Due tomorrow at ${time}`;
  if (diffDays <= 7) return `Due in ${diffDays} days`;

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Due ${DAYS[due.getDay()]} ${due.getDate()} ${MONTHS[due.getMonth()]}`;
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

interface Groups {
  overdue: EnrichedAssignment[];
  today: EnrichedAssignment[];
  thisWeek: EnrichedAssignment[];
  upcoming: EnrichedAssignment[];
  recentlySubmitted: EnrichedAssignment[];
}

function groupAssignments(assignments: EnrichedAssignment[]): Groups {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  const in7 = new Date(todayStart.getTime() + 7 * 86400000);
  const in8 = new Date(todayStart.getTime() + 8 * 86400000);
  const in31 = new Date(todayStart.getTime() + 31 * 86400000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const twoDaysFromNow = new Date(now.getTime() + 2 * 86400000);

  const byDue = (a: EnrichedAssignment, b: EnrichedAssignment) => {
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  };

  const overdue: EnrichedAssignment[] = [];
  const today: EnrichedAssignment[] = [];
  const thisWeek: EnrichedAssignment[] = [];
  const upcoming: EnrichedAssignment[] = [];
  const recentlySubmitted: EnrichedAssignment[] = [];

  for (const a of assignments) {
    if (a.omit_from_final_grade && (!a.due_at || new Date(a.due_at) > twoDaysFromNow)) continue;

    const submitted = isSubmitted(a);

    if (submitted) {
      if (a.submission?.submitted_at && new Date(a.submission.submitted_at) >= sevenDaysAgo) {
        recentlySubmitted.push(a);
      }
      continue;
    }

    const dueDate = a.due_at ? new Date(a.due_at) : null;
    const dueDayStart = dueDate
      ? new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
      : null;

    if (dueDate && dueDate < now) {
      const missing = a.submission?.missing === true;
      const unsubmitted = !a.submission || a.submission.workflow_state === 'unsubmitted';
      if (missing || unsubmitted) {
        overdue.push(a);
        continue;
      }
    }

    if (!dueDayStart) continue;

    if (dueDayStart.getTime() === todayStart.getTime()) {
      today.push(a);
      continue;
    }

    if (dueDayStart >= tomorrowStart && dueDayStart <= in7) {
      thisWeek.push(a);
      continue;
    }

    if (dueDayStart >= in8 && dueDayStart < in31) {
      upcoming.push(a);
    }
  }

  return {
    overdue: overdue.sort(byDue),
    today: today.sort(byDue),
    thisWeek: thisWeek.sort(byDue),
    upcoming: upcoming.sort(byDue),
    recentlySubmitted: recentlySubmitted.sort(byDue),
  };
}

function AssignmentCard({ a, muted }: { a: EnrichedAssignment; muted?: boolean }) {
  const submitted = isSubmitted(a);
  const color = courseColor(a.course_id);

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl bg-card text-sm text-card-foreground border border-border px-4 py-3 transition-all duration-150 hover:border-white/12 hover:bg-card/80',
        muted && 'opacity-50'
      )}
    >
      <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="font-mono text-[10px] font-semibold uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded"
            style={{ background: `${color}22`, color }}
          >
            {a.course_code_short}
          </span>
          <span className="font-medium truncate text-foreground">{a.name}</span>
        </div>
        <span className="text-xs text-muted-foreground truncate mt-0.5">{a.course_name}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {humanizeDue(a.due_at, submitted)}
          {a.points_possible != null && a.points_possible > 0 && ` · ${a.points_possible} pts`}
        </span>
        <a
          href={a.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          Open <ExternalLink className="size-3 ml-1" />
        </a>
      </div>
    </div>
  );
}

function Section({
  title,
  accent,
  muted,
  items,
}: {
  title: string;
  accent?: boolean;
  muted?: boolean;
  items: EnrichedAssignment[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <h2
          className={cn(
            'text-[10px] font-bold uppercase tracking-[0.15em]',
            accent ? 'text-tl-red' : 'text-muted-foreground'
          )}
        >
          {title}
        </h2>
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] text-muted-foreground">{items.length}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((a) => (
          <AssignmentCard key={`${a.course_id}-${a.id}`} a={a} muted={muted} />
        ))}
      </div>
    </div>
  );
}

// --- Timetable helpers ---

function getWeekBounds(offsetWeeks = 0): { monday: Date; sunday: Date } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday + offsetWeeks * 7);
  const sunday = new Date(monday.getTime() + 6 * 86400000 + 86399999);
  return { monday, sunday };
}

function formatWeekLabel(monday: Date, sunday: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.toLocaleDateString('en-GB', opts)} – ${sunday.getDate()} ${sunday.toLocaleDateString('en-GB', { month: 'short' })}`;
  }
  return `${monday.toLocaleDateString('en-GB', opts)} – ${sunday.toLocaleDateString('en-GB', opts)}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface EventDetailModalProps {
  event: TimetableEvent;
  onClose: () => void;
}

function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full mx-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-base leading-tight">{event.title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="size-4" />
          </button>
        </div>
        {event.eventTypeGuess && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground w-fit">
            {event.eventTypeGuess}
          </span>
        )}
        <p className="text-sm text-muted-foreground">
          {event.isAllDay
            ? new Date(event.start).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
            : `${new Date(event.start).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · ${formatTime(event.start)}–${formatTime(event.end)}`
          }
        </p>
        {event.location && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            {event.location}
          </div>
        )}
        {event.description && (
          <p className="text-xs text-muted-foreground border-t border-border pt-3 whitespace-pre-line line-clamp-6">
            {event.description}
          </p>
        )}
      </div>
    </div>
  );
}

function ThisWeekClasses({
  events,
  loading,
  error,
  onRetry,
}: {
  events: TimetableEvent[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [selectedEvent, setSelectedEvent] = useState<TimetableEvent | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const { monday, sunday } = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);

  const weekEvents = useMemo(
    () => eventsInRange(events, monday, sunday),
    [events, monday, sunday]
  );

  const today = new Date();
  const todayDow = today.getDay() === 0 ? 6 : today.getDay() - 1;

  // Group events by day-of-week index (0=Mon)
  const byDay: TimetableEvent[][] = Array.from({ length: 7 }, () => []);
  for (const ev of weekEvents) {
    const d = new Date(ev.start);
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
    byDay[dow].push(ev);
  }
  for (const arr of byDay) arr.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return (
    <>
      {selectedEvent && (
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground w-28 shrink-0">
            {weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week' : formatWeekLabel(monday, sunday)}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekOffset(o => o - 1)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
              aria-label="Previous week"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="text-[9px] w-8 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
              style={{ visibility: weekOffset !== 0 ? 'visible' : 'hidden' }}
            >
              Today
            </button>
            <button
              onClick={() => setWeekOffset(o => o + 1)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
              aria-label="Next week"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="flex-1 h-px bg-border" />
          <a
            href="https://timetables.eur.nl"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            View full timetable <ExternalLink className="size-2.5" />
          </a>
        </div>

        {error && (
          <div className="flex items-center gap-3 rounded-lg bg-destructive/15 border border-destructive/20 px-4 py-3">
            <p className="flex-1 text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
          </div>
        )}

        {loading && (
          <Skeleton className="h-24 rounded-xl" />
        )}

        {!loading && !error && weekEvents.length === 0 && (
          <p className="text-sm text-muted-foreground">No classes scheduled this week.</p>
        )}

        {!loading && !error && weekEvents.length > 0 && (
          <div className="grid grid-cols-7 gap-1.5 max-sm:grid-cols-1">
            {WEEK_DAYS.map((label, i) => {
              const isToday = weekOffset === 0 && i === todayDow;
              const dayEvents = byDay[i];
              return (
                <div
                  key={label}
                  className={cn(
                    'flex flex-col gap-1 rounded-xl p-2 min-h-16',
                    isToday
                      ? 'bg-card border border-white/10'
                      : 'bg-card/40 border border-border'
                  )}
                >
                  <span
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-wider mb-0.5',
                      isToday ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </span>
                  {dayEvents.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground/40">—</span>
                  ) : (
                    dayEvents.map((ev) => {
                      const color = ev.courseCodeShort
                        ? courseColorByCode(ev.courseCodeShort)
                        : 'hsl(220,10%,60%)';
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className="text-left flex flex-col gap-0.5 rounded-lg px-1.5 py-1 hover:bg-white/5 transition-colors w-full"
                        >
                          {!ev.isAllDay && (
                            <span className="text-[9px] text-muted-foreground">
                              {formatTime(ev.start)}–{formatTime(ev.end)}
                            </span>
                          )}
                          <span className="text-[10px] font-medium leading-tight truncate" style={{ color }}>
                            {ev.title}
                          </span>
                          {ev.courseCodeShort && (
                            <span
                              className="text-[9px] font-mono font-semibold px-1 rounded"
                              style={{ background: `${color}22`, color }}
                            >
                              {ev.courseCodeShort}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export default function DashboardPage() {
  const {
    assignments, loading, error, refresh, user,
    timetableUrl, timetableEvents, timetableLoading, timetableError, refreshTimetable,
  } = useCanvasData();

  const groups = useMemo(() => groupAssignments(assignments), [assignments]);
  const weekCount = groups.today.length + groups.thisWeek.length;
  const hasData = assignments.length > 0;
  const noToken = error === 'no-token';
  const realError = error && error !== 'no-token' ? error : null;

  return (
    <>
      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {user ? (
              <i>Welcome back, <span className="gradient-text">{user.name.split(' ')[0]}</span>!</i>
            ) : (
              'Dashboard'
            )}
          </h1>
          {!noToken && (
            <p className="text-muted-foreground mt-1.5 text-sm">
              {todayLabel()} · <span className="text-foreground/80 font-medium">{weekCount}</span> assignment{weekCount !== 1 ? 's' : ''} due this week
            </p>
          )}
        </div>
        {!noToken && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { refresh(); refreshTimetable(); }}
            disabled={loading}
          >
            <RefreshCcw className={cn('size-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        )}
      </div>

      {/* No token: empty state */}
      {noToken && (
        <div className="flex items-center justify-center min-h-64">
          <div className="flex flex-col items-center gap-4 text-center max-w-xs">
            <BookOpen className="size-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">
              Connect your Canvas account to get started
            </h2>
            <Link href="/settings" className={buttonVariants()}>
              Go to Settings
            </Link>
          </div>
        </div>
      )}

      {!noToken && (
        <>
          {/* Error banner */}
          {realError && (
            <div className="flex items-center gap-3 rounded-lg bg-destructive/15 border border-destructive/20 px-4 py-3 mb-6">
              <p className="flex-1 text-sm text-destructive">{realError}</p>
              <Button variant="outline" size="sm" onClick={refresh}>
                Retry
              </Button>
            </div>
          )}

          {/* Loading skeletons (no cached data yet) */}
          {loading && !hasData && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          )}

          {/* Empty state (loaded, no assignments) */}
          {!loading && !hasData && !realError && (
            <div className="flex items-center justify-center min-h-64">
              <div className="flex flex-col items-center gap-3 text-center max-w-xs">
                <CalendarCheck className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No upcoming assignments found.</p>
              </div>
            </div>
          )}

          {/* Timetable section + assignment sections */}
          <div className="flex flex-col gap-8">
            {timetableUrl && (
              <ThisWeekClasses
                events={timetableEvents}
                loading={timetableLoading}
                error={timetableError}
                onRetry={refreshTimetable}
              />
            )}
            {hasData && (
              <>
                <Section title="Overdue" accent items={groups.overdue} />
                <Section title="Today" items={groups.today} />
                <Section title="This Week" items={groups.thisWeek} />
                <Section title="Upcoming" items={groups.upcoming} />
                <Section title="Recently Submitted" muted items={groups.recentlySubmitted} />
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
