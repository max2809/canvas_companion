'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CanvasUser,
  CanvasCourse,
  EnrichedAssignment,
  CanvasAssignment,
  CanvasError,
  fetchUser,
  fetchCourses,
  fetchAssignments,
  parseCourseCode,
} from './canvas';
import {
  StorageKeys,
  get,
  set,
  getWithTTL,
  setWithTTL,
  clear,
  clearAll,
  getHiddenCourseIds,
  toggleCourseHidden,
  isInitialized,
  markInitialized,
  getKnownCourseIds,
  setKnownCourseIds,
} from './storage';
import { fetchTimetable, TimetableEvent } from './timetable';

const TTL_MS = 15 * 60 * 1000;
const TIMETABLE_TTL_MS = 60 * 60 * 1000;

export interface CanvasDataState {
  user: CanvasUser | null;
  courses: CanvasCourse[];
  allCourses: CanvasCourse[];
  hiddenCourseIds: number[];
  assignments: EnrichedAssignment[];
  loading: boolean;
  error: string | null;
  lastSync: Date | null;
  needsOnboarding: boolean;
  newCourses: CanvasCourse[];
  refresh: () => Promise<void>;
  toggleHidden: (courseId: number) => void;
  completeOnboarding: (activeIds: number[]) => void;
  acknowledgeNewCourse: (courseId: number, hide: boolean) => void;
  timetableUrl: string | null;
  timetableEvents: TimetableEvent[];
  timetableLoading: boolean;
  timetableError: string | null;
  setTimetableUrl: (url: string | null) => void;
  refreshTimetable: () => Promise<void>;
}

