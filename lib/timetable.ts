import ICAL from 'ical.js';
import { parseCourseCode } from './canvas';

export interface TimetableEvent {
  id: string;
  title: string;
  courseCodeShort: string | null;
  eventTypeGuess: string | null;
  location: string | null;
  description: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
}

function guessEventType(title: string): string | null {
  const lower = title.toLowerCase();
  if (lower.includes('exam') || lower.includes('tentamen') || lower.includes('toets')) return 'Exam';
  if (lower.includes('workshop')) return 'Workshop';
  if (lower.includes('tutorial')) return 'Tutorial';
  if (lower.includes('seminar')) return 'Seminar';
  if (lower.includes('lecture') || lower.includes(' lec ') || lower.endsWith(' lec')) return 'Lecture';
  return null;
}

function parseCourseCodeFromTitle(title: string): string | null {
  const match = title.match(/^([A-Z]{2,4}\d{4})/);
  if (!match) return null;
  return parseCourseCode(match[1]);
}

export async function fetchTimetable(url: string): Promise<TimetableEvent[]> {
  const res = await fetch(`/api/timetable?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const text = await res.text();

  const parsed = ICAL.parse(text);
  const comp = new ICAL.Component(parsed);

  const now = new Date();
  const windowStart = ICAL.Time.fromJSDate(new Date(now.getTime() - 30 * 86400_000));
  const windowEnd = ICAL.Time.fromJSDate(new Date(now.getTime() + 180 * 86400_000));

  const vevents = comp.getAllSubcomponents('vevent');
  const events: TimetableEvent[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);

    if (event.isRecurring()) {
      const expand = new ICAL.RecurExpansion({ component: vevent, dtstart: event.startDate });
      let next: ICAL.Time | null;
      let safetyLimit = 500;
      while ((next = expand.next()) && safetyLimit-- > 0) {
        if (next.compare(windowEnd) > 0) break;
        if (next.compare(windowStart) < 0) continue;

        const occurrence = event.getOccurrenceDetails(next);
        const startDate = occurrence.startDate;
        const endDate = occurrence.endDate;

        events.push(makeEvent(
          event.uid,
          startDate,
          endDate,
          occurrence.item.summary ?? (vevent.getFirstPropertyValue('summary') as string | null) ?? '',
          (vevent.getFirstPropertyValue('location') as string | null) ?? null,
          (vevent.getFirstPropertyValue('description') as string | null) ?? null,
        ));
      }
    } else {
      const startDate = event.startDate;
      if (!startDate) continue;
      if (startDate.compare(windowStart) < 0 || startDate.compare(windowEnd) > 0) continue;

      events.push(makeEvent(
        event.uid,
        startDate,
        event.endDate,
        event.summary ?? '',
        (vevent.getFirstPropertyValue('location') as string | null) ?? null,
        (vevent.getFirstPropertyValue('description') as string | null) ?? null,
      ));
    }
  }

  return events;
}

function makeEvent(
  uid: string,
  startDate: ICAL.Time,
  endDate: ICAL.Time | null,
  rawSummary: string,
  location: string | null,
  description: string | null,
): TimetableEvent {
  const title = rawSummary || 'Untitled event';
  const startIso = startDate.toJSDate().toISOString();
  const id = `${uid}__${startIso}`;
  const isAllDay = startDate.isDate;

  const endIso = endDate ? endDate.toJSDate().toISOString() : startIso;

  const courseCodeShort = parseCourseCodeFromTitle(title);

  return {
    id,
    title,
    courseCodeShort,
    eventTypeGuess: guessEventType(title),
    location: location || null,
    description: description || null,
    start: startIso,
    end: endIso,
    isAllDay,
  };
}

export function eventsForCourse(events: TimetableEvent[], courseCodeShort: string): TimetableEvent[] {
  return events.filter((e) => e.courseCodeShort === courseCodeShort);
}

export function eventsInRange(events: TimetableEvent[], from: Date, to: Date): TimetableEvent[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  return events.filter((e) => {
    const t = new Date(e.start).getTime();
    return t >= fromMs && t <= toMs;
  });
}
