'use client';

import { useMemo } from 'react';
import { RefreshCcw, ExternalLink, BookOpen, CalendarCheck } from 'lucide-react';
import Link from 'next/link';
import { useCanvasData } from '@/lib/hooks';
import type { EnrichedAssignment } from '@/lib/canvas';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// 6-hue palette, vary H, fixed S/L for dark mode legibility
const COURSE_HUES = [200, 30, 145, 280, 15, 170];

function courseColor(courseId: number): string {
  const hash = (courseId * 2654435761) >>> 0;
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
    // Skip omit_from_final_grade items more than 2 days away
    if (a.omit_from_final_grade && (!a.due_at || new Date(a.due_at) > twoDaysFromNow)) continue;

    const submitted = isSubmitted(a);

    // Recently submitted: within last 7 days
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

    // Overdue: past due_at, missing or unsubmitted
    if (dueDate && dueDate < now) {
      const missing = a.submission?.missing === true;
      const unsubmitted = !a.submission || a.submission.workflow_state === 'unsubmitted';
      if (missing || unsubmitted) {
        overdue.push(a);
        continue;
      }
    }

    if (!dueDayStart) continue;

    // Today
    if (dueDayStart.getTime() === todayStart.getTime()) {
      today.push(a);
      continue;
    }

    // This week: tomorrow through 7 days from today
    if (dueDayStart >= tomorrowStart && dueDayStart <= in7) {
      thisWeek.push(a);
      continue;
    }

    // Upcoming: 8–30 days
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
        'flex items-center gap-3 rounded-xl bg-card text-sm text-card-foreground ring-1 ring-foreground/10 px-4 py-3',
        muted && 'opacity-60'
      )}
    >
      <div className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-xs text-muted-foreground uppercase shrink-0">
            {a.course_code_short}
          </span>
          <span className="text-muted-foreground text-xs shrink-0">·</span>
          <span className="font-medium truncate">{a.name}</span>
        </div>
        <span className="text-xs text-muted-foreground truncate">{a.course_name}</span>
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
          Open in Canvas <ExternalLink className="size-3 ml-1" />
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
    <div className="flex flex-col gap-2">
      <h2
        className={cn(
          'text-xs font-semibold uppercase tracking-widest',
          accent ? 'text-red-500' : 'text-muted-foreground'
        )}
      >
        {title}
      </h2>
      <div className="flex flex-col gap-2">
        {items.map((a) => (
          <AssignmentCard key={`${a.course_id}-${a.id}`} a={a} muted={muted} />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { assignments, loading, error, refresh, user } = useCanvasData();

  const groups = useMemo(() => groupAssignments(assignments), [assignments]);
  const weekCount = groups.today.length + groups.thisWeek.length;
  const hasData = assignments.length > 0;
  const noToken = error === 'no-token';
  const realError = error && error !== 'no-token' ? error : null;

  return (
    <>
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold italic">
            {user ? `Welcome, ${user.name}!` : 'Dashboard'}
          </h1>
          {!noToken && (
            <p className="text-muted-foreground mt-1 text-sm">
              {todayLabel()} · <span className="font-mono">{weekCount}</span> assignment{weekCount !== 1 ? 's' : ''} due this week
            </p>
          )}
        </div>
        {!noToken && (
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
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

          {/* Assignment sections */}
          {hasData && (
            <div className="flex flex-col gap-8">
              <Section title="Overdue" accent items={groups.overdue} />
              <Section title="Today" items={groups.today} />
              <Section title="This Week" items={groups.thisWeek} />
              <Section title="Upcoming" items={groups.upcoming} />
              <Section title="Recently Submitted" muted items={groups.recentlySubmitted} />
            </div>
          )}
        </>
      )}
    </>
  );
}
