// Canonical Product Master columns + tolerant header matching and row parsing.
// Shared by the sync engine, the template generator and the write-back logic.

import { parseMoney } from "./money";

export type ProductField =
  | "itemCode" | "itemName" | "category" | "description" | "configuration"
  | "unit" | "sellingPrice" | "gstRate" | "hsnSac" | "brand" | "status" | "lastUpdated";

export interface ColumnDef {
  field: ProductField;
  header: string;
  aliases: string[];
  required?: boolean;
  help: string;
  example: string;
  width: number;
}

/** Order used in the Google Sheet template. */
export const PRODUCT_COLUMNS: ColumnDef[] = [
  { field: "itemCode", header: "Item Code", aliases: ["code", "sku", "item no", "part no", "part number", "product code"], required: true, help: "Unique code. Never reuse a code for a different product.", example: "SMP-ACS-001", width: 16 },
  { field: "itemName", header: "Item Name", aliases: ["name", "product", "product name", "item"], required: true, help: "Name shown in search and on proposals.", example: "2-Door Access Controller", width: 34 },
  { field: "category", header: "Category", aliases: ["product category", "group", "type"], help: "Used for filtering, e.g. Access Control, Software, Services.", example: "Access Control", width: 20 },
  { field: "description", header: "Description", aliases: ["item description", "details", "product description"], help: "Standard description printed on the proposal.", example: "IP-based controller…", width: 50 },
  { field: "configuration", header: "Configuration", aliases: ["config", "specification", "specifications", "technical specification", "tech specs"], help: "Default configuration / technical specs. Use Alt+Enter for new lines.", example: "Doors: 2\nReaders: 4", width: 40 },
  { field: "unit", header: "Unit", aliases: ["uom", "unit of measure", "units"], help: "Nos, Set, License, Month, Year…", example: "Nos", width: 10 },
  { field: "sellingPrice", header: "Selling Price", aliases: ["price", "rate", "unit price", "selling price (inr)", "mrp", "list price"], required: true, help: "Default selling price in INR, excluding GST. Numbers only.", example: "45000", width: 15 },
  { field: "gstRate", header: "GST %", aliases: ["gst", "gst rate", "tax", "tax %", "tax rate", "gst%"], help: "0, 5, 12, 18 or 28. Blank = 18.", example: "18", width: 8 },
  { field: "hsnSac", header: "HSN/SAC", aliases: ["hsn", "sac", "hsn code", "sac code", "hsn / sac"], help: "HSN (goods) or SAC (services) code.", example: "8471", width: 11 },
  { field: "brand", header: "Brand / Make", aliases: ["brand", "make", "manufacturer", "oem"], help: "Optional.", example: "IDCUBE", width: 14 },
  { field: "status", header: "Status", aliases: ["active", "product status"], help: "Active or Inactive. Inactive items are hidden from search.", example: "Active", width: 10 },
  { field: "lastUpdated", header: "Last Updated", aliases: ["updated", "updated on", "modified"], help: "Optional, for your reference.", example: "2026-11-01", width: 13 },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%/]+/g, " ").trim();

export function matchHeader(header: string): ProductField | null {
  const h = norm(header);
  if (!h) return null;
  for (const c of PRODUCT_COLUMNS) {
    if (norm(c.header) === h || c.aliases.some((a) => norm(a) === h)) return c.field;
  }
  return null;
}

/** Map of field -> column index, from a header row. */
export function mapHeaderRow(row: string[]): Partial<Record<ProductField, number>> {
  const map: Partial<Record<ProductField, number>> = {};
  row.forEach((cell, i) => {
    const f = matchHeader(String(cell ?? ""));
    if (f && map[f] === undefined) map[f] = i;
  });
  return map;
}

export interface ParsedProduct {
  itemCode: string;
  itemName: string;
  category: string;
  description: string;
  configuration: string;
  unit: string;
  sellingPrice: number;
  gstRate: number;
  hsnSac: string | null;
  brand: string | null;
  status: "ACTIVE" | "INACTIVE";
  sheetRow: number;
}

export interface ParseIssue {
  row: number;
  severity: "error" | "warning";
  message: string;
}

const VALID_GST = [0, 0.1, 0.25, 1.5, 3, 5, 6, 12, 18, 28, 40];

