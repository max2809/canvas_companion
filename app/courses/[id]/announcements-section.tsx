'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Megaphone } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { get as storageGet } from '@/lib/storage';
import { StorageKeys } from '@/lib/storage';
import { fetchCourseAnnouncements, CanvasError } from '@/lib/canvas';
import type { CanvasAnnouncement } from '@/lib/canvas';
import { getWithTTL, setWithTTL } from '@/lib/storage';

const ANNOUNCEMENTS_TTL = 30 * 60 * 1000;

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function AnnouncementRow({ a }: { a: CanvasAnnouncement }) {
  const [open, setOpen] = useState(false);

  const preview = a.message ? htmlToText(a.message).slice(0, 120) : null;

  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden">
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
        aria-expanded={open}
      >
        {open
          ? <ChevronDown className="size-4 shrink-0 text-muted-foreground mt-0.5" />
          : <ChevronRight className="size-4 shrink-0 text-muted-foreground mt-0.5" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{a.title}</p>
          {!open && preview && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block">{formatDate(a.posted_at)}</span>
          <a
            href={a.html_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${a.title} in Canvas`}
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      {open && a.message && (
        <div className="border-t border-border px-4 py-4">
          <div
            className="canvas-page-body text-sm leading-relaxed text-foreground/90"
            dangerouslySetInnerHTML={{ __html: a.message }}
          />
          <p className="text-xs text-muted-foreground mt-3">{formatDate(a.posted_at)}{a.author ? ` · ${a.author.display_name}` : ''}</p>
        </div>
      )}
    </div>
  );
}

export function AnnouncementsSection({ courseId }: { courseId: number }) {
  const [announcements, setAnnouncements] = useState<CanvasAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = storageGet<string>(StorageKeys.TOKEN) ?? '';

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    const cacheKey = `cc.announcements.${courseId}`;
    const cached = getWithTTL<CanvasAnnouncement[]>(cacheKey, ANNOUNCEMENTS_TTL);
    if (cached) {
      setAnnouncements(cached);
      setLoading(false);
      return;
    }

    try {
      const fetched = await fetchCourseAnnouncements(token, courseId);
      setWithTTL(cacheKey, fetched);
      setAnnouncements(fetched);
    } catch (err) {
      if (err instanceof CanvasError && err.status === 401) {
        window.location.href = '/settings';
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, [token, courseId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Announcements</p>

      {loading && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      )}

      {error && (
        <p className="text-sm text-muted-foreground">{error}</p>
      )}

      {!loading && !error && announcements.length === 0 && (
        <div className="flex items-center gap-3 px-4 py-5 rounded-xl bg-card ring-1 ring-foreground/10">
          <Megaphone className="size-4 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">No announcements</p>
        </div>
      )}

      {!loading && !error && announcements.map((a) => (
        <AnnouncementRow key={a.id} a={a} />
      ))}
    </div>
  );
}
