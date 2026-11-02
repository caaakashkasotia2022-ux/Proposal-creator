"use client";
import type { CompanySettings } from "@/lib/settings";
import type { TaxRow } from "@/lib/calc";
import { amountInWords, formatINR } from "@/lib/money";
import { fillTemplate, formatDate } from "@/lib/utils";
import { BrandMark } from "@/components/brand";

export interface DocItem {
  key: string;
  itemCode: string | null;
  itemName: string;
  description: string;
  configuration: string;
  unit: string;
  hsnSac: string | null;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  lineTotal: number;
  priceOverridden: boolean;
}

export interface DocProposal {
  number: string;
  type: "CUSTOMER" | "SI";
  projectName: string | null;
  proposalDate: string;
  validUntil: string;
  validityDays: number;
  preparedByName: string;
  customerName: string;
  contactPerson: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  customerGstin: string | null;
  introduction: string;
  termsAndConditions: string;
  paymentTerms: string;
  supplyType: "INTRA" | "INTER" | "NONE";
  placeOfSupply: string | null;
  discountType: "PERCENT" | "AMOUNT";
  discountValue: number;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxBreakdown: TaxRow[];
  grandTotal: number;
  items: DocItem[];
}

const money = (n: number) => formatINR(n);

/** Screen rendition of the proposal – mirrors the server-generated PDF layout. */
export function ProposalDocument({ p, company }: { p: DocProposal; company: CompanySettings }) {
  const intro = fillTemplate(p.introduction, {
    customerName: p.customerName, contactPerson: p.contactPerson || "Sir/Madam", projectName: p.projectName || "your project",
  });

  return (
    <article className="mx-auto w-full max-w-[860px] rounded-xl bg-white text-[13px] leading-relaxed text-ink shadow-lift ring-1 ring-slate-200">
      <header className="flex items-center justify-between border-b-2 border-brand-800 px-6 py-5 sm:px-10">
        {company.logoPath ? <img src={company.logoPath} alt={company.name} className="h-9 object-contain" /> : <BrandMark subtitle="[Logo placeholder]" />}
        <div className="text-right">
          <div className="text-[13px] font-bold tracking-[0.2em] text-ink">PROPOSAL</div>
          <div className="text-xs text-ink-muted">{p.number}</div>
        </div>
      </header>

      <div className="px-6 py-7 sm:px-10">
        <span className="inline-block rounded bg-brand-50 px-2 py-0.5 text-[10.5px] font-bold tracking-wider text-brand-700">
          {p.type === "SI" ? "SYSTEM INTEGRATOR PROPOSAL" : "CUSTOMER PROPOSAL"}
        </span>
        <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{p.projectName || "Commercial Proposal"}</h1>

        <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-lg ring-1 ring-slate-200 sm:grid-cols-4">
          {[["Proposal No.", p.number], ["Date", formatDate(p.proposalDate)], ["Valid until", formatDate(p.validUntil)], ["Prepared by", p.preparedByName]].map(([l, v]) => (
            <div key={l} className="border-b border-r border-slate-200 p-3 last:border-r-0 sm:border-b-0">
              <dt className="text-[10.5px] font-medium uppercase tracking-wider text-ink-muted">{l}</dt>
              <dd className="mt-0.5 break-words font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-[10.5px] font-medium uppercase tracking-wider text-ink-muted">Prepared for</div>
            <div className="mt-1 font-semibold">{p.customerName || "—"}</div>
            {p.contactPerson && <div>Attn: {p.contactPerson}</div>}
            {p.billingAddress && <div className="whitespace-pre-line text-ink-soft">{p.billingAddress}</div>}
            {(p.customerEmail || p.customerPhone) && <div className="text-ink-soft">{[p.customerEmail, p.customerPhone].filter(Boolean).join(" · ")}</div>}
            {p.customerGstin && <div className="mt-1 text-xs text-ink-muted">GSTIN: {p.customerGstin}</div>}
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-[10.5px] font-medium uppercase tracking-wider text-ink-muted">{p.shippingAddress ? "Installation / Shipping address" : "Prepared by"}</div>
            {p.shippingAddress ? <div className="mt-1 whitespace-pre-line text-ink-soft">{p.shippingAddress}</div> : (
              <>
                <div className="mt-1 font-semibold">{company.name}</div>
                <div className="whitespace-pre-line text-ink-soft">{company.address}</div>
                <div className="mt-1 text-xs text-ink-muted">GSTIN: {company.gstin}</div>
              </>
            )}
          </div>
        </div>

        {intro.trim() && (
          <section className="mt-7">
            <h2 className="mb-2 text-[14px] font-semibold text-brand-800">Introduction</h2>
            <p className="whitespace-pre-line text-ink-soft">{intro}</p>
          </section>
        )}

        <section className="mt-7">
          <h2 className="mb-2 text-[14px] font-semibold text-brand-800">Commercial Offer</h2>
          <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
            <table className="w-full min-w-[620px] text-left">
              <thead className="bg-brand-800 text-[11.5px] text-white">
                <tr>
                  <th className="w-10 px-3 py-2 text-center font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Item &amp; Description</th>
                  <th className="px-3 py-2 text-right font-semibold">Qty</th>
                  <th className="px-3 py-2 text-center font-semibold">Unit</th>
                  <th className="px-3 py-2 text-right font-semibold">Unit Price</th>
                  <th className="px-3 py-2 text-center font-semibold">GST</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {p.items.map((it, i) => (
                  <tr key={it.key} className="border-t border-slate-200 align-top even:bg-slate-50/70">
                    <td className="px-3 py-3 text-center text-ink-muted">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold">{it.itemName}</div>
                      {(it.itemCode || it.hsnSac) && <div className="text-[11px] text-ink-muted">{[it.itemCode, it.hsnSac && `HSN/SAC ${it.hsnSac}`].filter(Boolean).join(" · ")}</div>}
                      {it.description && <div className="mt-1 text-[12.5px] text-ink-soft">{it.description}</div>}
                      {it.configuration && (
                        <div className="mt-1.5 border-l-2 border-brand-600 pl-2">
                          <div className="text-[9.5px] font-bold tracking-wider text-brand-700">CONFIGURATION</div>
                          <div className="whitespace-pre-line text-[12px] text-ink-soft">{it.configuration}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular">{it.quantity}</td>
                    <td className="px-3 py-3 text-center">{it.unit}</td>
                    <td className="px-3 py-3 text-right tabular">
                      {money(it.unitPrice)}
                      {it.priceOverridden && <div className="text-[10.5px] text-amber-700">Special price</div>}
                    </td>
                    <td className="px-3 py-3 text-center">{p.supplyType === "NONE" ? "–" : `${it.gstRate}%`}</td>
                    <td className="px-3 py-3 text-right font-medium tabular">{money(it.lineTotal)}</td>
                  </tr>
                ))}
                {p.items.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-ink-muted">No items added yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-4 text-[12.5px]">
              <div className="text-[10.5px] font-medium uppercase tracking-wider text-ink-muted">Amount in words</div>
              <div className="mt-1 font-semibold">{amountInWords(p.grandTotal)}</div>
              <div className="mt-2 text-xs text-ink-muted">
                {p.supplyType === "INTRA" ? "Intra-state supply (CGST + SGST)" : p.supplyType === "INTER" ? "Inter-state supply (IGST)" : "GST not applicable"}
                {p.placeOfSupply ? ` · Place of supply: ${p.placeOfSupply}` : ""}
              </div>
            </div>
            <div className="text-[13px]">
              <Row label="Subtotal" value={money(p.subtotal)} />
              {p.discountAmount > 0 && <Row label={`Discount${p.discountType === "PERCENT" ? ` (${p.discountValue}%)` : ""}`} value={`− ${money(p.discountAmount)}`} />}
              <Row label="Taxable value" value={money(p.taxableAmount)} border />
              {p.taxBreakdown.map((b) => p.supplyType === "INTRA" ? (
                <div key={b.rate}>
                  <Row muted label={`CGST @ ${b.rate / 2}%`} value={money(b.cgst)} />
                  <Row muted label={`SGST @ ${b.rate / 2}%`} value={money(b.sgst)} />
                </div>
              ) : <Row key={b.rate} muted label={`IGST @ ${b.rate}%`} value={money(b.igst)} />)}
              <div className="mt-2 flex justify-between rounded-md bg-brand-800 px-3 py-2.5 font-semibold text-white">
                <span>Grand Total</span><span className="tabular">{money(p.grandTotal)}</span>
              </div>
            </div>
          </div>
        </section>

        {p.paymentTerms.trim() && <TextSection title="Payment Terms" text={p.paymentTerms} />}
        {p.termsAndConditions.trim() && <TextSection title="Terms & Conditions" text={p.termsAndConditions} />}
        <TextSection title="Validity" text={`This proposal is valid for ${p.validityDays} days from ${formatDate(p.proposalDate)}, i.e. until ${formatDate(p.validUntil)}.`} />

        <div className="mt-8 flex flex-col justify-between gap-6 border-t border-slate-200 pt-5 sm:flex-row">
          <div className="text-[12.5px]">
            <div className="text-[10.5px] font-medium uppercase tracking-wider text-ink-muted">Prepared by</div>
            <div className="mt-1 font-semibold">{p.preparedByName}</div>
            <div>{company.name}</div>
            <div className="text-ink-muted">{[company.email, company.phone, company.website].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="text-right text-xs text-ink-muted sm:self-end">Accepted by (customer): name, signature, seal &amp; date</div>
        </div>
      </div>
    </article>
  );
}

function Row({ label, value, muted, border }: { label: string; value: string; muted?: boolean; border?: boolean }) {
  return (
    <div className={`flex justify-between px-3 py-1 ${border ? "border-t border-slate-200 pt-1.5" : ""} ${muted ? "text-ink-soft" : ""}`}>
      <span>{label}</span><span className="tabular">{value}</span>
    </div>
  );
}

function TextSection({ title, text }: { title: string; text: string }) {
  return (
    <section className="mt-6">
      <h2 className="mb-1.5 text-[14px] font-semibold text-brand-800">{title}</h2>
      <p className="whitespace-pre-line text-[12.5px] text-ink-soft">{text}</p>
    </section>
  );
}
