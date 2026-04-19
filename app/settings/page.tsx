'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { get, set, clear, clearAll, StorageKeys, getHiddenCourseIds } from '@/lib/storage';
import { fetchUser, CanvasUser } from '@/lib/canvas';
import { fetchTimetable } from '@/lib/timetable';

type Status =
  | { type: 'success'; name: string }
  | { type: 'error'; message: string }
  | null;

type TimetableStatus =
  | { type: 'success'; count: number }
  | { type: 'error'; message: string }
  | null;

export default function SettingsPage() {
  const [token, setToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(0);

  const [timetableUrl, setTimetableUrl] = useState('');
  const [hasStoredTimetable, setHasStoredTimetable] = useState(false);
  const [timetableLoading, setTimetableLoading] = useState(false);
  const [timetableStatus, setTimetableStatus] = useState<TimetableStatus>(null);
  const [showTimetableInstructions, setShowTimetableInstructions] = useState(false);

  useEffect(() => {
    const stored = get<string>(StorageKeys.TOKEN);
    if (stored) {
      setToken(stored);
      setHasStoredToken(true);
    }
    setHiddenCount(getHiddenCourseIds().length);

    const storedTimetable = get<string>(StorageKeys.TIMETABLE_URL);
    if (storedTimetable) {
      setTimetableUrl(storedTimetable);
      setHasStoredTimetable(true);
    }
  }, []);

  async function handleTest() {
    setLoading(true);
    setStatus(null);
    try {
      const user: CanvasUser = await fetchUser(token);
      set(StorageKeys.TOKEN, token);
      set(StorageKeys.USER, user);
      setHasStoredToken(true);
      setStatus({ type: 'success', name: user.name });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Connection failed';
      setStatus({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  }

  function handleDisconnect() {
    const confirmed = window.confirm(
      'This will clear your Canvas data from this browser. Continue?'
    );
    if (confirmed) {
      clearAll();
      window.location.reload();
    }
  }

  async function handleTimetableTestSave() {
    const trimmed = timetableUrl.trim();
    if (!trimmed.startsWith('https://timetables.eur.nl/')) {
      setTimetableStatus({ type: 'error', message: 'Only timetables.eur.nl URLs are accepted.' });
      return;
    }
    setTimetableLoading(true);
    setTimetableStatus(null);
    try {
      const events = await fetchTimetable(trimmed);
      set(StorageKeys.TIMETABLE_URL, trimmed);
      // Clear old cache so hook picks up fresh data
      clear(StorageKeys.TIMETABLE_EVENTS);
      setHasStoredTimetable(true);
      setTimetableStatus({ type: 'success', count: events.length });
    } catch (err) {
      setTimetableStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load timetable',
      });
    } finally {
      setTimetableLoading(false);
    }
  }

  function handleTimetableRemove() {
    clear(StorageKeys.TIMETABLE_URL);
    clear(StorageKeys.TIMETABLE_EVENTS);
    setTimetableUrl('');
    setHasStoredTimetable(false);
    setTimetableStatus(null);
  }

  return (
    <>
      <PageHeader title="Settings" />

      <div className="flex flex-col gap-6 max-w-lg">
        {/* Token form */}
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium" htmlFor="canvas-token">
            Canvas access token
          </label>
          <div className="relative">
            <Input
              id="canvas-token"
              type={showPassword ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="pr-9"
              placeholder="Paste your token here"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? 'Hide token' : 'Show token'}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleTest} disabled={loading || !token.trim()}>
              {loading && <Loader2 className="animate-spin" />}
              Test connection
            </Button>
            {hasStoredToken && (
              <Button variant="destructive" onClick={handleDisconnect}>
                Disconnect
              </Button>
            )}
          </div>

          {status?.type === 'success' && (
            <Badge variant="secondary" className="w-fit bg-green-500/15 text-green-600 dark:text-green-400">
              ✓ Connected as {status.name}
            </Badge>
          )}
          {status?.type === 'error' && (
            <Badge variant="destructive" className="w-fit">
              {status.message}
            </Badge>
          )}
        </div>

        {/* Collapsible Canvas token instructions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>How do I get a token?</CardTitle>
              <button
                type="button"
                onClick={() => setShowInstructions((v) => !v)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showInstructions ? 'Collapse' : 'Expand'}
              >
                {showInstructions ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>
            </div>
          </CardHeader>
          {showInstructions && (
            <CardContent>
              <ol className="list-decimal list-inside flex flex-col gap-1.5 text-sm text-muted-foreground">
                <li>Go to canvas.eur.nl</li>
                <li>
                  Click <strong className="text-foreground">Account</strong> →{' '}
                  <strong className="text-foreground">Settings</strong>
                </li>
                <li>
                  Scroll to{' '}
                  <strong className="text-foreground">Approved Integrations</strong>
                </li>
                <li>
                  Click{' '}
                  <strong className="text-foreground">+ New Access Token</strong>
                </li>
                <li>
                  Name it{' '}
                  <strong className="text-foreground">"Companion App"</strong>,
                  leave the expiry blank, click{' '}
                  <strong className="text-foreground">Generate Token</strong>
                </li>
                <li>Copy the token and paste it above</li>
              </ol>
            </CardContent>
          )}
        </Card>

        {/* EUR Timetable */}
        <Card>
          <CardHeader>
            <CardTitle>EUR Timetable</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              id="timetable-url"
              type="url"
              value={timetableUrl}
              onChange={(e) => setTimetableUrl(e.target.value)}
              placeholder="https://timetables.eur.nl/…"
            />
            <p className="text-xs text-muted-foreground">
              Only <code>timetables.eur.nl</code> URLs are accepted.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleTimetableTestSave}
                disabled={timetableLoading || !timetableUrl.trim()}
              >
                {timetableLoading && <Loader2 className="animate-spin" />}
                Test &amp; save
              </Button>
              {hasStoredTimetable && (
                <Button variant="outline" onClick={handleTimetableRemove}>
                  Remove
                </Button>
              )}
            </div>
            {timetableStatus?.type === 'success' && (
              <Badge variant="secondary" className="w-fit bg-green-500/15 text-green-600 dark:text-green-400">
                ✓ Loaded {timetableStatus.count} events
              </Badge>
            )}
            {timetableStatus?.type === 'error' && (
              <Badge variant="destructive" className="w-fit">
                {timetableStatus.message}
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Timetable instructions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>How do I get my timetable URL?</CardTitle>
              <button
                type="button"
                onClick={() => setShowTimetableInstructions((v) => !v)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showTimetableInstructions ? 'Collapse' : 'Expand'}
              >
                {showTimetableInstructions ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>
            </div>
          </CardHeader>
          {showTimetableInstructions && (
            <CardContent>
              <ol className="list-decimal list-inside flex flex-col gap-1.5 text-sm text-muted-foreground">
                <li>Go to timetables.eur.nl and log in</li>
                <li>
                  Click <strong className="text-foreground">Connect Calendar</strong> (top right)
                </li>
                <li>
                  Select <strong className="text-foreground">iCalendar</strong> from the dropdown
                </li>
                <li>
                  Copy the URL that appears (starts with{' '}
                  <code className="text-foreground">https://timetables.eur.nl/…</code>)
                </li>
                <li>Paste it above</li>
              </ol>
            </CardContent>
          )}
        </Card>

        {/* Course visibility */}
        {hiddenCount > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Course visibility</p>
            <p className="text-sm text-muted-foreground">
              You have {hiddenCount} course{hiddenCount !== 1 ? 's' : ''} hidden.
            </p>
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => {
                clear(StorageKeys.HIDDEN_COURSES);
                window.location.reload();
              }}
            >
              Show all courses
            </Button>
          </div>
        )}

        {/* Privacy note */}
        <p className="text-xs text-muted-foreground">
          Your Canvas token and timetable URL are stored only in your browser. The timetable URL is
          fetched through this app&apos;s server to work around browser restrictions. It is never
          logged or stored on any server.
        </p>
      </div>
    </>
  );
}
