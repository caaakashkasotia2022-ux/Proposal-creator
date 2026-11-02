"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Copy, Download, FilePlus2, FileSpreadsheet, FileText, Pencil, Search } from "lucide-react";
import { api } from "@/lib/client";
import { formatINR } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";
import { PROPOSAL_STATUSES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, STATUS_META, Skeleton, StatusBadge } from "@/components/ui/misc";

interface Row {
  id: string; number: string; type: string; status: string; customerName: string; projectName: string | null;
  grandTotal: number; proposalDate: string; validUntil: string; preparedByName: string; preparedById: string; createdAt: string;
}

export function ProposalsList({ initialStatus, initialQuery, canCreate, isViewer, currentUserId, isAdmin }: {
  initialStatus: string; initialQuery: string; canCreate: boolean; isViewer: boolean; currentUserId: string; isAdmin: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, status });
        const d = await api<{ proposals: Row[] }>(`/api/proposals?${params}`);
        if (alive) { setRows(d.proposals); setError(null); }
        const url = new URL(window.location.href);
        url.search = new URLSearchParams(Object.entries({ q, status }).filter(([, v]) => v)).toString();
        window.history.replaceState(null, "", url);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q, status]);

  async function duplicate(id: string) {
    setBusy(id);
    try {
      const r = await api<{ id: string; number: string }>(`/api/proposals/${id}/duplicate`, { method: "POST" });
      toast.success(`Duplicated as ${r.number}`);
      router.push(`/proposals/${r.id}/edit`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  const total = useMemo(() => (rows ?? []).reduce((a, r) => a + r.grandTotal, 0), [rows]);
  const canDownload = (r: Row) => !isViewer || r.status === "APPROVED";
  const canEdit = (r: Row) => r.status === "DRAFT" && (isAdmin || r.preparedById === currentUserId);

  return (
    <div>
      <PageHeader title="Proposal history" description={isAdmin ? "All proposals across the team." : isViewer ? "Sent and approved proposals." : "Proposals you have prepared."}
        actions={canCreate && <Link href="/proposals/new"><Button><FilePlus2 className="h-4 w-4" /> Create proposal</Button></Link>} />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by proposal number, customer or project…" className="field h-9 pl-9" />
          </div>
          <div className="scroll-thin flex gap-1 overflow-x-auto">
            {["", ...PROPOSAL_STATUSES].map((s) => (
              <button key={s || "all"} onClick={() => setStatus(s)}
                className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition", status === s ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-slate-100")}>
                {s ? STATUS_META[s].label : "All"}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="p-6 text-sm text-rose-600">{error}</div>
        ) : rows === null ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={FileText} title={q || status ? "No proposals match your filters" : "No proposals yet"}
            description={q || status ? "Try a different search term or status." : "Proposals you create will appear here."}
            action={canCreate && !q && !status ? <Link href="/proposals/new"><Button>Create proposal</Button></Link> : undefined} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11.5px] font-semibold uppercase tracking-wider text-ink-muted">
                    <th className="px-4 py-2.5">Proposal</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Created</th>
                    <th className="px-4 py-2.5">Valid until</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Grand total</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {rows.map((r, i) => (
                      <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.015, 0.2) }}
                        className="group cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/70" onClick={() => router.push(`/proposals/${r.id}`)}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">{r.number}</div>
                          <div className="text-xs text-ink-muted">{r.type === "SI" ? "SI proposal" : "Customer"} · {r.preparedByName}</div>
                        </td>
                        <td className="max-w-[260px] px-4 py-3">
                          <div className="truncate font-medium">{r.customerName}</div>
                          <div className="truncate text-xs text-ink-muted">{r.projectName || "—"}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{formatDate(r.createdAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{formatDate(r.validUntil)}</td>
                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular">{formatINR(r.grandTotal)}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-0.5 opacity-70 transition group-hover:opacity-100">
                            {canEdit(r) && <Link href={`/proposals/${r.id}/edit`} title="Edit draft" className="rounded-md p-1.5 text-ink-muted hover:bg-slate-100 hover:text-ink"><Pencil className="h-4 w-4" /></Link>}
                            {canDownload(r) && <>
                              <a href={`/api/proposals/${r.id}/pdf`} title="Download PDF" className="rounded-md p-1.5 text-ink-muted hover:bg-slate-100 hover:text-ink"><Download className="h-4 w-4" /></a>
                              <a href={`/api/proposals/${r.id}/excel`} title="Download Excel" className="rounded-md p-1.5 text-ink-muted hover:bg-slate-100 hover:text-ink"><FileSpreadsheet className="h-4 w-4" /></a>
                            </>}
                            {canCreate && <button title="Duplicate" disabled={busy === r.id} onClick={() => duplicate(r.id)} className="rounded-md p-1.5 text-ink-muted hover:bg-slate-100 hover:text-ink"><Copy className="h-4 w-4" /></button>}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            <div className="flex justify-between border-t border-slate-100 px-4 py-3 text-xs text-ink-muted">
              <span>{rows.length} proposal{rows.length === 1 ? "" : "s"}</span>
              <span>Total value <b className="text-ink tabular">{formatINR(total)}</b></span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
