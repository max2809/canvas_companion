import type { CanvasAssignment, CanvasCourse } from './canvas';

export type CourseStatus = 'green' | 'yellow' | 'red';

export interface CourseHealth {
  status: CourseStatus;
  reason: string;
  nextActions: string[];
  stats: {
    overdue: number;
    dueSoon: number;
    dueThisWeek: number;
    submitted: number;
    total: number;
  };
}

function isSubmitted(a: CanvasAssignment): boolean {
  return (
    a.submission?.workflow_state === 'submitted' ||
    a.submission?.workflow_state === 'graded'
  );
}

function isOverdue(a: CanvasAssignment, now: Date): boolean {
  if (!a.due_at) return false;
  const due = new Date(a.due_at);
  if (due >= now) return false;
  const s = a.submission;
  if (!s) return true;
  return s.missing === true || s.workflow_state === 'unsubmitted';
}

function daysFromNow(a: CanvasAssignment, now: Date): number {
  if (!a.due_at) return Infinity;
  return (new Date(a.due_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
}

function dayLabel(a: CanvasAssignment, now: Date): string {
  const days = daysFromNow(a, now);
  if (days < 1) return 'due tomorrow';
  const due = new Date(a.due_at!);
  const dayName = due.toLocaleDateString('en-US', { weekday: 'long' });
  return `due ${dayName}`;
}

export function getCourseHealth(
  _course: CanvasCourse,
  assignments: CanvasAssignment[]
): CourseHealth {
  const now = new Date();
  const relevant = assignments.filter((a) => !a.omit_from_final_grade);

  if (relevant.length === 0) {
    return {
      status: 'green',
      reason: 'No assignments yet',
      nextActions: [],
      stats: { overdue: 0, dueSoon: 0, dueThisWeek: 0, submitted: 0, total: 0 },
    };
  }

  const overdueList = relevant
    .filter((a) => isOverdue(a, now))
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());

  const dueSoonList = relevant
    .filter((a) => {
      if (isSubmitted(a) || isOverdue(a, now) || !a.due_at) return false;
      const d = daysFromNow(a, now);
      return d >= 0 && d <= 3;
    })
    .sort((a, b) => daysFromNow(a, now) - daysFromNow(b, now));

  const dueThisWeekList = relevant
    .filter((a) => {
      if (isSubmitted(a) || isOverdue(a, now) || !a.due_at) return false;
      const d = daysFromNow(a, now);
      return d >= 0 && d <= 7;
    })
    .sort((a, b) => daysFromNow(a, now) - daysFromNow(b, now));

  const stats = {
    overdue: overdueList.length,
    dueSoon: dueSoonList.length,
    dueThisWeek: dueThisWeekList.length,
    submitted: relevant.filter(isSubmitted).length,
    total: relevant.length,
  };

  let status: CourseStatus;
  if (
    stats.overdue >= 2 ||
    (stats.overdue >= 1 && stats.dueSoon >= 1) ||
    stats.dueSoon >= 2
  ) {
    status = 'red';
  } else if (stats.overdue === 1 || stats.dueSoon === 1 || stats.dueThisWeek >= 2) {
    status = 'yellow';
  } else {
    status = 'green';
  }

  // Build reason string
  let reason: string;
  if (status === 'green') {
    if (stats.submitted === stats.total) {
      reason = 'All caught up';
    } else {
      // Find nearest upcoming assignment
      const upcoming = relevant
        .filter((a) => a.due_at && !isSubmitted(a) && !isOverdue(a, now))
        .sort((a, b) => daysFromNow(a, now) - daysFromNow(b, now));
      if (upcoming.length === 0) {
        reason = 'All caught up';
      } else {
        const days = Math.ceil(daysFromNow(upcoming[0], now));
        reason = `On track — next deadline in ${days} day${days === 1 ? '' : 's'}`;
      }
    }
  } else if (status === 'yellow') {
    if (stats.overdue === 1 && stats.dueSoon === 0) {
      reason = '1 assignment overdue';
    } else if (stats.dueSoon === 1 && stats.overdue === 0) {
      reason = '1 assignment due in the next 3 days';
    } else {
      reason = `${stats.dueThisWeek} assignment${stats.dueThisWeek === 1 ? '' : 's'} due this week`;
    }
  } else {
    const parts: string[] = [];
    if (stats.overdue > 0) {
      parts.push(`${stats.overdue} assignment${stats.overdue === 1 ? '' : 's'} overdue`);
    }
    if (stats.dueSoon > 0) {
      parts.push(`${stats.dueSoon} due in the next 3 days`);
    } else if (stats.dueThisWeek > 0) {
      parts.push(`${stats.dueThisWeek} due this week`);
    }
    reason = parts.join(', ');
  }

  // Build next actions (up to 3)
  const actionCandidates: { label: string }[] = [];

  for (const a of overdueList) {
    if (actionCandidates.length >= 3) break;
    actionCandidates.push({ label: `Submit ${a.name} (overdue)` });
  }

  const remainingSlots = 3 - actionCandidates.length;
  const dueSoonExtra = dueSoonList.slice(0, remainingSlots);
  for (const a of dueSoonExtra) {
    actionCandidates.push({ label: `Submit ${a.name} (${dayLabel(a, now)})` });
  }

  if (actionCandidates.length < 3) {
    const used = new Set([...overdueList, ...dueSoonList].map((a) => a.id));
    const weekExtras = dueThisWeekList
      .filter((a) => !used.has(a.id))
      .slice(0, 3 - actionCandidates.length);
    for (const a of weekExtras) {
      actionCandidates.push({ label: `Start ${a.name} (${dayLabel(a, now)})` });
    }
  }

  const nextActions =
    status === 'green' && stats.dueThisWeek === 0
      ? []
      : actionCandidates.map((c) => c.label);

  return { status, reason, nextActions, stats };
}
