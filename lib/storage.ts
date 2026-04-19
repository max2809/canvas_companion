export const StorageKeys = {
  TOKEN: 'cc.token',
  USER: 'cc.user',
  COURSES: 'cc.courses',
  ASSIGNMENTS: 'cc.assignments',
  LAST_SYNC: 'cc.lastSync',
  HIDDEN_COURSES: 'cc.hiddenCourses',
} as const;

export function get<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function set<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function getWithTTL<T>(key: string, ttlMs: number): T | null {
  if (typeof window === 'undefined') return null;
  const entry = get<{ value: T; storedAt: number }>(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > ttlMs) return null;
  return entry.value;
}

export function setWithTTL<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  set(key, { value, storedAt: Date.now() });
}

export function getHiddenCourseIds(): number[] {
  return get<number[]>(StorageKeys.HIDDEN_COURSES) ?? [];
}

export function toggleCourseHidden(courseId: number): number[] {
  const current = getHiddenCourseIds();
  const next = current.includes(courseId)
    ? current.filter((id) => id !== courseId)
    : [...current, courseId];
  set(StorageKeys.HIDDEN_COURSES, next);
  return next;
}

export function clear(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
}

export function clearAll(): void {
  if (typeof window === 'undefined') return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('cc.')) toRemove.push(key);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}
