"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Copy, Download, FileSpreadsheet, History, Mail, MoreHorizontal, Pencil, PartyPopper, Tag, Trash2,
} from "lucide-react";
import type { ProposalDTO } from "@/lib/proposals";
import type { CompanySettings, EmailSettings } from "@/lib/settings";
import { PROPOSAL_STATUSES } from "@/lib/permissions";
import { api } from "@/lib/client";
import { formatINR } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, STATUS_META, StatusBadge } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/field";
import { ProposalDocument } from "./proposal-document";
import { EmailModal } from "./email-modal";

interface Props {
  proposal: ProposalDTO;
  company: CompanySettings;
  emailTemplates: EmailSettings;
  emailConfigured: boolean;
  perms: { edit: boolean; manage: boolean; download: boolean; duplicate: boolean };
}

export function ProposalDetail({ proposal: p, company, emailTemplates, emailConfigured, perms }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [emailOpen, setEmailOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [generated] = useState(() => search.get("generated") === "1");

  useEffect(() => {
    if (generated) window.history.replaceState(null, "", `/proposals/${p.id}`);
  }, [generated, p.id]);

  async function duplicate() {
    setBusy("dup");
    try {
      const r = await api<{ id: string; number: string }>(`/api/proposals/${p.id}/duplicate`, { method: "POST" });
      toast.success(`Duplicated as ${r.number}`, { description: "Opened as a new draft." });
      router.push(`/proposals/${r.id}/edit`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  async function changeStatus() {
    if (!statusOpen) return;
    setBusy("status");
    try {
      await api(`/api/proposals/${p.id}/status`, { method: "POST", json: { status: statusOpen, note: statusNote } });
      toast.success(`Status changed to ${STATUS_META[statusOpen].label}`);
      setStatusOpen(null);
      setStatusNote("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`Delete draft ${p.number}? This cannot be undone.`)) return;
    setBusy("delete");
    try {
      await api(`/api/proposals/${p.id}`, { method: "DELETE" });
      toast.success("Draft deleted");
      router.push("/proposals");
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  const doc = {
    ...p,
    items: p.items.map((i) => ({ ...i, key: i.id })),
  };

  return (
    <div>
      <Link href="/proposals" className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Proposal history
      </Link>

      {generated && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 text-sm text-emerald-900">
          <PartyPopper className="h-5 w-5 text-emerald-600" />
          <span><b>Proposal generated.</b> Download it as PDF / Excel or send it straight to the customer.</span>
        </motion.div>
      )}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[22px] font-semibold tracking-tight">{p.customerName}</h1>
            <StatusBadge status={p.status} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {p.number} · {p.projectName || "No project name"} · {p.type === "SI" ? "SI proposal" : "Customer proposal"} · Created {formatDate(p.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {perms.download && <>
            <a href={`/api/proposals/${p.id}/pdf`}><Button variant="secondary"><Download className="h-4 w-4" /> PDF</Button></a>
            <a href={`/api/proposals/${p.id}/excel`}><Button variant="secondary"><FileSpreadsheet className="h-4 w-4" /> Excel</Button></a>
          </>}
          {perms.manage && <Button onClick={() => setEmailOpen(true)}><Mail className="h-4 w-4" /> {p.emails.some((e) => e.status === "SENT") ? "Resend" : "Send via email"}</Button>}
          {(perms.edit || perms.duplicate || perms.manage) && (
            <div className="relative">
              <Button variant="secondary" size="icon" onClick={() => setMenuOpen((o) => !o)} aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lift">
                    {perms.edit && <Link href={`/proposals/${p.id}/edit`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"><Pencil className="h-4 w-4 text-ink-muted" /> Edit draft</Link>}
                    {perms.duplicate && <button onClick={duplicate} disabled={busy === "dup"} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"><Copy className="h-4 w-4 text-ink-muted" /> Duplicate / revise</button>}
                    {perms.manage && <>
                      <div className="my-1 border-t border-slate-100" />
                      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Change status</div>
                      {PROPOSAL_STATUSES.filter((s) => s !== p.status).map((s) => {
                        const Icon = STATUS_META[s].icon;
                        return <button key={s} onClick={() => { setStatusOpen(s); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"><Icon className="h-4 w-4 text-ink-muted" /> Mark as {STATUS_META[s].label}</button>;
                      })}
                    </>}
                    {perms.edit && <>
                      <div className="my-1 border-t border-slate-100" />
                      <button onClick={remove} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /> Delete draft</button>
                    </>}
                  </motion.div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {!perms.download && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink-muted">Downloads are available to viewers once the proposal is approved.</div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 rounded-2xl bg-slate-100/80 p-3 sm:p-6">
          <ProposalDocument p={doc} company={company} />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="text-xs text-ink-muted">Grand total</div>
            <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular">{formatINR(p.grandTotal)}</div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-muted">Valid until</dt><dd>{formatDate(p.validUntil)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Prepared by</dt><dd className="truncate pl-4">{p.preparedByName}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">Last updated</dt><dd>{formatDateTime(p.updatedAt)}</dd></div>
              {p.sentAt && <div className="flex justify-between"><dt className="text-ink-muted">First sent</dt><dd>{formatDateTime(p.sentAt)}</dd></div>}
            </dl>
            {p.notes && <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><b>Internal note:</b> {p.notes}</div>}
          </Card>

          <Card>
            <CardHeader title="Activity" icon={History} />
            <ol className="relative space-y-4 px-5 py-4">
              {[...p.statusHistory.map((h) => ({ id: h.id, at: h.at, title: h.fromStatus && h.fromStatus !== h.toStatus ? `${STATUS_META[h.fromStatus]?.label ?? h.fromStatus} → ${STATUS_META[h.toStatus]?.label ?? h.toStatus}` : STATUS_META[h.toStatus]?.label ?? h.toStatus, sub: h.note, by: h.by })),
                ...p.emails.map((e) => ({ id: e.id, at: e.at, title: e.status === "SENT" ? `Emailed to ${e.to}` : `Email failed (${e.to})`, sub: e.status === "SENT" ? e.attachments : e.error, by: e.by })),
              ].sort((a, b) => b.at.localeCompare(a.at)).map((ev) => (
                <li key={ev.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400 ring-4 ring-brand-50" />
                  <div className="min-w-0 text-sm">
                    <div className="font-medium">{ev.title}</div>
                    {ev.sub && <div className="break-words text-xs text-ink-muted">{ev.sub}</div>}
                    <div className="text-xs text-ink-faint">{ev.by} · {formatDateTime(ev.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {p.priceOverrides.length > 0 && (
            <Card>
              <CardHeader title="Price overrides" description="Proposal-specific rates (master prices unchanged)" icon={Tag} />
              <ul className="divide-y divide-slate-100">
                {p.priceOverrides.map((o) => (
                  <li key={o.id} className="px-5 py-3 text-sm">
                    <div className="font-medium">{o.itemName}</div>
                    <div className="text-xs text-ink-muted tabular">
                      Master {o.masterPrice !== null ? formatINR(o.masterPrice) : "—"} → <b className="text-amber-700">{formatINR(o.overridePrice)}</b>
                    </div>
                    {o.reason && <div className="text-xs text-ink-soft">“{o.reason}”</div>}
                    <div className="text-xs text-ink-faint">{o.by} · {formatDateTime(o.at)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <EmailModal open={emailOpen} onClose={() => setEmailOpen(false)} proposal={p} company={company} templates={emailTemplates}
        configured={emailConfigured} onSent={() => router.refresh()} />

      <Modal open={Boolean(statusOpen)} onClose={() => setStatusOpen(null)} size="sm"
        title={statusOpen ? `Mark as ${STATUS_META[statusOpen].label}?` : ""} description={`${p.number} · ${p.customerName}`}
        footer={<><Button variant="secondary" onClick={() => setStatusOpen(null)}>Cancel</Button><Button onClick={changeStatus} loading={busy === "status"}>Confirm</Button></>}>
        <Field label="Note (optional)"><Textarea rows={3} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="e.g. PO received / lost on price" /></Field>
      </Modal>
    </div>
  );
}
