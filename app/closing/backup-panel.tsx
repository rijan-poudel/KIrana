"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Database, Download, Loader2, Save, X } from "lucide-react";
import type { BackupInfo } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/format";
import { saveBackup } from "@/actions/shop-actions";

export default function BackupPanelClient({ backups }: { backups: BackupInfo[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    setError(null);
    const response = await saveBackup();
    setSaving(false);
    if (response.ok) {
      setMessage(`Backup saved: backups/${response.data.filename} (${formatBytes(response.data.sizeBytes)})`);
      router.refresh();
    } else {
      setError(response.error);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary h-12">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? "Backing up…" : "Save Backup to backups/ Folder"}
        </button>
        <a href="/api/backup" className="btn-secondary h-12">
          <Download size={18} /> Download Database Backup
        </a>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        The download button also drops a timestamped copy into <code className="font-mono">backups/</code> before the file
        reaches your browser.
      </p>

      {message && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <span className="flex items-start gap-2">
            <Database size={16} className="mt-0.5 shrink-0" />
            {message}
          </span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss" className="shrink-0">
            <X size={16} />
          </button>
        </div>
      )}
      {error && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <span className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {error}
          </span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 font-semibold">Backup file</th>
              <th className="px-4 py-2.5 font-semibold">Created</th>
              <th className="px-4 py-2.5 text-right font-semibold">Size</th>
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                  No backups yet — save your first one tonight.
                </td>
              </tr>
            ) : (
              backups.map((backup) => (
                <tr key={backup.filename} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{backup.filename}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{formatDateTime(backup.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-600">{formatBytes(backup.sizeBytes)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