export function useCanvasData(): CanvasDataState {
  const [user, setUser] = useState<CanvasUser | null>(null);
  const [allCourses, setAllCourses] = useState<CanvasCourse[]>([]);
  const [allAssignments, setAllAssignments] = useState<EnrichedAssignment[]>([]);
  const [hiddenCourseIds, setHiddenCourseIds] = useState<number[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [knownCourseIds, setKnownCourseIdsState] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [timetableUrl, setTimetableUrlState] = useState<string | null>(null);
  const [timetableEvents, setTimetableEvents] = useState<TimetableEvent[]>([]);
  const [timetableLoading, setTimetableLoading] = useState(false);
  const [timetableError, setTimetableError] = useState<string | null>(null);

  const fetchAll = useCallback(async (bypassCache: boolean) => {
    const token = get<string>(StorageKeys.TOKEN);
    if (!token) {
      setLoading(false);
      setError('no-token');
      return;
    }

    if (!bypassCache) {
      const cachedCourses = getWithTTL<CanvasCourse[]>(StorageKeys.COURSES, TTL_MS);
      const cachedAssignments = getWithTTL<EnrichedAssignment[]>(StorageKeys.ASSIGNMENTS, TTL_MS);
      const cachedUser = get<CanvasUser>(StorageKeys.USER);
      const cachedLastSync = get<number>(StorageKeys.LAST_SYNC);

      if (cachedCourses && cachedAssignments) {
        if (cachedUser) setUser(cachedUser);
        setAllCourses(cachedCourses);
        setAllAssignments(cachedAssignments);
        setLastSync(cachedLastSync ? new Date(cachedLastSync) : null);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const [fetchedUser, fetchedCourses] = await Promise.all([
        fetchUser(token),
        fetchCourses(token),
      ]);

      const assignmentArrays = await Promise.all(
        fetchedCourses.map((course) =>
          fetchAssignments(token, course.id).then((list): EnrichedAssignment[] =>
            list.map((a: CanvasAssignment) => ({
              ...a,
              course_name: course.name,
              course_code_short: parseCourseCode(course.course_code),
            }))
          )
        )
      );

      const enriched = assignmentArrays.flat();
      const now = Date.now();

      set(StorageKeys.USER, fetchedUser);
      setWithTTL(StorageKeys.COURSES, fetchedCourses);
      setWithTTL(StorageKeys.ASSIGNMENTS, enriched);
      set(StorageKeys.LAST_SYNC, now);

      setUser(fetchedUser);
      setAllCourses(fetchedCourses);
      setAllAssignments(enriched);
      setLastSync(new Date(now));
    } catch (err) {
      if (err instanceof CanvasError && err.status === 401) {
        clearAll();
        setError('invalid-token');
        window.location.href = '/settings';
        return;
      }
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const doFetchTimetable = useCallback(async (url: string, bypassCache: boolean) => {
    if (!bypassCache) {
      const cached = getWithTTL<TimetableEvent[]>(StorageKeys.TIMETABLE_EVENTS, TIMETABLE_TTL_MS);
      if (cached) {
        setTimetableEvents(cached);
        return;
      }
    }

    setTimetableLoading(true);
    try {
      const events = await fetchTimetable(url);
      setWithTTL(StorageKeys.TIMETABLE_EVENTS, events);
      setTimetableEvents(events);
      setTimetableError(null);
    } catch (err) {
      setTimetableError(err instanceof Error ? err.message : 'Failed to load timetable');
    } finally {
      setTimetableLoading(false);
    }
  }, []);

  useEffect(() => {
    setHiddenCourseIds(getHiddenCourseIds());
    setInitialized(isInitialized());
    setKnownCourseIdsState(getKnownCourseIds());
    fetchAll(false);

    const storedUrl = get<string>(StorageKeys.TIMETABLE_URL);
    if (storedUrl) {
      setTimetableUrlState(storedUrl);
      const cached = getWithTTL<TimetableEvent[]>(StorageKeys.TIMETABLE_EVENTS, TIMETABLE_TTL_MS);
      if (cached) {
        setTimetableEvents(cached);
      } else {
        doFetchTimetable(storedUrl, false);
      }
    }
  }, [fetchAll, doFetchTimetable]);

  const refresh = useCallback(() => fetchAll(true), [fetchAll]);

  const refreshTimetable = useCallback(async () => {
    const url = get<string>(StorageKeys.TIMETABLE_URL);
    if (!url) return;
    await doFetchTimetable(url, true);
  }, [doFetchTimetable]);

  const setTimetableUrl = useCallback((url: string | null) => {
    if (url === null) {
      clear(StorageKeys.TIMETABLE_URL);
      clear(StorageKeys.TIMETABLE_EVENTS);
      setTimetableUrlState(null);
      setTimetableEvents([]);
      setTimetableError(null);
      return;
    }
    set(StorageKeys.TIMETABLE_URL, url);
    setTimetableUrlState(url);
    doFetchTimetable(url, true);
  }, [doFetchTimetable]);

  const toggleHidden = useCallback((courseId: number) => {
    const next = toggleCourseHidden(courseId);
    setHiddenCourseIds(next);
  }, []);

  const completeOnboarding = useCallback((activeIds: number[]) => {
    const toHide = allCourses
      .filter((c) => !activeIds.includes(c.id))
      .map((c) => c.id);
    const currentHidden = getHiddenCourseIds();
    const newHidden = [...new Set([...currentHidden, ...toHide])];
    set(StorageKeys.HIDDEN_COURSES, newHidden);
    const allIds = allCourses.map((c) => c.id);
    setKnownCourseIds(allIds);
    markInitialized();
    setHiddenCourseIds(newHidden);
    setKnownCourseIdsState(allIds);
    setInitialized(true);
  }, [allCourses]);

  const acknowledgeNewCourse = useCallback((courseId: number, hide: boolean) => {
    const updated = [...knownCourseIds, courseId];
    setKnownCourseIds(updated);
    setKnownCourseIdsState(updated);
    if (hide) {
      const next = toggleCourseHidden(courseId);
      setHiddenCourseIds(next);
    }
  }, [knownCourseIds]);

  const courses = allCourses.filter((c) => !hiddenCourseIds.includes(c.id));
  const assignments = allAssignments.filter((a) => !hiddenCourseIds.includes(a.course_id));
  const needsOnboarding = !initialized && !loading && allCourses.length > 0;
  const newCourses = initialized
    ? allCourses.filter((c) => !knownCourseIds.includes(c.id))
    : [];

  return {
    user, courses, allCourses, hiddenCourseIds, assignments, loading, error, lastSync,
    needsOnboarding, newCourses,
    refresh, toggleHidden, completeOnboarding, acknowledgeNewCourse,
    timetableUrl, timetableEvents, timetableLoading, timetableError,
    setTimetableUrl, refreshTimetable,
  };
}
