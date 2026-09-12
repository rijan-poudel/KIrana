export default function StatusBadge({ status }: { status: string }) {
  if (status === "PAID") return <span className="badge-emerald">PAID</span>;
  if (status === "UDHARO") return <span className="badge-red">UDHARO</span>;
  if (status === "PARTIAL") return <span className="badge-amber">PARTIAL</span>;
  return <span className="badge-slate">{status}</span>;
}