function parseGst(raw: string): number | null {
  if (raw.trim() === "") return 18;
  const n = Number(raw.replace(/%/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  // Spreadsheet percentage cells often arrive as fractions (0.18)
  if (n > 0 && n < 1 && VALID_GST.includes(Math.round(n * 10000) / 100)) return Math.round(n * 10000) / 100;
  return n <= 100 ? n : null;
}

function parseStatus(raw: string): "ACTIVE" | "INACTIVE" {
  return /^(inactive|no|false|0|n|discontinued|disabled|obsolete)$/i.test(raw.trim()) ? "INACTIVE" : "ACTIVE";
}

/**
 * Parses raw sheet rows (including any title rows above the header).
 * Bad rows are skipped and reported; they never break the sync.
 */
export function parseProductRows(rows: unknown[][]): { products: ParsedProduct[]; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];
  const products: ParsedProduct[] = [];

  const headerIdx = rows.findIndex((r) => {
    const m = mapHeaderRow(r.map((c) => String(c ?? "")));
    return m.itemName !== undefined && m.sellingPrice !== undefined;
  });
  if (headerIdx === -1) {
    issues.push({ row: 1, severity: "error", message: "Header row not found. The sheet needs at least 'Item Name' and 'Selling Price' columns." });
    return { products, issues };
  }

  const map = mapHeaderRow(rows[headerIdx].map((c) => String(c ?? "")));
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const sheetRow = i + 1;
    const get = (f: ProductField) => {
      const idx = map[f];
      return idx === undefined ? "" : String(r[idx] ?? "").trim();
    };
    if (r.every((c) => String(c ?? "").trim() === "")) continue;

    const itemName = get("itemName");
    if (!itemName) {
      issues.push({ row: sheetRow, severity: "error", message: "Item Name is empty – row skipped." });
      continue;
    }

    let itemCode = get("itemCode").toUpperCase();
    if (!itemCode) {
      itemCode = "AUTO-" + itemName.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      issues.push({ row: sheetRow, severity: "warning", message: `Item Code missing – using generated code ${itemCode}. Please add a code in the sheet.` });
    }
    if (seen.has(itemCode)) {
      issues.push({ row: sheetRow, severity: "error", message: `Duplicate Item Code ${itemCode} – row skipped.` });
      continue;
    }

    const priceCell = map.sellingPrice === undefined ? "" : r[map.sellingPrice];
    const price = parseMoney(typeof priceCell === "number" ? priceCell : String(priceCell ?? ""));
    if (price === null || price < 0) {
      issues.push({ row: sheetRow, severity: "error", message: `Selling Price "${String(priceCell ?? "")}" is missing or not a valid number – ${itemCode} skipped.` });
      continue;
    }

    let gst = parseGst(get("gstRate"));
    if (gst === null) {
      issues.push({ row: sheetRow, severity: "warning", message: `GST % "${get("gstRate")}" is invalid – defaulted to 18%.` });
      gst = 18;
    }

    seen.add(itemCode);
    products.push({
      itemCode,
      itemName,
      category: get("category") || "General",
      description: get("description"),
      configuration: get("configuration"),
      unit: get("unit") || "Nos",
      sellingPrice: price,
      gstRate: gst,
      hsnSac: get("hsnSac") || null,
      brand: get("brand") || null,
      status: parseStatus(get("status")),
      sheetRow,
    });
  }
  return { products, issues };
}

/** Builds a row in the order of an existing header (for write-back). */
export function buildRowForHeader(header: string[], p: Omit<ParsedProduct, "sheetRow">): string[] {
  const map = mapHeaderRow(header);
  const row = new Array(header.length).fill("");
  const values: Record<ProductField, string> = {
    itemCode: p.itemCode,
    itemName: p.itemName,
    category: p.category,
    description: p.description,
    configuration: p.configuration,
    unit: p.unit,
    sellingPrice: String(p.sellingPrice),
    gstRate: String(p.gstRate),
    hsnSac: p.hsnSac ?? "",
    brand: p.brand ?? "",
    status: p.status === "ACTIVE" ? "Active" : "Inactive",
    lastUpdated: new Date().toISOString().slice(0, 10),
  };
  (Object.keys(values) as ProductField[]).forEach((f) => {
    const idx = map[f];
    if (idx !== undefined) row[idx] = values[f];
  });
  return row;
}
