"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Building2, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, Users } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";

interface Customer {
  id: string; companyName: string; contactPerson: string | null; email: string | null; phone: string | null;
  billingAddress: string | null; shippingAddress: string | null; gstin: string | null; city: string | null; state: string | null;
  notes: string | null; _count: { proposals: number };
}

type FormState = Record<"companyName" | "contactPerson" | "email" | "phone" | "billingAddress" | "shippingAddress" | "gstin" | "city" | "state" | "notes", string>;
const EMPTY: FormState = { companyName: "", contactPerson: "", email: "", phone: "", billingAddress: "", shippingAddress: "", gstin: "", city: "", state: "", notes: "" };

export function CustomersView({ canManage, canCreateProposal }: { canManage: boolean; canCreateProposal: boolean }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ customers: Customer[] }>(`/api/customers?q=${encodeURIComponent(q)}`);
      setRows(d.customers);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function open(c: Customer | "new") {
    setEditing(c);
    setFormError(null);
    setForm(c === "new" ? EMPTY : Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (c as unknown as Record<string, string | null>)[k] ?? ""])) as FormState);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing === "new") await api("/api/customers", { method: "POST", json: form });
      else if (editing) await api(`/api/customers/${editing.id}`, { method: "PATCH", json: form });
      toast.success(editing === "new" ? "Customer added" : "Customer updated");
      setEditing(null);
      load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Customer) {
    if (!confirm(`Delete ${c.companyName}?`)) return;
    try {
      await api(`/api/customers/${c.id}`, { method: "DELETE" });
      toast.success("Customer deleted");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <PageHeader title="Customer database" description="Customers and system integrators. New customers are also saved automatically from proposals."
        actions={canManage && <Button onClick={() => open("new")}><Plus className="h-4 w-4" /> Add customer</Button>} />

      <div className="relative mb-5 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" className="field h-10 pl-9" />
      </div>

      {error ? <Card className="p-6 text-sm text-rose-600">{error}</Card>
        : rows === null ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
        : rows.length === 0 ? <Card><EmptyState icon={Users} title={q ? "No customers match your search" : "No customers yet"} description="Customers are added automatically when you create a proposal." /></Card>
        : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-white text-brand-600 ring-1 ring-brand-100"><Building2 className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{c.companyName}</div>
                      <div className="truncate text-xs text-ink-muted">{c.contactPerson || "No contact person"}</div>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex opacity-0 transition group-hover:opacity-100">
                      <button onClick={() => open(c)} className="rounded-md p-1.5 text-ink-muted hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                      {c._count.proposals === 0 && <button onClick={() => remove(c)} className="rounded-md p-1.5 text-ink-muted hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-1.5 text-[13px] text-ink-soft">
                  {c.email && <div className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 shrink-0 text-ink-faint" />{c.email}</div>}
                  {c.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0 text-ink-faint" />{c.phone}</div>}
                  {(c.city || c.state) && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" />{[c.city, c.state].filter(Boolean).join(", ")}</div>}
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <Link href={`/proposals?q=${encodeURIComponent(c.companyName)}`} className="font-medium text-brand-600 hover:text-brand-700">{c._count.proposals} proposal{c._count.proposals === 1 ? "" : "s"}</Link>
                  {canCreateProposal && <Link href="/proposals/new" className="text-ink-muted hover:text-ink">New proposal →</Link>}
                </div>
              </motion.div>
            ))}
          </div>
        )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} size="lg" title={editing === "new" ? "Add customer" : "Edit customer"}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="customer-form" loading={saving}>Save</Button></>}>
        <form id="customer-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          {formError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{formError}</div>}
          <Field label="Company name" required className="sm:col-span-2"><Input value={form.companyName} onChange={set("companyName")} autoFocus /></Field>
          <Field label="Contact person"><Input value={form.contactPerson} onChange={set("contactPerson")} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={set("email")} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={set("phone")} /></Field>
          <Field label="GSTIN"><Input value={form.gstin} onChange={set("gstin")} maxLength={15} className="uppercase" /></Field>
          <Field label="City"><Input value={form.city} onChange={set("city")} /></Field>
          <Field label="State"><Input value={form.state} onChange={set("state")} /></Field>
          <Field label="Billing address"><Textarea rows={3} value={form.billingAddress} onChange={set("billingAddress")} /></Field>
          <Field label="Shipping / installation address"><Textarea rows={3} value={form.shippingAddress} onChange={set("shippingAddress")} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Field>
        </form>
      </Modal>
    </div>
  );
}
