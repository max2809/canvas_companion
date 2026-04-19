'use client';

import { useMemo, useState } from 'react';
import { MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useCanvasData } from '@/lib/hooks';
import { eventsForCourse, parseDescriptionField } from '@/lib/timetable';
import type { TimetableEvent } from '@/lib/timetable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const EVENT_TYPE_COLORS: Record<string, string> = {
  Exam: 'bg-red-500/15 text-red-400',
  Workshop: 'bg-yellow-500/15 text-yellow-400',
  Tutorial: 'bg-blue-500/15 text-blue-400',
  Seminar: 'bg-purple-500/15 text-purple-400',
  Lecture: 'bg-green-500/15 text-green-400',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function stripCodePrefix(title: string, code: string): string {
  return title.startsWith(code) ? title.slice(code.length).replace(/^\s*[-–]\s*/, '').trim() || title : title;
}

function getMonthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function groupByMonth(events: TimetableEvent[]): { label: string; events: TimetableEvent[] }[] {
  const map = new Map<string, TimetableEvent[]>();
  for (const ev of events) {
    const label = getMonthLabel(ev.start);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(ev);
  }
  return Array.from(map.entries()).map(([label, evs]) => ({ label, events: evs }));
}

interface ScheduleTabProps {
  courseCode: string;
}

export function ScheduleTab({ courseCode }: ScheduleTabProps) {
  const { timetableUrl, timetableEvents, timetableLoading } = useCanvasData();
  const [showPast, setShowPast] = useState(false);

  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

  const courseEvents = useMemo(
    () => eventsForCourse(timetableEvents, courseCode),
    [timetableEvents, courseCode]
  );

  const upcomingEvents = useMemo(
    () => courseEvents.filter((ev) => new Date(ev.start) >= now).sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseEvents]
  );

  const pastEvents = useMemo(
    () => courseEvents
      .filter((ev) => {
        const d = new Date(ev.start);
        return d < now && d >= twoWeeksAgo;
      })
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseEvents]
  );

  const nextEvent = upcomingEvents[0];

  function nextEventLabel(): string {
    if (!nextEvent) return '';
    const d = new Date(nextEvent.start);
    return `${d.toLocaleDateString('en-GB', { weekday: 'long' })} at ${formatTime(nextEvent.start)}`;
  }

  if (!timetableUrl) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-muted-foreground max-w-xs">
          Connect your EUR timetable in Settings to see classes here.
        </p>
        <Link href="/settings">
          <Button variant="outline" size="sm">Go to Settings</Button>
        </Link>
      </div>
    );
  }

  if (timetableLoading && courseEvents.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
    );
  }

  if (!timetableLoading && courseEvents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No classes found for {courseCode} in your timetable. Check that the course is added to your MyTimetable.
      </p>
    );
  }

  const monthGroups = groupByMonth(upcomingEvents);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="text-sm text-muted-foreground">
        <span className="text-foreground font-medium">{upcomingEvents.length}</span> upcoming class{upcomingEvents.length !== 1 ? 'es' : ''}
        {nextEvent && (
          <> · Next: <span className="text-foreground">{nextEventLabel()}</span></>
        )}
      </div>

      {/* Upcoming events grouped by month */}
      {monthGroups.length === 0 && (
        <p className="text-sm text-muted-foreground">No upcoming classes.</p>
      )}

      {monthGroups.map(({ label, events }) => (
        <div key={label} className="flex flex-col gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {label}
          </h3>
          {events.map((ev) => (
            <EventRow key={ev.id} event={ev} courseCode={courseCode} />
          ))}
        </div>
      ))}

      {/* Past events */}
      {pastEvents.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowPast((v) => !v)}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            Past classes ({pastEvents.length})
            {showPast ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
          {showPast && pastEvents.map((ev) => (
            <EventRow key={ev.id} event={ev} courseCode={courseCode} muted />
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({
  event,
  courseCode,
  muted,
}: {
  event: TimetableEvent;
  courseCode: string;
  muted?: boolean;
}) {
  const displayTitle = stripCodePrefix(event.title, courseCode);
  const typeClass = event.eventTypeGuess
    ? (EVENT_TYPE_COLORS[event.eventTypeGuess] ?? 'bg-secondary text-muted-foreground')
    : null;
  const enrolled = parseDescriptionField(event.description, 'Enrolled for this activity');
  const isEnrolled = enrolled?.toLowerCase() === 'yes';

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl bg-card border border-border text-sm${muted ? ' opacity-50' : ''}`}
    >
      <div className="flex flex-col gap-0.5 shrink-0 min-w-[90px]">
        <span className="text-xs font-medium text-foreground/80">{formatDateShort(event.start)}</span>
        {!event.isAllDay && (
          <span className="text-xs text-muted-foreground">
            {formatTime(event.start)}–{formatTime(event.end)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {event.eventTypeGuess && typeClass && (
            <Badge className={`text-[10px] px-1.5 py-0 ${typeClass}`}>
              {event.eventTypeGuess}
            </Badge>
          )}
          <span className="font-medium truncate">{displayTitle}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {event.location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
          {enrolled && (
            <span className={`text-xs ${isEnrolled ? 'text-green-400' : 'text-muted-foreground'}`}>
              {isEnrolled ? '✓ Enrolled' : 'Not enrolled'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
