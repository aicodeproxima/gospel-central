'use client';

/**
 * Root error boundary (audit M-9). Next.js App Router routes any
 * unhandled render / effect error under `src/app` to the closest
 * `error.tsx`. Without one, React silently unmounts the subtree and
 * the user sees a blank canvas — which is what the audit flagged.
 *
 * This is intentionally minimal. A future pass can wire Sentry /
 * Datadog here so we start seeing production errors.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Best-effort surface until a real observability pipeline exists.
    console.error('[Gospel Central] Unhandled error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-xl">
        <div className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          <h1 className="text-lg font-semibold">Something went wrong</h1>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          An unexpected error crashed this view. You can try again, or go
          back to the dashboard.
        </p>
        {error?.digest && (
          <p className="mt-2 font-mono text-[10px] text-muted-foreground/70">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <Button onClick={reset} className="flex-1">
            Try again
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push('/dashboard')}
          >
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
