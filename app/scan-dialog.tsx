"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, Flashlight, FlashlightOff, Loader2, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/** 1D + QR formats a grocery shop actually meets on shelves. */
const PREFERRED_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
];

/** A barcode must leave the frame for this long before the same code adds again. */
const REPRESENCE_DELAY_MS = 600;

/**
 * Camera barcode scanning. Two engines:
 *  - native `BarcodeDetector` (Android Chrome — fast and reliable for EAN barcodes)
 *  - html5-qrcode fallback (desktop Firefox, iOS Safari)
 *
 * The dialog stays open so the cashier can scan a whole basket without
 * re-opening the camera; every detection adds one item to the bill behind it.
 *
 * IMPORTANT: cameras only exist in secure contexts. Over the shop WiFi the
 * phone must use the https:// address printed by `npm run phone` — over plain
 * http:// `navigator.mediaDevices` doesn't exist at all.
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
  // Stable per-mount: is the camera API reachable at all, and which engine?
  const [secure] = useState(
    () =>
      typeof window !== "undefined" &&
      window.isSecureContext === true &&
      typeof navigator.mediaDevices?.getUserMedia === "function",
  );
  const [engine] = useState<"native" | "html5" | null>(() => {
    if (typeof window === "undefined") return null;
    return "BarcodeDetector" in window ? "native" : "html5";
  });

  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const torchTrackRef = useRef<MediaStreamTrack | null>(null);
  // Barcode presence tracking — see RE-PRESENT_DELAY_MS above.
  const seenRef = useRef<{ code: string; absentAt: number }>({ code: "", absentAt: 0 });
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const acceptCode = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    seenRef.current = { code, absentAt: 0 };
    setAddedCount((c) => c + 1);
    setJustAdded(code);
    onDetectedRef.current(code);
  }, []);

  // Reset the session each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    seenRef.current = { code: "", absentAt: 0 };
    setAddedCount(0);
    setJustAdded(null);
    setManualCode("");
    setTorchOn(false);
    setHasTorch(false);
    setStatus(secure ? "starting" : "error");
    setError(
      secure
        ? null
        : [
            "The camera is hidden by the browser on http:// addresses.",
            "",
            "Fix: on the shop computer run  npm run phone  and open the https://…:3443",
            "address it prints (accept the one-time certificate warning).",
            "Billing keeps working on the http:// address — only the camera needs https.",
          ].join("\n"),
    );
  }, [open, secure]);

  // Start / stop the camera for the chosen engine.
  useEffect(() => {
    if (!open || !secure || !engine) return;
    let cancelled = false;

    function handleDetection(code: string) {
      const seen = seenRef.current;
      if (seen.code === code) {
        // Left the frame long enough to count as a fresh scan of the same item?
        if (seen.absentAt > 0 && Date.now() - seen.absentAt >= REPRESENCE_DELAY_MS) {
          acceptCode(code);
          return;
        }
        // Same barcode still in front of the lens — wait until it leaves view.
        seen.absentAt = 0;
        return;
      }
      acceptCode(code);
    }
    function handleMiss() {
      if (seenRef.current.code && !seenRef.current.absentAt) {
        seenRef.current.absentAt = Date.now();
      }
    }

    (async () => {
      try {
        if (engine === "native") {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          await video.play().catch(() => {});

          const track = stream.getVideoTracks()[0];
          torchTrackRef.current = track;
          const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
          if (capabilities?.torch) setHasTorch(true);

          let formats = PREFERRED_FORMATS;
          try {
            const supported = await (
              window as unknown as { BarcodeDetector: { getSupportedFormats: () => Promise<string[]> } }
            ).BarcodeDetector.getSupportedFormats();
            const usable = PREFERRED_FORMATS.filter((f) => supported.includes(f));
            if (usable.length > 0) formats = usable;
          } catch {
            // Format probing is optional — the defaults cover real barcodes.
          }
          const detector = new (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector({
            formats,
          });

          setStatus("scanning");
          timerRef.current = setInterval(() => {
            if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return;
            detector
              .detect(videoRef.current)
              .then((results) => {
                if (cancelled) return;
                if (results.length > 0) handleDetection(results[0].rawValue);
                else handleMiss();
              })
              .catch(() => {
                // A transient frame decode error is normal — keep scanning.
              });
          }, 130);
        } else {
          const { Html5Qrcode } = await import("html5-qrcode");
          if (cancelled) return;
          const scanner = new Html5Qrcode("scan-region", { verbose: false });
          scannerRef.current = scanner;
          await scanner.start(
            { facingMode: "environment" },
            {
              fps: 12,
              qrbox: (viewfinderWidth, viewfinderHeight) => ({
                width: Math.floor(viewfinderWidth * 0.85),
                height: Math.floor(viewfinderHeight * 0.5),
              }),
            },
            (decodedText) => {
              if (!cancelled) handleDetection(decodedText);
            },
            () => {
              if (!cancelled) handleMiss();
            },
          );
          if (cancelled) return;
          setStatus("scanning");
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || /permission/i.test(String(err))) {
          setError(
            "Camera permission was denied. Allow camera access for this site (tap the ⓘ or 🔒 icon in the address bar → Permissions → Camera) and try again.",
          );
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError("No usable camera was found on this device.");
        } else if (name === "NotReadableError") {
          setError("Another app is using the camera. Close it and try again.");
        } else {
          setError("The camera could not start. Try again, or type the barcode below.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      torchTrackRef.current = null;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
      }
      const stream = streamRef.current;
      streamRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, secure, engine, acceptCode]);

  async function toggleTorch() {
    const track = torchTrackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      // `torch` is not in the standard TS constraint set yet.
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      toast.error("This camera does not support the torch.");
    }
  }

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    acceptCode(code);
    setManualCode("");
  }

  function close() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera size={18} /> Scan barcode
          </DialogTitle>
          <DialogDescription>
            {status === "error"
              ? "Camera unavailable on this connection."
              : "Scan each item once — it is added to the bill behind this dialog. The dialog stays open for the whole basket."}
          </DialogDescription>
        </DialogHeader>

        {status === "error" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-2 rounded-lg bg-muted p-6 text-center text-muted-foreground">
              <CameraOff className="text-muted-foreground/70" />
              <p className="whitespace-pre-line text-sm leading-relaxed">{error}</p>
            </div>
            <ManualEntry value={manualCode} onChange={setManualCode} onSubmit={submitManual} />
          </div>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-lg bg-black">
              {engine === "native" ? (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className={`aspect-[4/3] w-full object-cover transition-shadow ${
                    justAdded ? "ring-4 ring-emerald-400" : ""
                  }`}
                />
              ) : (
                <div
                  id="scan-region"
                  className={`min-h-[240px] w-full [&_video]:w-full ${justAdded ? "ring-4 ring-emerald-400" : ""}`}
                />
              )}

              {status === "starting" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
                  <Loader2 className="animate-spin" />
                  <p className="text-sm">Starting camera…</p>
                </div>
              )}

              {status === "scanning" && (
                <>
                  {/* Aim hint — keep barcodes inside this band. */}
                  <div className="pointer-events-none absolute inset-x-8 top-1/2 h-28 -translate-y-1/2 rounded-lg border-2 border-white/60" />
                  {hasTorch && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-sm"
                      aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
                      onClick={toggleTorch}
                      className="absolute top-2 right-2"
                    >
                      {torchOn ? <FlashlightOff /> : <Flashlight />}
                    </Button>
                  )}
                  {justAdded && (
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-emerald-600/90 px-3 py-1.5 text-sm font-semibold text-white">
                      <CheckCircle2 size={15} /> Added {justAdded}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ScanBarcode size={14} />
                {addedCount === 0 ? "Nothing scanned yet" : `${addedCount} item${addedCount === 1 ? "" : "s"} added`}
              </p>
              <Button variant="outline" onClick={close}>
                Done
              </Button>
            </div>

            <ManualEntry value={manualCode} onChange={setManualCode} onSubmit={submitManual} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManualEntry({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder="Camera not reading? Type the barcode…"
        aria-label="Type a barcode"
        className="flex-1"
      />
      <Button type="submit" variant="outline" disabled={!value.trim()}>
        Add
      </Button>
    </form>
  );
}
