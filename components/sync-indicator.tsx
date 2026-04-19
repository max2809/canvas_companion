'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useCanvasData } from '@/lib/hooks';

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export function SyncIndicator() {
  const { loading, error, lastSync, refresh } = useCanvasData();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (error === 'no-token' || error === 'invalid-token') {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <WifiOff className="h-3.5 w-3.5" />
        <span>Not connected</span>
        <a href="/settings" className="underline underline-offset-2 hover:text-foreground">
          Settings
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        <span>Syncing…</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span>Synced {lastSync ? timeAgo(lastSync) : '—'}</span>
      <button
        onClick={refresh}
        aria-label="Refresh"
        className="rounded p-0.5 hover:text-foreground hover:bg-muted transition-colors"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
