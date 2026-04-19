'use client';

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Circle,
  ExternalLink,
} from 'lucide-react';
import { useCanvasData } from '@/lib/hooks';
import { getCourseHealth } from '@/lib/traffic-light';
import { parseCourseCode } from '@/lib/canvas';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FilesTab } from './files-tab';
import { PagesTab } from './pages-tab';
import { AnnouncementsSection } from './announcements-section';
import { ManualTab } from './manual-tab';
import { ScheduleTab } from './schedule-tab';
import type { EnrichedAssignment } from '@/lib/canvas';

const TL = { red: '#f87171', yellow: '#fbbf24', green: '#4ade80' } as const;

const TABS = ['overview', 'assignments', 'files', 'schedule', 'pages', 'manual'] as const;
type Tab = (typeof TABS)[number];

function humanizeDue(due_at: string | null): string {
  if (!due_at) return 'No due date';
  const due = new Date(due_at);
  const diffDays = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (diffDays < -1) return `${Math.abs(diffDays)} days overdue`;
  if (diffDays === -1) return '1 day overdue';
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays <= 7) return `Due ${due.toLocaleDateString('en-US', { weekday: 'long' })}`;
  return `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function AssignmentIcon({ a }: { a: EnrichedAssignment }) {
  const ws = a.submission?.workflow_state;
  if (ws === 'submitted' || ws === 'graded') {
    return <CheckCircle2 className="size-4 shrink-0" style={{ color: TL.green }} aria-label="Submitted" />;
  }
  if (a.due_at) {
    const diffDays = (new Date(a.due_at).getTime() - Date.now()) / 86_400_000;
    if (diffDays < 0) return <XCircle className="size-4 shrink-0" style={{ color: TL.red }} aria-label="Overdue" />;
    if (diffDays <= 3) return <AlertCircle className="size-4 shrink-0" style={{ color: TL.yellow }} aria-label="Due soon" />;
  }
  return <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="Upcoming" />;
}

function CourseDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const courseId = Number(params.id);
  const activeTab = (searchParams.get('tab') ?? 'overview') as Tab;

  const { allCourses, assignments, loading } = useCanvasData();

  const course = allCourses.find((c) => c.id === courseId);
  const courseAssignments = assignments.filter((a) => a.course_id === courseId);

  function setTab(tab: Tab) {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    router.push(url.pathname + url.search, { scroll: false });
  }

  if (loading && !course) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-5 w-32 rounded" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48 rounded" />
          <Skeleton className="h-5 w-64 rounded" />
        </div>
        <Skeleton className="h-10 w-full rounded" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/courses"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-4" />
          Back to Courses
        </Link>
        <p className="text-sm text-muted-foreground">Course not found.</p>
        <Link href="/courses" className="text-sm underline">
          View all courses
        </Link>
      </div>
    );
  }

  const code = parseCourseCode(course.course_code);
  const health = getCourseHealth(course, courseAssignments);
  const { status, reason, nextActions, stats } = health;

  const sorted = [...courseAssignments].sort((a, b) => {
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          href="/courses"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-4" />
          Back to Courses
        </Link>
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-secondary text-muted-foreground border border-border w-fit">
            {code}
          </span>
          <h1 className="text-2xl font-bold leading-tight gradient-text inline-block">{course.name}</h1>
          <div className="flex items-center gap-2">
            <div
              className={`size-2 rounded-full shrink-0${status === 'red' ? ' animate-pulse' : ''}`}
              style={{ backgroundColor: TL[status], boxShadow: `0 0 6px ${TL[status]}60` }}
            />
            <span className="text-sm text-muted-foreground">{reason}</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border -mb-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-all duration-150 border-b-2 -mb-px ${
              activeTab === tab
                ? 'text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            style={activeTab === tab ? {
              borderImage: 'linear-gradient(90deg, #1ec8e8, #9333ea) 1',
            } : {}}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
            <div
              className={`size-8 rounded-full shrink-0 flex items-center justify-center${status === 'red' ? ' animate-pulse' : ''}`}
              style={{ backgroundColor: `${TL[status]}22`, boxShadow: `0 0 12px ${TL[status]}40` }}
            >
              <div className="size-3 rounded-full" style={{ backgroundColor: TL[status] }} />
            </div>
            <div>
              <p className="font-semibold text-base">{status === 'red' ? 'At risk' : status === 'yellow' ? 'Attention needed' : 'On track'}</p>
              <p className="text-sm text-muted-foreground">{reason}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { label: 'Overdue', value: stats.overdue, color: stats.overdue > 0 ? TL.red : undefined },
              { label: 'Due this week', value: stats.dueThisWeek, color: stats.dueThisWeek > 0 ? TL.yellow : undefined },
              { label: 'Submitted', value: stats.submitted, color: stats.submitted > 0 ? TL.green : undefined },
              { label: 'Total', value: stats.total, color: undefined },
            ] as const).map(({ label, value, color }) => (
              <div key={label} className="rounded-xl bg-card border border-border p-4">
                <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {nextActions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-xs">Next actions</p>
              {nextActions.map((action) => (
                <div
                  key={action}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl bg-card border border-border"
                >
                  <div className="size-1.5 rounded-full bg-foreground/40 mt-1.5 shrink-0" />
                  <span className="text-sm">{action}</span>
                </div>
              ))}
            </div>
          )}

          <AnnouncementsSection courseId={courseId} />
        </div>
      )}

      {/* Assignments tab */}
      {activeTab === 'assignments' && (
        <div className="flex flex-col gap-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments for this course yet.</p>
          ) : (
            sorted.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border text-sm"
              >
                <AssignmentIcon a={a} />
                <span className="flex-1 min-w-0 truncate">{a.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">{humanizeDue(a.due_at)}</span>
                <a
                  href={a.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${a.name} in Canvas`}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            ))
          )}
        </div>
      )}

      {/* Files tab */}
      {activeTab === 'files' && <FilesTab courseId={courseId} courseCode={code} />}

      {/* Schedule tab */}
      {activeTab === 'schedule' && <ScheduleTab courseCode={code} />}

      {/* Pages tab */}
      {activeTab === 'pages' && <PagesTab courseId={courseId} />}

      {/* Manual tab */}
      {activeTab === 'manual' && <ManualTab courseId={courseId} />}

    </div>
  );
}

export default function CourseDetailPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-6">
        <div className="h-5 w-32 bg-muted rounded animate-pulse" />
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
      </div>
    }>
      <CourseDetailContent />
    </Suspense>
  );
}
