import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { BACKUPS_DIR, createBackupFile } from "@/lib/backup";
import { errorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/backup
 * Creates a fresh timestamped copy of the SQLite database in backups/, then
 * streams that copy to the browser as a download. Works fully offline.
 */
export async function GET() {
  try {
    const backup = await createBackupFile();
    const buffer = fs.readFileSync(path.join(BACKUPS_DIR, backup.filename));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${backup.filename}"`,
        "Content-Length": String(backup.sizeBytes),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: `Backup failed: ${errorMessage(error)}` }, { status: 500 });
  }
}
