"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Camera barcode scanner using html5-qrcode (works on Android and iOS).
 * Camera access needs a secure context — localhost, or HTTPS via
 * `npm run dev:phone` when opening the counter from a phone.
 */
export default function ScanDialog({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}) {
  const [status, setStatus] = useState<"starting" | "ready" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const detectedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    detectedRef.current = false;
    setStatus("starting");
    setError(null);
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode("scan-region", { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decodedText) => {
            if (detectedRef.current) return;
            detectedRef.current = true;
            onDetected(decodedText);
            onOpenChange(false);
          },
          () => {
            // per-frame decode misses are normal — ignore
          },
        );
        if (cancelled) {
          await scanner.stop().catch(() => {});
          scanner.clear();
          return;
        }
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        const message = err instanceof Error ? err.message : String(err);
        setError(
          message.includes("Permission")
            ? "Camera permission was denied. Allow camera access and try again."
            : "Camera is not available here. Note: camera scanning needs HTTPS — run `npm run dev:phone` and open the HTTPS address on the phone.",
        );
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera size={18} /> Scan barcode
          </DialogTitle>
          <DialogDescription>Point the camera at the product barcode — it adds the item automatically.</DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-lg bg-black">
          <div id="scan-region" className="min-h-[240px] w-full [&_video]:w-full" />
          {status === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
              <Loader2 className="animate-spin" />
              <p className="text-sm">Starting camera…</p>
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white/80">
              <CameraOff />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
