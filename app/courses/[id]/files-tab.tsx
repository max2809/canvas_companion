'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Download,
  RotateCw,
  ExternalLink,
  File,
  FileText,
  X,
  BookOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { get as storageGet, getWithTTL, setWithTTL } from '@/lib/storage';
import { StorageKeys } from '@/lib/storage';
import { fetchCourseModules, fetchCoursePage, downloadModuleFile, CanvasError } from '@/lib/canvas';
import type { CanvasModule } from '@/lib/canvas';

// ─── Helpers ────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadQueue<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  const queue = [...items];
  const runners = Array(concurrency).fill(null).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

function buildUniqueFilename(name: string, seen: Map<string, number>): string {
  const count = seen.get(name) ?? 0;
  seen.set(name, count + 1);
  if (count === 0) return name;
  const dot = name.lastIndexOf('.');
  const n = count + 1;
  if (dot === -1) return `${name} (${n})`;
  return `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
}

function sanitizeZipPath(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'Files';
}

// Parse Canvas file links out of a page's HTML body (browser-side only)
function extractCanvasFileLinks(html: string): { fileId: number; title: string }[] {
  if (typeof document === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set<number>();
  const results: { fileId: number; title: string }[] = [];
  for (const link of doc.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href') ?? '';
    const match = href.match(/\/files\/(\d+)/);
    if (!match) continue;
    const fileId = Number(match[1]);
    if (seen.has(fileId)) continue;
    seen.add(fileId);
    const title = link.textContent?.trim() || `File ${fileId}`;
    results.push({ fileId, title });
  }
  return results;
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 w-full max-w-md flex flex-col gap-5 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface FileItem {
  id: number;
  title: string;
  fileId: number;
  moduleId: number;
  moduleName: string;
  pageSource?: string; // page title this file was found in
}

interface LinkItem {
  id: number;
  title: string;
  url: string;
  newTab: boolean;
  moduleId: number;
  moduleName: string;
}

interface DownloadProgress {
  current: number;
  total: number;
  currentFile: string;
}

type ModalState = 'confirm' | 'downloading' | 'done' | 'error';

const MODULES_TTL = 60 * 60 * 1000;
const PAGE_BODY_TTL = 60 * 60 * 1000;

// ─── Main component ──────────────────────────────────────────────────────────

export function FilesTab({
  courseId,
  courseCode,
}: {
  courseId: number;
  courseCode: string;
}) {
  const [modules, setModules] = useState<CanvasModule[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorRetryable, setLoadErrorRetryable] = useState(true);

  // Files extracted from page bodies (secondary, async)
  const [pageFileItems, setPageFileItems] = useState<FileItem[]>([]);
  const [loadingPageFiles, setLoadingPageFiles] = useState(false);

  const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalState, setModalState] = useState<ModalState>('confirm');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [failures, setFailures] = useState<string[]>([]);

  const [collapsedModules, setCollapsedModules] = useState<Set<number>>(new Set());
  const toggleModule = (id: number) =>
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const [downloadingSections, setDownloadingSections] = useState<Set<number>>(new Set());

  const cancelledRef = useRef(false);
  const extractionKeyRef = useRef(''); // prevents double-extraction on re-renders

  const token = storageGet<string>(StorageKeys.TOKEN) ?? '';

  // ── Page file extraction ────────────────────────────────────────────────────

  const extractFilesFromPages = useCallback(async (mods: CanvasModule[]) => {
    const pageModuleItems = mods.flatMap((mod) =>
      (mod.items ?? [])
        .filter((item) => item.type === 'Page' && item.page_url)
        .map((item) => ({ item, mod }))
    );
    if (pageModuleItems.length === 0) return;

    setLoadingPageFiles(true);
    const extracted: FileItem[] = [];

    await downloadQueue(pageModuleItems, 3, async ({ item, mod }) => {
      const cacheKey = `cc.pagebody.${courseId}.${item.page_url}`;
      let body: string | null = null;

      const cached = getWithTTL<string>(cacheKey, PAGE_BODY_TTL);
      if (cached !== null) {
        body = cached;
      } else {
        try {
          const page = await fetchCoursePage(token, courseId, item.page_url!);
          body = page.body;
          setWithTTL(cacheKey, body ?? '');
        } catch {
          return; // skip pages we can't fetch
        }
      }

      if (!body) return;

      for (const f of extractCanvasFileLinks(body)) {
        extracted.push({
          id: f.fileId,       // unique enough as a key for page-derived items
          title: f.title,
          fileId: f.fileId,
          moduleId: mod.id,
          moduleName: mod.name,
          pageSource: item.title,
        });
      }
    });

    setPageFileItems(extracted);
    setLoadingPageFiles(false);
  }, [token, courseId]);

  // ── Module loading ──────────────────────────────────────────────────────────

  const loadModules = useCallback(
    async (bypassCache = false) => {
      if (!token) return;
      setLoadingFiles(true);
      setLoadError(null);
      setPageFileItems([]);
      extractionKeyRef.current = '';

      const cacheKey = `cc.modules.${courseId}`;

      if (!bypassCache) {
        const cached = getWithTTL<CanvasModule[]>(cacheKey, MODULES_TTL);
        if (cached) {
          setModules(cached);
          setLoadingFiles(false);
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
        if (err instanceof CanvasError && err.status === 403) {
          setLoadError('Module access is restricted for this course.');
          setLoadErrorRetryable(false);
          setLoadingFiles(false);
          return;
        }
        setLoadErrorRetryable(true);
        setLoadError(err instanceof Error ? err.message : 'Failed to load modules');
      } finally {
        setLoadingFiles(false);
      }
    },
    [token, courseId]
  );

  useEffect(() => { loadModules(false); }, [loadModules]);

  // Trigger page file extraction once after modules are available
  useEffect(() => {
    const key = `${courseId}:${modules.length}`;
    if (modules.length > 0 && extractionKeyRef.current !== key) {
      extractionKeyRef.current = key;
      void extractFilesFromPages(modules);
    }
  }, [modules, courseId, extractFilesFromPages]);

  // ── Derived item lists ──────────────────────────────────────────────────────

  const directFileItems: FileItem[] = [];
  const linkItems: LinkItem[] = [];

  for (const mod of modules) {
    for (const item of mod.items ?? []) {
      if (item.type === 'File' && item.content_id) {
        directFileItems.push({
          id: item.id,
          title: item.title,
          fileId: item.content_id,
          moduleId: mod.id,
          moduleName: mod.name,
        });
      } else if (item.type === 'ExternalUrl' && item.external_url) {
        linkItems.push({
          id: item.id,
          title: item.title,
          url: item.external_url,
          newTab: item.new_tab ?? true,
          moduleId: mod.id,
          moduleName: mod.name,
        });
      }
    }
  }

  // Merge page-derived files, deduplicating any already present as direct items
  const directFileIds = new Set(directFileItems.map((f) => f.fileId));
  const uniquePageFileItems = pageFileItems.filter((f) => !directFileIds.has(f.fileId));
  const allFileItems = [...directFileItems, ...uniquePageFileItems];

  // ── Download handlers ───────────────────────────────────────────────────────

  async function handleSingleDownload(item: FileItem) {
    if (downloadingFileId !== null) return;
    setDownloadingFileId(item.fileId);
    try {
      const { blob, filename } = await downloadModuleFile(token, courseId, item.fileId);
      triggerDownload(blob, filename);
    } catch {
      // silent
    } finally {
      setDownloadingFileId(null);
    }
  }

  function openDownloadAll() {
    cancelledRef.current = false;
    setProgress(null);
    setFailures([]);
    setModalState('confirm');
    setModalOpen(true);
  }

  function closeModal() {
    if (modalState === 'downloading') cancelledRef.current = true;
    setModalOpen(false);
  }

  async function startZipDownload() {
    setModalState('downloading');
    cancelledRef.current = false;
    const failList: string[] = [];
    const zip = new JSZip();
    // Per-folder deduplication: folder name → (filename → count)
    const seenPerFolder = new Map<string, Map<string, number>>();
    let done = 0;

    await downloadQueue(allFileItems, 3, async (item) => {
      if (cancelledRef.current) return;
      setProgress({ current: done, total: allFileItems.length, currentFile: item.title });
      try {
        const { blob, filename } = await downloadModuleFile(token, courseId, item.fileId);
        if (!cancelledRef.current) {
          const folder = sanitizeZipPath(item.moduleName);
          if (!seenPerFolder.has(folder)) seenPerFolder.set(folder, new Map());
          const unique = buildUniqueFilename(filename, seenPerFolder.get(folder)!);
          zip.file(`${folder}/${unique}`, blob);
        }
      } catch {
        failList.push(item.title);
      }
      done++;
      setProgress({ current: done, total: allFileItems.length, currentFile: item.title });
    });

    if (cancelledRef.current) { setModalOpen(false); return; }

    try {
      triggerDownload(await zip.generateAsync({ type: 'blob' }), `${courseCode}-files.zip`);
      setFailures(failList);
      setModalState('done');
    } catch {
      setModalState('error');
    }
  }

  async function handleSectionDownload(mod: CanvasModule) {
    const modFiles = allFileItems.filter((f) => f.moduleId === mod.id);
    if (modFiles.length === 0 || downloadingSections.has(mod.id)) return;
    setDownloadingSections((prev) => new Set(prev).add(mod.id));
    const zip = new JSZip();
    const seenNames = new Map<string, number>();
    const folderName = sanitizeZipPath(mod.name);
    await downloadQueue(modFiles, 3, async (item) => {
      try {
        const { blob, filename } = await downloadModuleFile(token, courseId, item.fileId);
        zip.file(`${folderName}/${buildUniqueFilename(filename, seenNames)}`, blob);
      } catch { /* skip */ }
    });
    try {
      triggerDownload(await zip.generateAsync({ type: 'blob' }), `${courseCode}-${folderName}.zip`);
    } catch { /* silent */ }
    setDownloadingSections((prev) => { const next = new Set(prev); next.delete(mod.id); return next; });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingFiles) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-3 items-start">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        {loadErrorRetryable && (
          <Button variant="outline" size="sm" onClick={() => loadModules(true)}>Retry</Button>
        )}
      </div>
    );
  }

  const hasContent = allFileItems.length > 0 || linkItems.length > 0;

  if (!hasContent && !loadingPageFiles) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <BookOpen className="size-12 opacity-20" />
        <p className="text-sm">No downloadable files or links found in course modules</p>
      </div>
    );
  }

  // All modules that have at least one item to show
  const activeModuleIds = new Set([
    ...allFileItems.map((f) => f.moduleId),
    ...linkItems.map((l) => l.moduleId),
  ]);
  const moduleGroups = modules
    .filter((mod) => activeModuleIds.has(mod.id))
    .sort((a, b) => a.position - b.position);

  const fileCount = allFileItems.length;
  const linkCount = linkItems.length;

  return (
    <>
      {/* Header row */}
      <div className="flex items-center gap-4">
        {fileCount > 0 && (
          <button
            onClick={openDownloadAll}
            disabled={loadingPageFiles}
            className="btn-brand w-28 h-28 rounded-2xl flex flex-col items-center justify-center gap-2 bg-foreground/5 active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Download className="size-8" />
            <span className="text-xs font-medium leading-tight text-center">Download all files</span>
          </button>
        )}
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          {fileCount > 0 && `${fileCount} file${fileCount !== 1 ? 's' : ''}`}
          {fileCount > 0 && linkCount > 0 && ' · '}
          {linkCount > 0 && `${linkCount} link${linkCount !== 1 ? 's' : ''}`}
          {loadingPageFiles && (
            <RotateCw className="size-3 animate-spin opacity-50" aria-label="Scanning pages for files…" />
          )}
        </p>
        <Button variant="ghost" size="sm" onClick={() => loadModules(true)} aria-label="Refresh" className="ml-auto">
          <RotateCw className="size-4" />
        </Button>
      </div>

      {/* Module groups */}
      <div className="flex flex-col gap-5">
        {moduleGroups.map((mod) => {
          const modFiles = allFileItems.filter((f) => f.moduleId === mod.id);
          const modLinks = linkItems.filter((l) => l.moduleId === mod.id);
          const collapsed = collapsedModules.has(mod.id);
          return (
            <div key={mod.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => toggleModule(mod.id)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                >
                  {collapsed
                    ? <ChevronRight className="size-3 shrink-0" />
                    : <ChevronDown className="size-3 shrink-0" />}
                  {mod.name}
                </button>
                {modFiles.length > 0 && (
                  <button
                    onClick={() => handleSectionDownload(mod)}
                    disabled={downloadingSections.has(mod.id)}
                    title="Download all section files"
                    className="btn-brand w-8 h-8 rounded-lg flex items-center justify-center bg-foreground/5 active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {downloadingSections.has(mod.id)
                      ? <RotateCw className="size-3.5 animate-spin" />
                      : <Download className="size-3.5" />}
                  </button>
                )}
              </div>

              {!collapsed && modFiles.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card ring-1 ring-foreground/10"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{item.title}</p>
                    {item.pageSource && (
                      <p className="text-xs text-muted-foreground">from {item.pageSource}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Download ${item.title}`}
                    onClick={() => handleSingleDownload(item)}
                    disabled={downloadingFileId === item.fileId}
                  >
                    {downloadingFileId === item.fileId
                      ? <RotateCw className="size-4 animate-spin" />
                      : <Download className="size-4" />
                    }
                  </Button>
                </div>
              ))}

              {!collapsed && modLinks.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card ring-1 ring-foreground/10 hover:ring-foreground/20 transition-all group"
                >
                  <File className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 min-w-0 truncate text-sm">{item.title}</span>
                  <ExternalLink className="size-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </a>
              ))}
            </div>
          );
        })}
      </div>

      {/* Download all modal */}
      {modalOpen && (
        <Modal title={`Download all files — ${courseCode}`} onClose={closeModal}>
          {modalState === 'confirm' && (
            <>
              <p className="text-sm text-muted-foreground">
                This will download {allFileItems.length} file{allFileItems.length !== 1 ? 's' : ''} as a ZIP.
                Keep this tab open until it finishes.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={closeModal}>Cancel</Button>
                <Button onClick={startZipDownload}>Start</Button>
              </div>
            </>
          )}

          {modalState === 'downloading' && progress && (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate max-w-[200px]">{progress.currentFile}</span>
                  <span>{progress.current} of {progress.total}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-foreground rounded-full transition-all duration-200"
                    style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              </div>
            </>
          )}

          {modalState === 'done' && (
            <>
              <p className="text-sm text-muted-foreground">
                ZIP saved as <span className="font-mono text-foreground">{courseCode}-files.zip</span>.
              </p>
              {failures.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    {failures.length} file{failures.length !== 1 ? 's' : ''} failed:
                  </p>
                  <ul className="text-xs text-destructive list-disc list-inside max-h-24 overflow-y-auto">
                    {failures.map((name) => <li key={name}>{name}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={() => setModalOpen(false)}>Done</Button>
              </div>
            </>
          )}

          {modalState === 'error' && (
            <>
              <p className="text-sm text-destructive">Failed to build the ZIP. Please try again.</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>Close</Button>
                <Button onClick={startZipDownload}>Retry</Button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
