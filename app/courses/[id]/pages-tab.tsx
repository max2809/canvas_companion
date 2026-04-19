'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, FileText, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { get as storageGet, getWithTTL, setWithTTL } from '@/lib/storage';
import { StorageKeys } from '@/lib/storage';
import { fetchCourseModules, fetchCoursePage, CanvasError } from '@/lib/canvas';
import type { CanvasModule, CanvasModuleItem, CanvasPage } from '@/lib/canvas';

const MODULES_TTL = 60 * 60 * 1000;

interface PageEntry {
  item: CanvasModuleItem;
  moduleId: number;
  moduleName: string;
}

// Strip HTML to plain text for a brief excerpt
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function PageRow({
  entry,
  courseId,
  token,
}: {
  entry: PageEntry;
  courseId: number;
  token: string;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<CanvasPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { item } = entry;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !page && !loading && item.page_url) {
      setLoading(true);
      setError(null);
      try {
        const fetched = await fetchCoursePage(token, courseId, item.page_url);
        setPage(fetched);
      } catch (err) {
        if (err instanceof CanvasError && err.status === 401) {
          window.location.href = '/settings';
          return;
        }
        setError('Could not load page content.');
      } finally {
        setLoading(false);
      }
    }
  }

  const canExpand = !!item.page_url;

  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden">
      <div
        className={`flex items-center gap-3 px-4 py-3 ${canExpand ? 'cursor-pointer select-none' : ''}`}
        onClick={canExpand ? toggle : undefined}
        role={canExpand ? 'button' : undefined}
        tabIndex={canExpand ? 0 : undefined}
        onKeyDown={canExpand ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } : undefined}
        aria-expanded={canExpand ? open : undefined}
      >
        {canExpand
          ? (open
              ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />)
          : <FileText className="size-4 shrink-0 text-muted-foreground" />
        }
        <span className="flex-1 min-w-0 text-sm font-medium truncate">{item.title}</span>
        {item.html_url && (
          <a
            href={item.html_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${item.title} in Canvas`}
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>

      {open && (
        <div className="border-t border-border px-4 py-4">
          {loading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-4 w-5/6 rounded" />
            </div>
          )}
          {error && <p className="text-sm text-muted-foreground">{error}</p>}
          {page && page.body && (
            <div
              className="canvas-page-body text-sm leading-relaxed text-foreground/90"
              dangerouslySetInnerHTML={{ __html: page.body }}
            />
          )}
          {page && !page.body && (
            <p className="text-sm text-muted-foreground">This page has no content.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function PagesTab({ courseId }: { courseId: number }) {
  const [modules, setModules] = useState<CanvasModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const token = storageGet<string>(StorageKeys.TOKEN) ?? '';

  const load = useCallback(
    async (bypassCache = false) => {
      if (!token) return;
      setLoading(true);
      setLoadError(null);

      const cacheKey = `cc.modules.${courseId}`;
      if (!bypassCache) {
        const cached = getWithTTL<CanvasModule[]>(cacheKey, MODULES_TTL);
        if (cached) {
          setModules(cached);
          setLoading(false);
          return;
        }
      }

      try {
        const fetched = await fetchCourseModules(token, courseId);
        setWithTTL(cacheKey, fetched);
        setModules(fetched);
      } catch (err) {
        if (err instanceof CanvasError && err.status === 401) {
          window.location.href = '/settings';
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'Failed to load modules');
      } finally {
        setLoading(false);
      }
    },
    [token, courseId]
  );

  useEffect(() => { load(false); }, [load]);

  // Collect all Page items grouped by module
  const groups: { module: CanvasModule; pages: PageEntry[] }[] = [];
  for (const mod of modules) {
    const pages: PageEntry[] = (mod.items ?? [])
      .filter((item) => item.type === 'Page')
      .map((item) => ({ item, moduleId: mod.id, moduleName: mod.name }));
    if (pages.length > 0) {
      groups.push({ module: mod, pages });
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-3 items-start">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => load(true)}>Retry</Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <FileText className="size-12 opacity-20" />
        <p className="text-sm">No pages found in course modules</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ module: mod, pages }) => (
        <div key={mod.id} className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {mod.name}
          </p>
          {pages.map((entry) => (
            <PageRow
              key={entry.item.id}
              entry={entry}
              courseId={courseId}
              token={token}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
