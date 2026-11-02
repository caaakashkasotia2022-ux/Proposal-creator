// Monetary helpers. All arithmetic is done in integer paise to avoid
// floating-point drift; values are converted back to rupees for display/storage.

export function toPaise(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // toFixed(6) strips binary noise such as 1.1 * 100 = 110.00000000000001
  return Math.round(Number((value * 100).toFixed(6)));
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

export function round2(value: number): number {
  return fromPaise(toPaise(value));
}

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 125000 -> "₹1,25,000.00" (or "1,25,000.00" without symbol) */
export function formatINR(value: number | null | undefined, opts: { symbol?: boolean } = {}): string {
  const n = Number(value ?? 0);
  const s = inr.format(Number.isFinite(n) ? n : 0);
  return opts.symbol === false ? s : `₹${s}`;
}

export function formatCompactINR(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `₹${(value / 1e3).toFixed(1)} K`;
  return formatINR(value);
}

/**
 * Parses loosely formatted prices coming from spreadsheets:
 * 1250, "1,250", "₹ 1,25,000.50", "Rs. 500/-", "INR 99". Returns null if invalid.
 */
export function parseMoney(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? round2(input) : null;
  if (typeof input !== "string") return null;
  const cleaned = input
    .replace(/₹|rs\.?|inr|\/-/gi, "")
    .replace(/[,\s]/g, "")
    .trim();
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? round2(n) : null;
}

// ── Amount in words (Indian numbering) ──────────────────────
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
}

function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;
  if (crore) parts.push(`${crore >= 100 ? integerToWords(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

export function amountInWords(value: number): string {
  const paise = toPaise(Math.abs(value));
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  let words = `Rupees ${integerToWords(rupees)}`;
  if (p) words += ` and ${twoDigits(p)} Paise`;
  return `${words} Only`;
}
