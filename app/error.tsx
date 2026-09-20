"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

/**
 * Route-section error boundary. A crashed screen shows this friendly panel
 * instead of a raw stack — data on disk is untouched, so "Try again" reloads
 * the section and life goes on.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surfaced in the dev overlay / server logs; nothing shown to the shopkeeper.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
        <AlertTriangle size={26} />
      </span>
      <h1 className="mt-4 font-heading text-xl font-bold text-foreground">This screen hit a snag</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {APP_NAME} is still running and all saved bills, stock and khata data are safe on this computer. Try again, and
        if it keeps happening, restart the app from the shop computer.
      </p>
      <div className="mt-5 flex gap-2">
        <Button onClick={reset}>
          <RefreshCw /> Try again
        </Button>
        <Button variant="outline" onClick={() => window.location.assign("/")}>
          Go to Counter
        </Button>
      </div>
      {error.digest && <p className="mt-4 font-mono text-[11px] text-muted-foreground/60">ref: {error.digest}</p>}
    </div>
  );
}
