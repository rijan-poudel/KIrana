"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, FileImage, Flashlight, FlashlightOff, ImagePlus, Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/**
 * Bill-QR capture. One dialog, three ways in — all of them deterministic QR
 * decoding, no AI anywhere:
 *  - Camera: native `BarcodeDetector` (Android Chrome) or html5-qrcode fallback.
 *  - Photo: decode a picture already taken of the bill (phone photo, screenshot).
 *  - Paste: the raw QR text, e.g. copied from the vendor's e-bill.
 *
 * The camera stops at the first stable capture; the review dialog takes over.
 */
export default function ScanBillDialog({
  open,
  onOpenChange,
  onCaptured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured: (raw: string, photoFile: File | null) => void;
}) {
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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [keepPhoto, setKeepPhoto] = useState(true);
  const [pasteText, setPasteText] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const rafRef = useRef<number>(0);
  const torchTrackRef = useRef<MediaStreamTrack | null>(null);
  const capturedRef = useRef(false);
  const onCapturedRef = useRef(onCaptured);
  onCapturedRef.current = onCaptured;

  const capture = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text || capturedRef.current) return;
    capturedRef.current = true;
    onCapturedRef.current(text, null);
  }, []);

  useEffect(() => {
    if (!open) return;
    capturedRef.current = false;
    setPasteText("");
    setPhotoError(null);
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
            "You can still use the Photo and Paste tabs without a camera.",
          ].join("\n"),
    );
  }, [open, secure]);

  // Camera session — same two-engine approach as the counter's barcode scanner.
  useEffect(() => {
    if (!open || !secure || !engine) return;
    let cancelled = false;

    (async () => {
      try {
        if (engine === "native") {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
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

          const detector = new (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector({
            formats: ["qr_code"],
          });
          setStatus("scanning");

          const DETECT_INTERVAL_MS = 60;
          let lastDetect = 0;
          let inFlight = false;
          const loop = (now: number) => {
            if (cancelled) return;
            if (!inFlight && !capturedRef.current && now - lastDetect >= DETECT_INTERVAL_MS && videoRef.current?.readyState! >= 2) {
              const video = videoRef.current!;
              inFlight = true;
              lastDetect = now;
              detector
                .detect(video)
                .then((results) => {
                  if (cancelled) return;
                  if (results.length > 0) capture(results[0].rawValue);
                })
                .catch(() => {
                  // Transient frame decode errors are normal.
                })
                .finally(() => {
                  inFlight = false;
                });
            }
            rafRef.current = requestAnimationFrame(loop);
          };
          rafRef.current = requestAnimationFrame(loop);
        } else {
          const { Html5Qrcode } = await import("html5-qrcode");
          if (cancelled) return;
          const scanner = new Html5Qrcode("bill-qr-region", { verbose: false });
          scannerRef.current = scanner;
          await scanner.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: (viewfinderWidth, viewfinderHeight) => ({
                width: Math.floor(viewfinderWidth * 0.85),
                height: Math.floor(viewfinderHeight * 0.85),
              }),
            },
            (decodedText) => {
              if (!cancelled) capture(decodedText);
            },
            () => {
              // Frame without a QR — ignore.
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
          setError("Camera permission was denied. Allow camera access for this site (tap the ⓘ or 🔒 icon in the address bar → Permissions → Camera) and try again.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError("No usable camera was found on this device.");
        } else if (name === "NotReadableError") {
          setError("Another app is using the camera. Close it and try again.");
        } else {
          setError("The camera could not start. Use the Photo or Paste tab instead.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
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
  }, [open, secure, engine, capture]);

  async function toggleTorch() {
    const track = torchTrackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setHasTorch(false);
    }
  }

  /** Decode a QR from an already-taken photo: native detector first, then
   *  html5-qrcode's file scan on the original and a downscaled copy. */
  async function decodePhoto(file: File): Promise<string> {
    if ("BarcodeDetector" in window) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        try {
          const detector = new (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector({ formats: ["qr_code"] });
          const results = await detector.detect(bitmap);
          if (results.length > 0) return results[0].rawValue;
        } finally {
          bitmap.close?.();
        }
      } catch {
        // Fall through to html5-qrcode.
      }
    }

    const { Html5Qrcode } = await import("html5-qrcode");
    const holder = document.createElement("div");
    holder.id = "bill-qr-file-region";
    holder.style.display = "none";
    document.body.appendChild(holder);
    const scanner = new Html5Qrcode("bill-qr-file-region", { verbose: false });
    try {
      try {
        const result = await scanner.scanFileV2(file, false);
        return result.decodedText;
      } catch {
        // Big phone photos sometimes defeat the decoder — feed it a smaller copy.
        const downscaled = await downscaleToBlob(file, 1600);
        const result = await scanner.scanFileV2(downscaled, false);
        return result.decodedText;
      }
    } finally {
      scanner.clear();
      holder.remove();
    }
  }

  async function handlePhoto(file: File | null) {
    setPhotoError(null);
    if (!file) return;
    setPhotoBusy(true);
    try {
      const raw = await decodePhoto(file);
      if (!raw?.trim()) throw new Error("empty");
      capturedRef.current = true;
      onCapturedRef.current(raw.trim(), keepPhoto ? file : null);
    } catch {
      setPhotoError("No QR code found in that photo. Get the whole square in frame with good light — or paste the QR text in the Paste tab.");
    } finally {
      setPhotoBusy(false);
    }
  }

  function handlePaste() {
    const text = pasteText.trim();
    if (!text) return;
    capture(text);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine size={18} /> Scan bill QR
          </DialogTitle>
          <DialogDescription>
            Capture the square QR printed on the vendor's bill — VAT details fill themselves in.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="camera">
          <TabsList className="w-full">
            <TabsTrigger value="camera" className="flex-1">
              <Camera size={14} className="mr-1.5" /> Camera
            </TabsTrigger>
            <TabsTrigger value="photo" className="flex-1">
              <FileImage size={14} className="mr-1.5" /> Photo
            </TabsTrigger>
            <TabsTrigger value="paste" className="flex-1">
              Paste
            </TabsTrigger>
          </TabsList>

          <TabsContent value="camera" className="mt-3">
            {status === "error" ? (
              <div className="flex flex-col items-center gap-2 rounded-xl bg-muted p-6 text-center text-muted-foreground">
                <CameraOff className="text-muted-foreground/70" />
                <p className="whitespace-pre-line text-sm leading-relaxed">{error}</p>
              </div>
            ) : (
              <>
                <div className="relative overflow-hidden rounded-xl bg-black">
                  {engine === "native" ? (
                    <video ref={videoRef} playsInline muted autoPlay className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div id="bill-qr-region" className="min-h-[240px] w-full [&_video]:w-full" />
                  )}

                  {status === "starting" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
                      <Loader2 className="animate-spin" />
                      <p className="text-sm">Starting camera…</p>
                    </div>
                  )}

                  {status === "scanning" && (
                    <>
                      <div className="pointer-events-none absolute inset-10 rounded-lg border-2 border-white/70" />
                      <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/50 py-1.5 text-center text-xs font-semibold text-white">
                        Hold the QR steady — it captures by itself
                      </p>
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
                    </>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="photo" className="mt-3">
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-storybook-green/40 px-6 py-8 text-center transition-colors hover:border-eager-green/60",
                photoBusy && "pointer-events-none opacity-60",
              )}
            >
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  void handlePhoto(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              {photoBusy ? <Loader2 className="animate-spin text-eager-green" /> : <ImagePlus size={24} className="text-eager-green" />}
              <span className="text-sm font-bold">{photoBusy ? "Looking for the QR…" : "Choose a photo of the bill"}</span>
              <span className="text-xs text-muted-foreground">The QR must be square-on and fully visible</span>
            </label>
            {photoError && (
              <p className="mt-2 rounded-xl border-2 border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive">{photoError}</p>
            )}
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={keepPhoto}
                onChange={(e) => setKeepPhoto(e.target.checked)}
                className="size-4 accent-eager-green"
              />
              Keep the photo with the record (compressed, ~100 KB)
            </label>
          </TabsContent>

          <TabsContent value="paste" className="mt-3 space-y-3">
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder='Paste the QR text — JSON like {"seller_pan":"…"} or a verification link.'
              rows={5}
              className="font-mono text-xs"
              aria-label="Paste QR data"
            />
            <Button onClick={handlePaste} disabled={!pasteText.trim()} className="w-full">
              Use this data
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

async function downscaleToBlob(file: File, maxEdge: number): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file));
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("downscale failed");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("downscale failed");
  return new File([blob], file.name, { type: "image/jpeg" });
}
