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
  clearAll,
  getHiddenCourseIds,
  toggleCourseHidden,
} from './storage';

const TTL_MS = 15 * 60 * 1000;

export interface CanvasDataState {
  user: CanvasUser | null;
  courses: CanvasCourse[];
  allCourses: CanvasCourse[];
  hiddenCourseIds: number[];
  assignments: EnrichedAssignment[];
  loading: boolean;
  error: string | null;
  lastSync: Date | null;
  refresh: () => Promise<void>;
  toggleHidden: (courseId: number) => void;
}

export function useCanvasData(): CanvasDataState {
  const [user, setUser] = useState<CanvasUser | null>(null);
  const [allCourses, setAllCourses] = useState<CanvasCourse[]>([]);
  const [allAssignments, setAllAssignments] = useState<EnrichedAssignment[]>([]);
  const [hiddenCourseIds, setHiddenCourseIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

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

  useEffect(() => {
    setHiddenCourseIds(getHiddenCourseIds());
    fetchAll(false);
  }, [fetchAll]);

  const refresh = useCallback(() => fetchAll(true), [fetchAll]);

  const toggleHidden = useCallback((courseId: number) => {
    const next = toggleCourseHidden(courseId);
    setHiddenCourseIds(next);
  }, []);

  const courses = allCourses.filter((c) => !hiddenCourseIds.includes(c.id));
  const assignments = allAssignments.filter((a) => !hiddenCourseIds.includes(a.course_id));

  return { user, courses, allCourses, hiddenCourseIds, assignments, loading, error, lastSync, refresh, toggleHidden };
}
