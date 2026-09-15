import { Store } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
        <Store size={22} />
      </span>
      <p className="text-sm font-medium text-muted-foreground">Loading…</p>
    </div>
  );
}