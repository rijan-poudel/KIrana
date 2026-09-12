"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveBackup } from "@/actions/shop-actions";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { BackupInfo } from "@/lib/types";

export default function BackupPanel({ backups }: { backups: BackupInfo[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    const response = await saveBackup();
    setSaving(false);
    if (response.ok) {
      toast.success(`Backup saved: ${response.data.filename} (${formatBytes(response.data.sizeBytes)})`);
      router.refresh();
    } else {
      toast.error(response.error);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}
          {saving ? "Saving…" : "Save backup to backups/ folder"}
        </Button>
        <Button variant="outline" render={<a href="/api/backup" />}>
          <Download /> Download database backup
        </Button>
      </div>

      {backups.length > 0 && (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs tracking-wide text-muted-foreground uppercase">
              <th className="py-2 font-semibold">File</th>
              <th className="py-2 font-semibold">Created</th>
              <th className="py-2 text-right font-semibold">Size</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.filename} className="border-b border-border/40 last:border-0">
                <td className="py-2 font-mono text-xs">{b.filename}</td>
                <td className="py-2 text-muted-foreground">{formatDateTime(b.createdAt)}</td>
                <td className="py-2 text-right text-muted-foreground">{formatBytes(b.sizeBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
