"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Building2, Check, ChevronDown, Eye, FileCheck2, Lock, Package,
  Percent, RotateCcw, Save, Sparkles, Trash2, Users,
} from "lucide-react";
import type { ProductDTO } from "@/lib/products";
import type { ProposalDTO } from "@/lib/proposals";
import type { AppSettings } from "@/lib/settings";
import { can, type SessionUser } from "@/lib/permissions";
import { calculate, type DiscountType, type SupplyType } from "@/lib/calc";
import { api } from "@/lib/client";
import { formatINR } from "@/lib/money";
import { addDays, cn, fillTemplate, formatDate, toDateInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { ProductSearch } from "@/components/products/product-search";
import { ProductFormModal } from "@/components/products/product-form-modal";
import { ProposalDocument, type DocProposal } from "./proposal-document";

// ── Types ───────────────────────────────────────────────────
interface EditorItem {
  key: string;
  id: string | null;
  productId: string | null;
  itemCode: string;
  itemName: string;
  category: string;
  description: string;
  configuration: string;
  unit: string;
  hsnSac: string;
  quantity: string;
  unitPrice: string;
  masterPrice: number | null;
  currentMasterPrice: number | null;
  gstRate: number;
  overrideReason: string;
  expanded: boolean;
}

interface CustomerState {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  billingAddress: string;
  shippingAddress: string;
  gstin: string;
}

interface Props {
  mode: "create" | "edit";
  user: SessionUser;
  settings: AppSettings;
  initial?: ProposalDTO;
  currentMasterPrices?: Record<string, number>;
}

const STEPS = [
  { key: "customer", label: "Customer", icon: Building2 },
  { key: "items", label: "Products", icon: Package },
  { key: "commercials", label: "Commercials & Terms", icon: Percent },
  { key: "preview", label: "Preview", icon: Eye },
];

const CONFIG_CHIPS = ["Doors: ", "Readers: ", "Controllers: ", "Cameras: ", "Software modules: ", "Licence duration: ", "Integration: "];

let keySeq = 0;
const newKey = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;
const numOr = (s: string, d = 0) => (s.trim() === "" || !Number.isFinite(Number(s)) ? d : Number(s));

// ── Customer autocomplete ───────────────────────────────────
type CustomerHit = { id: string; companyName: string; contactPerson: string | null; email: string | null; phone: string | null; billingAddress: string | null; shippingAddress: string | null; gstin: string | null; state: string | null };

function CustomerPicker({ value, onChange, onPick, linked }: { value: string; onChange: (v: string) => void; onPick: (c: CustomerHit) => void; linked: boolean }) {
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || value.trim().length < 1) { setHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await api<{ customers: CustomerHit[] }>(`/api/customers?q=${encodeURIComponent(value.trim())}`);
        setHits(d.customers.slice(0, 8));
      } catch { /* non-blocking */ }
    }, 180);
    return () => clearTimeout(t);
  }, [value, open]);

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Input value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder="Start typing to search existing customers…" autoComplete="off" />
      {linked && <span className="absolute right-2 top-1/2 -translate-y-1/2"><Badge tone="emerald"><Check className="h-3 w-3" />Saved customer</Badge></span>}
      <AnimatePresence>
        {open && hits.length > 0 && (
          <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lift">
            {hits.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { onPick(c); setOpen(false); }} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-brand-50/60">
                  <Users className="h-4 w-4 text-ink-faint" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.companyName}</span>
                    <span className="block truncate text-xs text-ink-muted">{[c.contactPerson, c.email].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────
export function ProposalEditor({ mode, user, settings, initial, currentMasterPrices = {} }: Props) {
  const router = useRouter();
  const ps = settings.proposal;
  const canOverride = can.overridePrice(user);
  const canAdd = can.addProducts(user);

  const [step, setStep] = useState(0);
  const [proposalId, setProposalId] = useState<string | null>(initial?.id ?? null);
  const [customerId, setCustomerId] = useState<string | null>(initial?.customerId ?? null);
  const [customer, setCustomer] = useState<CustomerState>({
    companyName: initial?.customerName ?? "", contactPerson: initial?.contactPerson ?? "", email: initial?.customerEmail ?? "",
    phone: initial?.customerPhone ?? "", billingAddress: initial?.billingAddress ?? "", shippingAddress: initial?.shippingAddress ?? "",
    gstin: initial?.customerGstin ?? "",
  });
  const [type, setType] = useState<"CUSTOMER" | "SI">(initial?.type ?? "CUSTOMER");
  const [proposalDate, setProposalDate] = useState(initial ? toDateInput(initial.proposalDate) : toDateInput());
  const [validityDays, setValidityDays] = useState(String(initial?.validityDays ?? ps.defaultValidityDays));
  const [projectName, setProjectName] = useState(initial?.projectName ?? "");
  const [items, setItems] = useState<EditorItem[]>(() =>
    (initial?.items ?? []).map((i) => ({
      key: newKey(), id: i.id, productId: i.productId, itemCode: i.itemCode ?? "", itemName: i.itemName, category: i.category ?? "",
      description: i.description, configuration: i.configuration, unit: i.unit, hsnSac: i.hsnSac ?? "", quantity: String(i.quantity),
      unitPrice: String(i.unitPrice), masterPrice: i.masterPrice, currentMasterPrice: i.productId ? currentMasterPrices[i.productId] ?? null : null,
      gstRate: i.gstRate, overrideReason: "", expanded: false,
    })),
  );
  const [discountType, setDiscountType] = useState<DiscountType>(initial?.discountType ?? "PERCENT");
  const [discountValue, setDiscountValue] = useState(String(initial?.discountValue ?? 0));
  const [supplyType, setSupplyType] = useState<SupplyType>(initial?.supplyType ?? ps.defaultSupplyType);
  const [placeOfSupply, setPlaceOfSupply] = useState(initial?.placeOfSupply ?? "");
  const [introAuto, setIntroAuto] = useState(!initial);
  const [introduction, setIntroduction] = useState(initial?.introduction ?? "");
  const [terms, setTerms] = useState(initial?.termsAndConditions ?? ps.termsAndConditions);
  const [paymentTerms, setPaymentTerms] = useState(initial?.paymentTerms ?? ps.paymentTerms);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState<null | "draft" | "generate">(null);
  const [dirty, setDirty] = useState(false);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const touch = useCallback(() => setDirty(true), []);

  // Auto-filled introduction until the user edits it
  const autoIntro = useMemo(
    () => fillTemplate(type === "SI" ? ps.siIntroduction : ps.customerIntroduction, {
      customerName: customer.companyName || "[Customer]", contactPerson: customer.contactPerson || "Sir/Madam", projectName: projectName || "your project",
    }),
    [type, customer.companyName, customer.contactPerson, projectName, ps],
  );
  const intro = introAuto ? autoIntro : introduction;

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const calc = useMemo(() => calculate({
    items: items.map((i) => ({ quantity: numOr(i.quantity), unitPrice: numOr(i.unitPrice), gstRate: i.gstRate })),
    discountType, discountValue: numOr(discountValue), supplyType,
  }), [items, discountType, discountValue, supplyType]);

  const validUntil = addDays(new Date(`${proposalDate}T00:00:00`), Math.max(1, numOr(validityDays, 30)));
  const selectedIds = useMemo(() => new Set(items.map((i) => i.productId).filter(Boolean) as string[]), [items]);

  // ── Item helpers ──
  const updateItem = (key: string, patch: Partial<EditorItem>) => {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    touch();
  };

  function addProduct(p: ProductDTO, opts: { savedToMaster: boolean } = { savedToMaster: true }) {
    const existing = p.id ? items.find((i) => i.productId === p.id) : undefined;
    if (existing) {
      updateItem(existing.key, { quantity: String(numOr(existing.quantity) + 1) });
      toast.info(`${p.itemName} is already in the proposal – quantity increased to ${numOr(existing.quantity) + 1}.`);
      return;
    }
    setItems((list) => [...list, {
      key: newKey(), id: null, productId: opts.savedToMaster && p.id ? p.id : null, itemCode: p.itemCode, itemName: p.itemName,
      category: p.category, description: p.description, configuration: p.configuration, unit: p.unit, hsnSac: p.hsnSac ?? "",
      quantity: "1", unitPrice: String(p.sellingPrice), masterPrice: opts.savedToMaster && p.id ? p.sellingPrice : null,
      currentMasterPrice: null, gstRate: p.gstRate, overrideReason: "", expanded: false,
    }]);
    setErrors((e) => ({ ...e, items: "" }));
    touch();
  }

  function moveItem(idx: number, dir: -1 | 1) {
    setItems((list) => {
      const next = [...list];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return list;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    touch();
  }

  // ── Validation per step ──
  function validate(upTo: number): boolean {
    const e: Record<string, string> = {};
    if (upTo >= 0) {
      if (customer.companyName.trim().length < 2) e.companyName = "Customer / company name is required.";
      if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) e.email = "Enter a valid email address.";
      if (!proposalDate) e.proposalDate = "Proposal date is required.";
      const vd = Number(validityDays);
      if (!Number.isInteger(vd) || vd < 1 || vd > 365) e.validityDays = "Validity must be 1–365 days.";
    }
    if (upTo >= 1) {
      if (items.length === 0) e.items = "Add at least one product to the proposal.";
      items.forEach((i) => {
        if (!(numOr(i.quantity, -1) > 0)) e[`qty-${i.key}`] = "Qty > 0";
        if (!(numOr(i.unitPrice, -1) >= 0) || i.unitPrice.trim() === "") e[`price-${i.key}`] = "Invalid rate";
      });
    }
    if (upTo >= 2) {
      const dv = numOr(discountValue, -1);
      if (dv < 0) e.discount = "Discount cannot be negative.";
      if (discountType === "PERCENT" && dv > 100) e.discount = "Discount % cannot exceed 100.";
    }
    setErrors(e);
    const firstStepWithError = Object.keys(e).some((k) => ["companyName", "email", "proposalDate", "validityDays"].includes(k)) ? 0
      : Object.keys(e).some((k) => k === "items" || k.startsWith("qty-") || k.startsWith("price-")) ? 1 : Object.keys(e).length ? 2 : -1;
    if (firstStepWithError !== -1) {
      setStep(firstStepWithError);
      toast.error(Object.values(e)[0]);
      return false;
    }
    return true;
  }

  function goTo(target: number) {
    if (target > step && !validate(target - 1)) return;
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Save ──
  async function save(kind: "draft" | "generate") {
    if (!validate(kind === "draft" ? 0 : 2)) return;
    setSaving(kind);
    const payload = {
      customerId,
      saveCustomer: true,
      customer: {
        companyName: customer.companyName, contactPerson: customer.contactPerson, email: customer.email, phone: customer.phone,
        billingAddress: customer.billingAddress, shippingAddress: customer.shippingAddress, gstin: customer.gstin,
      },
      type, proposalDate, validityDays: Number(validityDays), projectName,
      introduction: intro, termsAndConditions: terms, paymentTerms, notes,
      discountType, discountValue: numOr(discountValue), supplyType, placeOfSupply,
      items: items.map((i) => ({
        id: i.id, productId: i.productId, itemCode: i.itemCode || null, itemName: i.itemName, category: i.category || null,
        description: i.description, configuration: i.configuration, unit: i.unit, hsnSac: i.hsnSac || null,
        quantity: numOr(i.quantity), unitPrice: numOr(i.unitPrice), gstRate: i.gstRate, overrideReason: i.overrideReason || null,
      })),
    };
    try {
      const res = proposalId
        ? await api<{ proposal: ProposalDTO }>(`/api/proposals/${proposalId}`, { method: "PUT", json: payload })
        : await api<{ proposal: ProposalDTO }>("/api/proposals", { method: "POST", json: payload });
      const p = res.proposal;
      setDirty(false);
      setProposalId(p.id);
      setCustomerId(p.customerId);
      // Sync ids of saved lines so later saves keep master price snapshots
      setItems((list) => list.map((it, idx) => ({ ...it, id: p.items[idx]?.id ?? it.id, masterPrice: p.items[idx]?.masterPrice ?? it.masterPrice })));
      if (kind === "generate") {
        toast.success(`Proposal ${p.number} generated`, { description: "Download the PDF / Excel or email it to the customer." });
        router.push(`/proposals/${p.id}?generated=1`);
      } else {
        toast.success(`Draft saved · ${p.number}`);
        if (mode === "create") window.history.replaceState(null, "", `/proposals/${p.id}/edit`);
        router.refresh();
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const docData: DocProposal = {
    number: initial?.number ?? "Assigned on save", type, projectName: projectName || null, proposalDate: `${proposalDate}T00:00:00`,
    validUntil: validUntil.toISOString(), validityDays: numOr(validityDays, 30), preparedByName: initial?.preparedByName ?? user.name,
    customerName: customer.companyName, contactPerson: customer.contactPerson || null, customerEmail: customer.email || null,
    customerPhone: customer.phone || null, billingAddress: customer.billingAddress || null, shippingAddress: customer.shippingAddress || null,
    customerGstin: customer.gstin || null, introduction: intro, termsAndConditions: terms, paymentTerms, supplyType,
    placeOfSupply: placeOfSupply || null, discountType, discountValue: numOr(discountValue), subtotal: calc.subtotal,
    discountAmount: calc.discountAmount, taxableAmount: calc.taxableAmount, taxBreakdown: calc.breakdown, grandTotal: calc.grandTotal,
    items: items.map((i, idx) => ({
      key: i.key, itemCode: i.itemCode || null, itemName: i.itemName, description: i.description, configuration: i.configuration,
      unit: i.unit, hsnSac: i.hsnSac || null, quantity: numOr(i.quantity), unitPrice: numOr(i.unitPrice), gstRate: i.gstRate,
      lineTotal: calc.lines[idx]?.lineTotal ?? 0, priceOverridden: i.masterPrice !== null && Math.abs(i.masterPrice - numOr(i.unitPrice)) >= 0.005,
    })),
  };

  const setC = (k: keyof CustomerState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setCustomer((c) => ({ ...c, [k]: e.target.value }));
    touch();
  };

  // ── Render ──
  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{mode === "edit" ? "Edit proposal" : "Create proposal"}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {initial?.number ?? "Proposal number is generated automatically when you save."}
            {dirty && <span className="ml-2 text-amber-700">· Unsaved changes</span>}
          </p>
        </div>
        <Button variant="secondary" onClick={() => save("draft")} loading={saving === "draft"} disabled={saving !== null}>
          <Save className="h-4 w-4" /> Save draft
        </Button>
      </div>

      {/* Stepper */}
      <ol className="mb-6 grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const state = i < step ? "done" : i === step ? "current" : "todo";
          return (
            <li key={s.key}>
              <button type="button" onClick={() => goTo(i)}
                className={cn("group relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition",
                  state === "current" ? "border-brand-200 bg-white shadow-card" : "border-transparent hover:bg-white/70")}>
                <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition",
                  state === "done" ? "bg-emerald-500 text-white" : state === "current" ? "bg-brand-600 text-white" : "bg-slate-200 text-ink-muted")}>
                  {state === "done" ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span className="hidden min-w-0 md:block">
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-faint">Step {i + 1}</span>
                  <span className={cn("block truncate text-[13px] font-medium", state === "todo" ? "text-ink-muted" : "text-ink")}>{s.label}</span>
                </span>
                {state === "current" && <motion.span layoutId="step-bar" className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-600" />}
              </button>
            </li>
          );
        })}
      </ol>

      <div className={cn("grid gap-6", step === 3 ? "" : "xl:grid-cols-[1fr_320px]")}>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }} className="min-w-0">
            {/* STEP 1 – Customer */}
            {step === 0 && (
              <Card>
                <CardHeader title="Customer information" description="Pick an existing customer or enter new details – new customers are saved automatically." icon={Building2} />
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field label="Proposal type" required className="sm:col-span-2">
                    <div className="grid grid-cols-2 gap-2 sm:max-w-md">
                      {([["CUSTOMER", "Customer proposal", "Direct end-customer"], ["SI", "System Integrator (SI)", "Partner pricing"]] as const).map(([v, l, d]) => (
                        <button key={v} type="button" onClick={() => { setType(v); touch(); }}
                          className={cn("rounded-xl border p-3 text-left transition", type === v ? "border-brand-400 bg-brand-50/60 shadow-ring" : "border-slate-200 hover:border-slate-300")}>
                          <span className="block text-sm font-medium">{l}</span>
                          <span className="block text-xs text-ink-muted">{d}</span>
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Customer / company name" required error={errors.companyName} className="sm:col-span-2">
                    <CustomerPicker value={customer.companyName} linked={Boolean(customerId)}
                      onChange={(v) => { setCustomer((c) => ({ ...c, companyName: v })); setCustomerId(null); touch(); }}
                      onPick={(c) => {
                        setCustomerId(c.id);
                        setCustomer({ companyName: c.companyName, contactPerson: c.contactPerson ?? "", email: c.email ?? "", phone: c.phone ?? "", billingAddress: c.billingAddress ?? "", shippingAddress: c.shippingAddress ?? "", gstin: c.gstin ?? "" });
                        if (c.state && !placeOfSupply) setPlaceOfSupply(c.state);
                        touch();
                      }} />
                  </Field>
                  <Field label="Contact person"><Input value={customer.contactPerson} onChange={setC("contactPerson")} /></Field>
                  <Field label="Email address" error={errors.email}><Input type="email" value={customer.email} onChange={setC("email")} /></Field>
                  <Field label="Phone number"><Input type="tel" value={customer.phone} onChange={setC("phone")} /></Field>
                  <Field label="Customer GSTIN"><Input value={customer.gstin} onChange={setC("gstin")} maxLength={15} className="uppercase" /></Field>
                  <Field label="Billing address"><Textarea rows={3} value={customer.billingAddress} onChange={setC("billingAddress")} /></Field>
                  <Field label="Shipping / installation address" hint="Optional"><Textarea rows={3} value={customer.shippingAddress} onChange={setC("shippingAddress")} /></Field>
                </div>
                <div className="border-t border-slate-100 px-5 py-4">
                  <h3 className="mb-3 text-[13px] font-semibold text-ink">Proposal details</h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Project name / reference" className="sm:col-span-2"><Input value={projectName} onChange={(e) => { setProjectName(e.target.value); touch(); }} placeholder="e.g. Tower A – Access Control" /></Field>
                    <Field label="Proposal date" required error={errors.proposalDate}><Input type="date" value={proposalDate} onChange={(e) => { setProposalDate(e.target.value); touch(); }} /></Field>
                    <Field label="Validity (days)" required error={errors.validityDays} hint={`Valid until ${formatDate(validUntil)}`}>
                      <Input type="number" min={1} max={365} value={validityDays} onChange={(e) => { setValidityDays(e.target.value); touch(); }} />
                    </Field>
                    <Field label="Prepared by"><Input value={initial?.preparedByName ?? user.name} disabled /></Field>
                    <Field label="Proposal number"><Input value={initial?.number ?? "Auto-generated"} disabled /></Field>
                  </div>
                </div>
              </Card>
            )}

            {/* STEP 2 – Items */}
            {step === 1 && (
              <div className="space-y-4">
                <Card className="p-5">
                  <ProductSearch onSelect={(p) => addProduct(p)} canAddNew={canAdd} selectedIds={selectedIds}
                    onAddNew={(q) => { setNewItemName(q); setNewItemOpen(true); }} />
                  {!canOverride && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted"><Lock className="h-3.5 w-3.5" /> Rates are locked to the master selling price for your account.</p>
                  )}
                </Card>

                <Card className="overflow-visible">
                  <CardHeader title={`Quotation items (${items.length})`} description="Edit quantity, rate, description and configuration for this proposal only." icon={Package} />
                  {items.length === 0 ? (
                    <EmptyState icon={Package} title="No items yet" description={errors.items || "Search the product master above and select items to add them here."} />
                  ) : (
                    <div>
                      <ul className="divide-y divide-slate-100">
                        <AnimatePresence initial={false}>
                          {items.map((it, idx) => {
                            const rate = numOr(it.unitPrice);
                            const modified = it.masterPrice !== null && Math.abs(it.masterPrice - rate) >= 0.005;
                            const rateLocked = it.productId ? !canOverride : !canAdd && !it.id;
                            const masterChanged = it.currentMasterPrice !== null && it.masterPrice !== null && Math.abs(it.currentMasterPrice - it.masterPrice) >= 0.005;
                            return (
                              <motion.li key={it.key} layout initial={{ opacity: 0, backgroundColor: "rgb(238 242 255)" }} animate={{ opacity: 1, backgroundColor: "rgb(255 255 255 / 0)" }}
                                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35 }} className="px-4 py-3">
                                <div className="flex items-start gap-3">
                                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-semibold text-ink-muted">{idx + 1}</span>
                                  <button type="button" onClick={() => updateItem(it.key, { expanded: !it.expanded })} className="group flex min-w-0 flex-1 items-start gap-1.5 text-left">
                                    <span className="min-w-0">
                                      <span className="block truncate text-sm font-medium text-ink group-hover:text-brand-700">{it.itemName}</span>
                                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                                        {it.itemCode || "Custom item"}
                                        {!it.productId && <Badge tone="sky">One-off</Badge>}
                                        {modified && <Badge tone="amber">Price modified</Badge>}
                                        <span className="text-brand-600">{it.expanded ? "Hide details" : "Edit description & configuration"}</span>
                                      </span>
                                    </span>
                                    <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-ink-faint transition-transform", it.expanded && "rotate-180")} />
                                  </button>
                                  <div className="flex shrink-0 gap-0.5">
                                    <button type="button" title="Move up" onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="rounded-md p-1.5 text-ink-faint hover:bg-slate-100 hover:text-ink disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                                    <button type="button" title="Move down" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} className="rounded-md p-1.5 text-ink-faint hover:bg-slate-100 hover:text-ink disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                                    <button type="button" title="Remove item" onClick={() => { setItems((l) => l.filter((x) => x.key !== it.key)); touch(); }} className="rounded-md p-1.5 text-ink-faint hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                                  </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 items-start gap-3 sm:ml-9 sm:grid-cols-[90px_96px_minmax(130px,1fr)_88px_minmax(110px,1fr)]">
                                  <Field label="Qty">
                                    <Input type="number" min="0" step="any" inputMode="decimal" value={it.quantity} onChange={(e) => updateItem(it.key, { quantity: e.target.value })}
                                      className={cn("tabular", errors[`qty-${it.key}`] && "border-rose-400")} />
                                  </Field>
                                  <Field label="Unit">
                                    <Select value={it.unit} onChange={(e) => updateItem(it.key, { unit: e.target.value })} className="px-2">
                                      {[...new Set([...ps.units, it.unit])].map((u) => <option key={u}>{u}</option>)}
                                    </Select>
                                  </Field>
                                  <Field label="Unit rate (₹)">
                                    <div className="relative">
                                      <Input type="number" min="0" step="0.01" inputMode="decimal" value={it.unitPrice} disabled={rateLocked}
                                        onChange={(e) => updateItem(it.key, { unitPrice: e.target.value })}
                                        className={cn("tabular pr-7", modified && "border-amber-300 bg-amber-50/40", errors[`price-${it.key}`] && "border-rose-400")} />
                                      {rateLocked ? <Lock className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" /> : modified && (
                                        <button type="button" title="Reset to master price" onClick={() => updateItem(it.key, { unitPrice: String(it.masterPrice) })}
                                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-amber-700 hover:bg-amber-100"><RotateCcw className="h-3.5 w-3.5" /></button>
                                      )}
                                    </div>
                                    {it.masterPrice !== null && <div className="mt-1 text-[11px] text-ink-muted tabular">Master {formatINR(it.masterPrice)}</div>}
                                  </Field>
                                  <Field label="GST">
                                    <Select value={it.gstRate} onChange={(e) => updateItem(it.key, { gstRate: Number(e.target.value) })} className="px-2" disabled={supplyType === "NONE"}>
                                      {[...new Set([...ps.gstRates, it.gstRate])].map((g) => <option key={g} value={g}>{g}%</option>)}
                                    </Select>
                                  </Field>
                                  <div className="col-span-2 text-right sm:col-span-1">
                                    <div className="label">Line total</div>
                                    <motion.div key={calc.lines[idx]?.lineTotal} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="pt-1.5 text-[15px] font-semibold tabular">
                                      {formatINR(calc.lines[idx]?.lineTotal ?? 0)}
                                    </motion.div>
                                  </div>
                                </div>

                                {masterChanged && (
                                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-800 sm:ml-9">
                                    Master price has changed to {formatINR(it.currentMasterPrice!)} since this item was quoted.
                                    <button type="button" className="font-semibold underline" onClick={() => updateItem(it.key, { masterPrice: it.currentMasterPrice, unitPrice: String(it.currentMasterPrice), currentMasterPrice: null, id: null })}>Use current price</button>
                                  </div>
                                )}

                                <AnimatePresence initial={false}>
                                  {(it.expanded || modified) && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                      <div className="mt-3 grid gap-3 rounded-xl bg-slate-50/80 p-3 md:grid-cols-2 sm:ml-9">
                                        {it.expanded && <>
                                          <Field label="Item name"><Input value={it.itemName} onChange={(e) => updateItem(it.key, { itemName: e.target.value })} /></Field>
                                          <Field label="HSN / SAC"><Input value={it.hsnSac} onChange={(e) => updateItem(it.key, { hsnSac: e.target.value })} /></Field>
                                          <Field label="Description"><Textarea rows={4} value={it.description} onChange={(e) => updateItem(it.key, { description: e.target.value })} /></Field>
                                          <Field label="Configuration" hint={
                                            <span className="flex flex-wrap gap-1 pt-1">
                                              {CONFIG_CHIPS.map((c) => (
                                                <button key={c} type="button" onClick={() => updateItem(it.key, { configuration: (it.configuration ? it.configuration.replace(/\s*$/, "") + "\n" : "") + c })}
                                                  className="rounded-full bg-white px-2 py-0.5 text-[11px] text-ink-soft ring-1 ring-slate-200 hover:ring-brand-300">+ {c.replace(": ", "")}</button>
                                              ))}
                                            </span>}>
                                            <Textarea rows={4} value={it.configuration} onChange={(e) => updateItem(it.key, { configuration: e.target.value })} placeholder={"Doors: 4\nReaders: 8"} className="font-mono text-[12.5px]" />
                                          </Field>
                                        </>}
                                        {modified && (
                                          <Field label="Reason for price change (recorded in the audit log)" className="md:col-span-2">
                                            <Input value={it.overrideReason} onChange={(e) => updateItem(it.key, { overrideReason: e.target.value })} placeholder="e.g. Volume discount approved by Sales Head" />
                                          </Field>
                                        )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.li>
                            );
                          })}
                        </AnimatePresence>
                      </ul>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* STEP 3 – Commercials & terms */}
            {step === 2 && (
              <div className="space-y-4">
                <Card>
                  <CardHeader title="Discount & GST" description="Discount is applied before GST. GST rates are set per item." icon={Percent} />
                  <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Discount type">
                      <Select value={discountType} onChange={(e) => { setDiscountType(e.target.value as DiscountType); touch(); }}>
                        <option value="PERCENT">Percentage (%)</option>
                        <option value="AMOUNT">Fixed amount (₹)</option>
                      </Select>
                    </Field>
                    <Field label={discountType === "PERCENT" ? "Discount %" : "Discount amount (₹)"} error={errors.discount}>
                      <Input type="number" min="0" step="0.01" value={discountValue} onChange={(e) => { setDiscountValue(e.target.value); touch(); }} className="tabular" />
                    </Field>
                    <Field label="GST treatment">
                      <Select value={supplyType} onChange={(e) => { setSupplyType(e.target.value as SupplyType); touch(); }}>
                        <option value="INTRA">Intra-state (CGST + SGST)</option>
                        <option value="INTER">Inter-state (IGST)</option>
                        <option value="NONE">No GST (export / SEZ / exempt)</option>
                      </Select>
                    </Field>
                    <Field label="Place of supply"><Input value={placeOfSupply} onChange={(e) => { setPlaceOfSupply(e.target.value); touch(); }} placeholder="e.g. Karnataka" /></Field>
                  </div>
                </Card>

                <Card>
                  <CardHeader title="Proposal text" description="Edit the introduction and commercial terms for this proposal." icon={Sparkles} />
                  <div className="grid gap-4 p-5">
                    <Field label="Introduction / summary" hint={introAuto ? "Auto-filled from the template – start typing to customise." : (
                      <button type="button" className="font-medium text-brand-600" onClick={() => { setIntroAuto(true); touch(); }}>Reset to template</button>
                    )}>
                      <Textarea rows={7} value={intro} onChange={(e) => { setIntroAuto(false); setIntroduction(e.target.value); touch(); }} />
                    </Field>
                    <Field label="Payment terms" hint={<button type="button" className="font-medium text-brand-600" onClick={() => { setPaymentTerms(ps.paymentTerms); touch(); }}>Reset to default</button>}>
                      <Textarea rows={3} value={paymentTerms} onChange={(e) => { setPaymentTerms(e.target.value); touch(); }} />
                    </Field>
                    <Field label="Terms & conditions" hint={<button type="button" className="font-medium text-brand-600" onClick={() => { setTerms(ps.termsAndConditions); touch(); }}>Reset to default</button>}>
                      <Textarea rows={9} value={terms} onChange={(e) => { setTerms(e.target.value); touch(); }} />
                    </Field>
                    <Field label="Internal notes" hint="Not printed on the proposal.">
                      <Textarea rows={2} value={notes} onChange={(e) => { setNotes(e.target.value); touch(); }} />
                    </Field>
                  </div>
                </Card>
              </div>
            )}

            {/* STEP 4 – Preview */}
            {step === 3 && (
              <div>
                <div className="mb-4 flex flex-col gap-3 rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-sm text-brand-900 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-2"><Eye className="h-4 w-4" /> Review the proposal. Totals are re-validated on the server when you generate it.</span>
                  <span className="font-semibold tabular">Grand total {formatINR(calc.grandTotal)}</span>
                </div>
                <div className="rounded-2xl bg-slate-100/80 p-3 sm:p-6">
                  <ProposalDocument p={docData} company={settings.company} />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Summary sidebar */}
        {step !== 3 && (
          <aside className="xl:sticky xl:top-6 xl:self-start">
            <Card className="p-5">
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-muted">Summary</h3>
              <div className="mt-3 space-y-1 text-sm">
                <div className="truncate font-medium">{customer.companyName || <span className="text-ink-faint">No customer yet</span>}</div>
                <div className="text-xs text-ink-muted">{type === "SI" ? "SI proposal" : "Customer proposal"} · {items.length} item{items.length === 1 ? "" : "s"}</div>
              </div>
              <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
                <div className="flex justify-between"><dt className="text-ink-muted">Subtotal</dt><dd className="tabular">{formatINR(calc.subtotal)}</dd></div>
                {calc.discountAmount > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Discount</dt><dd className="tabular text-emerald-700">− {formatINR(calc.discountAmount)}</dd></div>}
                <div className="flex justify-between"><dt className="text-ink-muted">Taxable</dt><dd className="tabular">{formatINR(calc.taxableAmount)}</dd></div>
                {calc.breakdown.map((b) => supplyType === "INTRA" ? (
                  <div key={b.rate} className="flex justify-between text-xs"><dt className="text-ink-muted">CGST+SGST @ {b.rate}%</dt><dd className="tabular">{formatINR(b.tax)}</dd></div>
                ) : (
                  <div key={b.rate} className="flex justify-between text-xs"><dt className="text-ink-muted">IGST @ {b.rate}%</dt><dd className="tabular">{formatINR(b.tax)}</dd></div>
                ))}
              </dl>
              <div className="mt-4 rounded-xl bg-gradient-to-br from-brand-800 to-brand-950 p-4 text-white">
                <div className="text-xs text-white/70">Grand total</div>
                <motion.div key={calc.grandTotal} initial={{ y: 4, opacity: 0.5 }} animate={{ y: 0, opacity: 1 }} className="mt-0.5 text-2xl font-semibold tracking-tight tabular">
                  {formatINR(calc.grandTotal)}
                </motion.div>
              </div>
            </Card>
          </aside>
        )}
      </div>

      {/* Footer navigation */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-6 flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <Button variant="ghost" onClick={() => (step === 0 ? router.back() : goTo(step - 1))}>
          <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < 3 ? (
          <Button onClick={() => goTo(step + 1)}>
            {step === 2 ? "Preview proposal" : "Continue"} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="lg" onClick={() => save("generate")} loading={saving === "generate"} disabled={saving !== null}>
            <FileCheck2 className="h-4 w-4" /> Generate Proposal
          </Button>
        )}
      </div>

      <ProductFormModal open={newItemOpen} onClose={() => setNewItemOpen(false)} mode="create" initialName={newItemName}
        units={ps.units} gstRates={ps.gstRates} allowProposalOnly onSaved={(p, o) => addProduct(p, o)} />
    </div>
  );
}
