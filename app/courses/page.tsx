'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X, EyeOff, Eye, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { useCanvasData } from '@/lib/hooks';
import { getCourseHealth } from '@/lib/traffic-light';
import { parseCourseCode } from '@/lib/canvas';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { CanvasCourse, EnrichedAssignment } from '@/lib/canvas';

const TL = { red: '#f87171', yellow: '#fbbf24', green: '#4ade80' } as const;

const STATUS_ORDER = { red: 0, yellow: 1, green: 2 } as const;

function CourseCard({
  course,
  courseAssignments,
  onHide,
}: {
  course: CanvasCourse;
  courseAssignments: EnrichedAssignment[];
  onHide: () => void;
}) {
  const health = getCourseHealth(course, courseAssignments);
  const { status, reason, stats } = health;
  const code = parseCourseCode(course.course_code);

  const statParts = [
    stats.overdue > 0 && `${stats.overdue} overdue`,
    stats.dueThisWeek > 0 && `${stats.dueThisWeek} due this week`,
    stats.submitted > 0 && `${stats.submitted} submitted`,
  ].filter(Boolean).join(' · ');

  return (
    <Link
      href={`/courses/${course.id}`}
      className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden block hover:ring-foreground/20 transition-all"
    >
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="font-mono text-xs uppercase">
            {code}
          </Badge>
          <div className="flex items-center gap-1.5">
            <button
              aria-label="Hide course"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide(); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <EyeOff className="size-3.5" />
            </button>
            <div
              role="img"
              aria-label={`${status} health: ${reason}`}
              className={`size-3 rounded-full${status === 'red' ? ' animate-pulse' : ''}`}
              style={{ backgroundColor: TL[status] }}
            />
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </div>
        <div>
          <p className="font-semibold text-base leading-snug">{course.name}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{reason}</p>
        </div>
        {statParts && <p className="text-xs text-muted-foreground">{statParts}</p>}
      </div>
    </Link>
  );
}

export default function CoursesPage() {
  const { courses, allCourses, hiddenCourseIds, assignments, loading, error, refresh, toggleHidden } = useCanvasData();
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  const noToken = error === 'no-token';
  const realError = error && error !== 'no-token' ? error : null;
  const hasData = courses.length > 0 || hiddenCourseIds.length > 0;

  if (noToken) {
    return (
      <>
        <PageHeader title="Courses" />
        <p className="text-sm text-muted-foreground">
          No Canvas token found.{' '}
          <Link href="/settings" className="underline">
            Add one in Settings
          </Link>{' '}
          to get started.
        </p>
      </>
    );
  }

  const sorted = courses.length > 0
    ? [...courses].sort((a, b) => {
        const ha = getCourseHealth(a, assignments.filter((x) => x.course_id === a.id));
        const hb = getCourseHealth(b, assignments.filter((x) => x.course_id === b.id));
        const diff = STATUS_ORDER[ha.status] - STATUS_ORDER[hb.status];
        if (diff !== 0) return diff;
        return parseCourseCode(a.course_code).localeCompare(parseCourseCode(b.course_code));
      })
    : [];

  const hiddenCourses = allCourses.filter((c) => hiddenCourseIds.includes(c.id));

  return (
    <>
      <PageHeader title="Courses" />

      {/* Error banner */}
      {realError && !errorDismissed && (
        <div className="flex items-center gap-3 rounded-lg bg-destructive/15 border border-destructive/20 px-4 py-3 mb-6">
          <p className="flex-1 text-sm text-destructive">{realError}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
          <button
            aria-label="Dismiss error"
            onClick={() => setErrorDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Loading skeletons (no cached data) */}
      {loading && !hasData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasData && !realError && (
        <p className="text-sm text-muted-foreground">No active courses found in your Canvas account.</p>
      )}

      {/* Empty state when all courses are hidden */}
      {!loading && courses.length === 0 && hiddenCourseIds.length > 0 && (
        <p className="text-sm text-muted-foreground">
          You have {hiddenCourseIds.length} course{hiddenCourseIds.length !== 1 ? 's' : ''} hidden.{' '}
          <Link href="/settings" className="underline">Show them</Link>
        </p>
      )}

      {/* Course grid */}
      {sorted.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              courseAssignments={assignments.filter((a) => a.course_id === course.id)}
              onHide={() => toggleHidden(course.id)}
            />
          ))}
        </div>
      )}

      {/* Hidden courses section */}
      {hiddenCourses.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-border" />
            <button
              onClick={() => setHiddenExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Hidden courses ({hiddenCourses.length})
              {hiddenExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
            <div className="flex-1 border-t border-border" />
          </div>

          {hiddenExpanded && (
            <div className="flex flex-col gap-1">
              {hiddenCourses.map((course) => (
                <div key={course.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="font-mono text-xs text-muted-foreground uppercase">
                    {parseCourseCode(course.course_code)}
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground truncate">{course.name}</span>
                  <button
                    aria-label="Unhide course"
                    onClick={() => toggleHidden(course.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Eye className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
