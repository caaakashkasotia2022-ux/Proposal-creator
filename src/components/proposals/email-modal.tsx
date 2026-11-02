"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, MailWarning, Send } from "lucide-react";
import type { ProposalDTO } from "@/lib/proposals";
import type { CompanySettings, EmailSettings } from "@/lib/settings";
import { api } from "@/lib/client";
import { formatINR } from "@/lib/money";
import { fillTemplate, formatDate } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Toggle } from "@/components/ui/field";

export function EmailModal({ open, onClose, proposal: p, company, templates, configured, onSent }: {
  open: boolean; onClose: () => void; proposal: ProposalDTO; company: CompanySettings; templates: EmailSettings;
  configured: boolean; onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [attachExcel, setAttachExcel] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const vars = {
      number: p.number, projectName: p.projectName || "your project", customerName: p.customerName,
      contactPerson: p.contactPerson || "Sir/Madam", grandTotal: formatINR(p.grandTotal), validUntil: formatDate(p.validUntil),
      preparedBy: p.preparedByName, companyName: company.name,
    };
    setTo(p.customerEmail ?? "");
    setCc("");
    setSubject(fillTemplate(templates.subjectTemplate, vars));
    setMessage(fillTemplate(templates.bodyTemplate, vars));
    setAttachPdf(true);
    setAttachExcel(false);
    setSentTo(null);
    setError(null);
  }, [open, p, company, templates]);

  async function send() {
    setError(null);
    if (!to.trim()) return setError("Enter at least one recipient.");
    setSending(true);
    try {
      const r = await api<{ sentTo: string[] }>(`/api/proposals/${p.id}/email`, { method: "POST", json: { to, cc, subject, message, attachPdf, attachExcel } });
      setSentTo(r.sentTo);
      toast.success("Proposal sent", { description: `Delivered to ${r.sentTo.join(", ")}` });
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (!configured) {
    return (
      <Modal open={open} onClose={onClose} title="Email is not set up yet" description="An admin needs to connect an email account before proposals can be sent from the app."
        footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <MailWarning className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Meanwhile, download the proposal and attach it in Outlook / Gmail.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`/api/proposals/${p.id}/pdf`}><Button size="sm" variant="secondary"><Download className="h-3.5 w-3.5" /> PDF</Button></a>
              <a href={`/api/proposals/${p.id}/excel`}><Button size="sm" variant="secondary"><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</Button></a>
            </div>
          </div>
        </div>
        <div className="mt-4 text-sm text-ink-soft">
          <p className="font-medium text-ink">Admin setup (5 minutes)</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Create an SMTP credential (Google Workspace app password, Microsoft 365 SMTP AUTH, or a provider such as Amazon SES / SendGrid).</li>
            <li>Set <code className="rounded bg-slate-100 px-1">SMTP_HOST</code>, <code className="rounded bg-slate-100 px-1">SMTP_PORT</code>, <code className="rounded bg-slate-100 px-1">SMTP_USER</code>, <code className="rounded bg-slate-100 px-1">SMTP_PASS</code> and <code className="rounded bg-slate-100 px-1">EMAIL_FROM</code> in the server environment.</li>
            <li>Restart the app. Full guide: <code className="rounded bg-slate-100 px-1">docs/EMAIL_SETUP.md</code>.</li>
          </ol>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={sentTo ? "Proposal sent" : "Send proposal via email"}
      description={sentTo ? undefined : `${p.number} · ${p.customerName}`}
      footer={sentTo ? <Button onClick={onClose}>Done</Button> : <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={send} loading={sending}><Send className="h-4 w-4" /> Send proposal</Button>
      </>}>
      {sentTo ? (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-8 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.1 }}
            className="grid h-14 w-14 place-items-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </motion.div>
          <h3 className="mt-4 text-base font-semibold">Email delivered to the mail server</h3>
          <p className="mt-1 text-sm text-ink-muted">Sent to {sentTo.join(", ")}. The proposal status is now <b>Sent</b> and the delivery is logged.</p>
        </motion.div>
      ) : (
        <div className="grid gap-4">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <Field label="To" required hint="Separate multiple addresses with commas."><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" /></Field>
          <Field label="Cc"><Input value={cc} onChange={(e) => setCc(e.target.value)} /></Field>
          <Field label="Subject" required><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
          <Field label="Message" required><Textarea rows={10} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
          <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
            <Toggle checked={attachPdf} onChange={setAttachPdf} label="Attach PDF proposal" description="Recommended" />
            <Toggle checked={attachExcel} onChange={setAttachExcel} label="Attach Excel quotation" description="Optional" />
          </div>
        </div>
      )}
    </Modal>
  );
}
