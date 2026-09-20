import fs from "fs";
import path from "path";

/**
 * Disk storage for optional bill photos.
 *
 * Records live in SQLite (a QR record is ~300 bytes — a decade of daily bills
 * is a few megabytes); photos are the only part that eats space, so they live
 * outside the database in `data/bill-photos/`, already compressed on the
 * client, and can be pruned in bulk without touching the records.
 */

export const BILL_PHOTOS_DIR = path.join(process.cwd(), "data", "bill-photos");

const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024; // 1.5 MB after client-side compression

export function ensureBillPhotosDir(): void {
  if (!fs.existsSync(BILL_PHOTOS_DIR)) {
    fs.mkdirSync(BILL_PHOTOS_DIR, { recursive: true });
  }
}

/** Save a compressed data URL (`data:image/webp;base64,…`) as `<billId>.<ext>`. */
export function saveBillPhoto(billId: string, dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/(webp|jpeg|png);base64,(.+)$/);
  if (!match) throw new Error("The photo is not in a supported format (WebP/JPEG/PNG).");
  const [, ext, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) throw new Error("The photo is empty.");
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new Error("The photo is too large even after compression — retake it closer to the bill.");
  }
  ensureBillPhotosDir();
  // The filename derives only from the cuid bill id — never a path traversal.
  const filename = `${billId}.${ext}`;
  fs.writeFileSync(path.join(BILL_PHOTOS_DIR, filename), bytes);
  return filename;
}

export function readBillPhoto(filename: string): { bytes: Buffer; contentType: string } | null {
  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : null;
  if (!contentType) return null;
  const full = path.join(BILL_PHOTOS_DIR, path.basename(filename));
  if (!full.startsWith(BILL_PHOTOS_DIR + path.sep) && full !== BILL_PHOTOS_DIR) return null;
  if (!fs.existsSync(full)) return null;
  return { bytes: fs.readFileSync(full), contentType };
}

export function deleteBillPhoto(filename: string | null | undefined): void {
  if (!filename) return;
  try {
    fs.unlinkSync(path.join(BILL_PHOTOS_DIR, path.basename(filename)));
  } catch {
    // An already-gone photo is fine.
  }
}

export function billPhotoStats(): { count: number; bytes: number } {
  if (!fs.existsSync(BILL_PHOTOS_DIR)) return { count: 0, bytes: 0 };
  let count = 0;
  let bytes = 0;
  for (const file of fs.readdirSync(BILL_PHOTOS_DIR)) {
    try {
      bytes += fs.statSync(path.join(BILL_PHOTOS_DIR, file)).size;
      count += 1;
    } catch {
      // A file that vanished mid-listing is harmless.
    }
  }
  return { count, bytes };
}
