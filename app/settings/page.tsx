'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Eye, EyeOff, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
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

const TIMETABLE_GUIDE_STEPS = [
  { src: '/timetable-eur/guide-1.png', caption: 'On timetables.eur.nl, click the sync icon (top-right)' },
  { src: '/timetable-eur/guide-2.png', caption: 'Choose "Apple Calendar" from the dropdown' },
  { src: '/timetable-eur/guide-3.png', caption: 'Click "Next" to continue' },
  { src: '/timetable-eur/guide-4.png', caption: 'Copy the URL at the bottom and paste it above' },
];

const GUIDE_STEPS = [
  { src: '/canvas-guide/guide-1.png', caption: 'Click Account (top-left), then click Settings' },
  { src: '/canvas-guide/guide-2.png', caption: 'Scroll to "Approved integrations" → click "+ New access token"' },
  { src: '/canvas-guide/guide-3.png', caption: 'Enter a purpose, set an expiry date → click "Generate token"' },
  { src: '/canvas-guide/guide-4.png', caption: 'Copy the token — you won\'t be able to retrieve it after closing this dialog' },
];

function GuideCarousel({ steps }: { steps: typeof GUIDE_STEPS }) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  return (
    <div className="flex flex-col gap-3">
      <div className="relative rounded-md overflow-hidden border border-border bg-muted/30">
        <Image
          src={current.src}
          alt={current.caption}
          width={800}
          height={600}
          className="w-full h-auto object-contain"
          priority={step === 0}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          aria-label="Previous step"
        >
          <ChevronLeft className="size-5" />
        </button>
        <p className="flex-1 text-sm text-muted-foreground text-center">
          <span className="font-medium text-foreground">Step {step + 1}/{steps.length}:</span>{' '}
          {current.caption}
        </p>
        <button
          type="button"
          onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
          disabled={step === steps.length - 1}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
          aria-label="Next step"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="flex justify-center gap-1.5">
        {steps.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setStep(i)}
            className={`size-1.5 rounded-full transition-colors ${i === step ? 'bg-foreground' : 'bg-muted-foreground/30'}`}
            aria-label={`Go to step ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function TokenGuide() {
  return <GuideCarousel steps={GUIDE_STEPS} />;
}

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
              <div className="flex items-center gap-3">
                <CardTitle>How do I get a token?</CardTitle>
                <a
                  href="https://canvas.eur.nl/profile/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Open Canvas ↗
                </a>
              </div>
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
              <TokenGuide />
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
              <div className="flex items-center gap-3">
                <CardTitle>How do I get my timetable URL?</CardTitle>
                <a
                  href="https://timetables.eur.nl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Open timetables ↗
                </a>
              </div>
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
              <GuideCarousel steps={TIMETABLE_GUIDE_STEPS} />
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
