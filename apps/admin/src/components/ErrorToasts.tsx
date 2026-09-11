import { useEffect, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Every failed action says so, whether or not anyone wired up an error handler.
 *
 * Most mutations in this app were written without one: a refused delete or a
 * rejected create resolved into nothing and the screen simply did not change.
 * That is indistinguishable from a button that does not work, and it is exactly
 * how "the delete button is broken" and "I cannot create a category" were
 * reported — both were the server saying no, in silence.
 *
 * React Query's mutation cache sees every failure, so one subscription here
 * covers every button on the platform, including ones added later. A mutation
 * with its own `onError` still shows its message in place; this is the floor,
 * not a replacement.
 */
type Toast = { id: number; message: string };

let nextId = 1;

export function ErrorToasts({ queryClient }: { queryClient: QueryClient }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const cache = queryClient.getMutationCache();
    return cache.subscribe((event: any) => {
      if (event?.type !== 'updated' || event.action?.type !== 'error') return;

      const error = event.action.error;
      const message = (error?.message || 'Something went wrong').trim();

      // A session that has expired is handled by the api layer, which redirects
      // to the login screen; shouting about it on the way out helps nobody.
      if (/unauthor|session expired/i.test(message)) return;

      const id = nextId++;
      setToasts((current) => {
        // The same failure clicked twice should not stack up.
        if (current.some((toast) => toast.message === message)) return current;
        return [...current, { id, message }];
      });
      setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 8000);
    });
  }, [queryClient]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className="pointer-events-auto flex items-start gap-3 rounded-lg border border-destructive/40 bg-card p-3 shadow-lg"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <p className="flex-1 text-sm">{toast.message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
