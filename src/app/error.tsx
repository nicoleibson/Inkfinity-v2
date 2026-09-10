'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-4" id="app-error-boundary">
      <div className="p-3 rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight">Something went wrong</h2>
      <p className="text-muted-foreground max-w-md text-sm">
        An unexpected issue occurred while loading this page. You can reload or try again.
      </p>
      <div className="flex gap-3 pt-2">
        <Button onClick={() => reset()} variant="outline" className="gap-2" id="try-again-btn">
          <RefreshCw className="w-4 h-4" /> Try again
        </Button>
        <Button onClick={() => window.location.reload()} id="reload-page-btn">
          Reload Page
        </Button>
      </div>
    </div>
  );
}
