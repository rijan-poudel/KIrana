/**
 * Client-side bill-photo compression. A phone photo of a receipt is 2–6 MB;
 * a 1200px WebP is ~100 KB. Compression happens before anything is sent to the
 * server so the shop's disk stays small, and JPEG is the fallback for browsers
 * that cannot encode WebP.
 */

export type CompressedPhoto = { dataUrl: string; bytes: number; ext: "webp" | "jpeg" | "png" };

const MAX_EDGE = 1200;
const MAX_BYTES = 1.4 * 1024 * 1024; // a bit under the server's 1.5 MB cap

async function loadSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // `from-image` bakes phone-photo EXIF rotation into the pixels.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older Safari: fall back to an <img> decode.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("The photo could not be read."));
        img.src = url;
      });
      return img;
    } finally {
      // The image has already decoded into memory by onload.
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }
}

function drawToDataUrl(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
  mime: "image/webp" | "image/jpeg",
  quality: number,
): Promise<{ dataUrl: string; ext: "webp" | "jpeg" } | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== mime) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: String(reader.result), ext: mime === "image/webp" ? "webp" : "jpeg" });
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      },
      mime,
      quality,
    );
  });
}

export async function compressBillPhoto(file: File): Promise<CompressedPhoto> {
  const source = await loadSource(file);
  const full = "width" in source ? { w: source.width, h: source.height } : { w: (source as HTMLImageElement).naturalWidth, h: (source as HTMLImageElement).naturalHeight };
  const scale = Math.min(1, MAX_EDGE / Math.max(full.w, full.h));
  const width = Math.max(1, Math.round(full.w * scale));
  const height = Math.max(1, Math.round(full.h * scale));

  for (const quality of [0.72, 0.55, 0.4]) {
    for (const mime of ["image/webp", "image/jpeg"] as const) {
      const result = await drawToDataUrl(source, width, height, mime, quality);
      if (result && result.dataUrl.length * 0.75 <= MAX_BYTES) {
        return { ...result, bytes: Math.round(result.dataUrl.length * 0.75) };
      }
    }
  }
  throw new Error("The photo is too large even after compression — retake it closer to the bill.");
}
