'use client';

import { useState } from 'react';
import { Eye, EyeOff, Sparkles, Plus } from 'lucide-react';
import { useCanvasData } from '@/lib/hooks';
import { parseCourseCode } from '@/lib/canvas';
import { Button } from '@/components/ui/button';

function OnboardingModal({
  allCourses,
  completeOnboarding,
}: {
  allCourses: ReturnType<typeof useCanvasData>['allCourses'];
  completeOnboarding: ReturnType<typeof useCanvasData>['completeOnboarding'];
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(allCourses.map((c) => c.id)));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleConfirm() {
    completeOnboarding([...selected]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="size-4 text-primary" />
            <h2 className="font-semibold text-base">Welcome to Canvas Companion</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Select the courses you&apos;re actively taking. The rest will be hidden — you can always unhide them later.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2">
          {allCourses.map((course) => {
            const active = selected.has(course.id);
            return (
              <button
                key={course.id}
                onClick={() => toggle(course.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors border ${
                  active
                    ? 'bg-primary/10 border-primary/30 text-foreground'
                    : 'bg-secondary/40 border-transparent text-muted-foreground hover:bg-secondary/60'
                }`}
              >
                <div
                  className={`size-4 rounded flex-shrink-0 flex items-center justify-center border ${
                    active ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                  }`}
                >
                  {active && (
                    <svg className="size-2.5 text-primary-foreground" fill="none" viewBox="0 0 10 10">
                      <path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border flex-shrink-0">
                  {parseCourseCode(course.course_code)}
                </span>
                <span className="text-sm font-medium truncate">{course.name}</span>
              </button>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {selected.size} of {allCourses.length} selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Deselect all
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(allCourses.map((c) => c.id)))}>
              Select all
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={selected.size === 0}>
              Get started
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewCoursesBanner({
  newCourses,
  acknowledgeNewCourse,
}: {
  newCourses: ReturnType<typeof useCanvasData>['newCourses'];
  acknowledgeNewCourse: ReturnType<typeof useCanvasData>['acknowledgeNewCourse'];
}) {
  if (newCourses.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 rounded-xl border border-primary/30 bg-card shadow-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Plus className="size-3.5 text-primary" />
        <p className="text-sm font-semibold">
          {newCourses.length === 1
            ? 'New course on Canvas'
            : `${newCourses.length} new courses on Canvas`}
        </p>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {newCourses.map((course) => (
          <div key={course.id} className="px-4 py-2.5 flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border flex-shrink-0">
              {parseCourseCode(course.course_code)}
            </span>
            <span className="flex-1 text-xs text-foreground truncate min-w-0">{course.name}</span>
            <button
              aria-label="Add to active courses"
              title="Add to active"
              onClick={() => acknowledgeNewCourse(course.id, false)}
              className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
            >
              <Eye className="size-3.5" />
            </button>
            <button
              aria-label="Hide course"
              title="Hide"
              onClick={() => acknowledgeNewCourse(course.id, true)}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <EyeOff className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CourseSetupOverlay() {
  const { needsOnboarding, newCourses, allCourses, completeOnboarding, acknowledgeNewCourse } = useCanvasData();

  return (
    <>
      {needsOnboarding && (
        <OnboardingModal allCourses={allCourses} completeOnboarding={completeOnboarding} />
      )}
      {!needsOnboarding && newCourses.length > 0 && (
        <NewCoursesBanner newCourses={newCourses} acknowledgeNewCourse={acknowledgeNewCourse} />
      )}
    </>
  );
}
