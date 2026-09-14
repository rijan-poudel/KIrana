import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import type { BackupInfo } from "@/lib/types";

/**
 * Offline database backup utilities.
 *
 * Backups are produced with SQLite's `VACUUM INTO`, which writes a complete,
 * transactionally-consistent copy of the live database even while the shop is
 * mid-bill. Files land in the `backups/` folder at the project root.
 */

export const BACKUPS_DIR = path.join(process.cwd(), "backups");

export async function createBackupFile(): Promise<BackupInfo> {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`;

  let filename = `milan-grocery-backup-${stamp}.db`;
  let filepath = path.join(BACKUPS_DIR, filename);
  let counter = 1;
  while (fs.existsSync(filepath)) {
    filename = `milan-grocery-backup-${stamp}-${counter}.db`;
    filepath = path.join(BACKUPS_DIR, filename);
    counter += 1;
  }

  // Escape single quotes for the raw SQL literal; VACUUM INTO fails if the
  // target file already exists, which the uniqueness loop above prevents.
  const sqlPath = filepath.split(path.sep).join("/").replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${sqlPath}'`);

  const sizeBytes = fs.statSync(filepath).size;
  return { filename, sizeBytes, createdAt: now.toISOString() };
}

export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((file) => file.endsWith(".db"))
    .map((file) => {
      const full = path.join(BACKUPS_DIR, file);
      const stats = fs.statSync(full);
      return { filename: file, sizeBytes: stats.size, createdAt: stats.mtime.toISOString() };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Take an automatic snapshot at most once every 20 hours; keep the newest 30. */
const AUTO_BACKUP_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;
const AUTO_BACKUP_KEEP = 30;

/**
 * Runs when the Reports page is opened (the shop's nightly closing stop): if
 * the newest backup is stale, quietly snapshot the database. Best-effort — a
 * failure never blocks the page, the manual button still works.
 */
export async function autoBackupIfNeeded(): Promise<BackupInfo | null> {
  try {
    const newest = listBackups()[0];
    const fresh = newest && Date.now() - new Date(newest.createdAt).getTime() < AUTO_BACKUP_MIN_INTERVAL_MS;
    if (fresh) return null;
    const created = await createBackupFile();
    for (const old of listBackups().slice(AUTO_BACKUP_KEEP)) {
      try {
        fs.unlinkSync(path.join(BACKUPS_DIR, old.filename));
      } catch {
        // An undeletable old backup is harmless — keep going.
      }
    }
    return created;
  } catch {
    return null;
  }
}
