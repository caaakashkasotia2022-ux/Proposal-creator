// Pricing & GST calculation engine.
// Pure and isomorphic: the browser uses it for live totals, and the server
// re-runs it on every save so stored figures never depend on client input.

import { fromPaise, toPaise } from "./money";

export type DiscountType = "PERCENT" | "AMOUNT";
/** INTRA = CGST + SGST (same state), INTER = IGST, NONE = no GST (e.g. export/SEZ) */
export type SupplyType = "INTRA" | "INTER" | "NONE";

export interface CalcItemInput {
  quantity: number;
  unitPrice: number;
  gstRate: number;
}

export interface CalcInput {
  items: CalcItemInput[];
  discountType: DiscountType;
  discountValue: number;
  supplyType: SupplyType;
}

export interface CalcLine {
  lineTotal: number;
  discountShare: number;
  taxableAmount: number;
  taxAmount: number;
}

export interface TaxRow {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
}

export interface CalcResult {
  lines: CalcLine[];
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  grandTotal: number;
  breakdown: TaxRow[];
}

/** Splits `total` across `weights` proportionally so the parts sum exactly (largest remainder). */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}

export function calculate(input: CalcInput): CalcResult {
  const items = input.items.map((it) => ({
    quantity: Math.max(0, Number(it.quantity) || 0),
    unitPrice: Math.max(0, Number(it.unitPrice) || 0),
    gstRate: Math.min(100, Math.max(0, Number(it.gstRate) || 0)),
  }));

  // 1. Line totals (paise)
  const linePaise = items.map((it) => Math.round(Number((it.quantity * toPaise(it.unitPrice)).toFixed(6))));
  const subtotal = linePaise.reduce((a, b) => a + b, 0);

  // 2. Discount
  let discount = 0;
  const dv = Math.max(0, Number(input.discountValue) || 0);
  if (input.discountType === "PERCENT") discount = Math.round((subtotal * Math.min(dv, 100)) / 100);
  else discount = Math.min(toPaise(dv), subtotal);

  // 3. Spread the discount across lines proportionally
  const shares = allocate(discount, linePaise);
  const taxable = linePaise.map((lt, i) => lt - shares[i]);

  // 4. GST grouped by rate (rounded at group level, as on a tax invoice)
  const groups = new Map<number, number[]>();
  items.forEach((it, i) => {
    const key = Math.round(it.gstRate * 100) / 100;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });

  const lineTax = new Array(items.length).fill(0);
  const breakdown: TaxRow[] = [];
  let cgst = 0, sgst = 0, igst = 0;

  for (const [rate, idxs] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const groupTaxable = idxs.reduce((a, i) => a + taxable[i], 0);
    let gC = 0, gS = 0, gI = 0;
    if (input.supplyType === "INTRA") {
      gC = gS = Math.round((groupTaxable * rate) / 200);
    } else if (input.supplyType === "INTER") {
      gI = Math.round((groupTaxable * rate) / 100);
    }
    const groupTax = gC + gS + gI;
    allocate(groupTax, idxs.map((i) => taxable[i])).forEach((t, k) => (lineTax[idxs[k]] = t));
    cgst += gC; sgst += gS; igst += gI;
    breakdown.push({
      rate,
      taxable: fromPaise(groupTaxable),
      cgst: fromPaise(gC),
      sgst: fromPaise(gS),
      igst: fromPaise(gI),
      tax: fromPaise(groupTax),
    });
  }

  const taxableTotal = subtotal - discount;
  const taxTotal = cgst + sgst + igst;

  return {
    lines: linePaise.map((lt, i) => ({
      lineTotal: fromPaise(lt),
      discountShare: fromPaise(shares[i]),
      taxableAmount: fromPaise(taxable[i]),
      taxAmount: fromPaise(lineTax[i]),
    })),
    subtotal: fromPaise(subtotal),
    discountAmount: fromPaise(discount),
    taxableAmount: fromPaise(taxableTotal),
    cgst: fromPaise(cgst),
    sgst: fromPaise(sgst),
    igst: fromPaise(igst),
    taxTotal: fromPaise(taxTotal),
    grandTotal: fromPaise(taxableTotal + taxTotal),
    breakdown: input.supplyType === "NONE" ? [] : breakdown.filter((b) => b.taxable !== 0 || b.tax !== 0),
  };
}
