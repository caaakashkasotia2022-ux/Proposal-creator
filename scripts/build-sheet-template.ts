/* Generates google-sheets/IDCUBE_Product_Master_Template.xlsx (+ a CSV copy).
 * Import the .xlsx into Google Sheets: File → Import → Upload → "Replace spreadsheet".
 * Run with `npm run sheet:template`. */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { PRODUCT_COLUMNS } from "../src/lib/product-columns";

const OUT_DIR = path.join(process.cwd(), "google-sheets");
const SAMPLE = path.join(process.cwd(), "data", "product-master-sample.csv");

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rows = Papa.parse<string[]>(fs.readFileSync(SAMPLE, "utf8"), { skipEmptyLines: true }).data;
  const [, ...data] = rows;

  const wb = new ExcelJS.Workbook();
  wb.creator = "IDCUBE Proposal System";

  // ── Products tab ──
  const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = PRODUCT_COLUMNS.map((c) => ({ header: c.header, key: c.field, width: c.width }));
  const header = ws.getRow(1);
  header.height = 28;
  header.eachCell((cell, col) => {
    const def = PRODUCT_COLUMNS[col - 1];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: def.required ? "FF1E3A8A" : "FF475569" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.note = `${def.required ? "REQUIRED. " : ""}${def.help}`;
  });

  for (const r of data) {
    const row = ws.addRow(r.map((v, i) => (PRODUCT_COLUMNS[i]?.field === "sellingPrice" || PRODUCT_COLUMNS[i]?.field === "gstRate" ? Number(v) : v)));
    row.alignment = { vertical: "top", wrapText: true };
  }

  const priceCol = PRODUCT_COLUMNS.findIndex((c) => c.field === "sellingPrice") + 1;
  ws.getColumn(priceCol).numFmt = "#,##0.00";

  // Data validation for 1,000 rows
  const letter = (field: string) => String.fromCharCode(65 + PRODUCT_COLUMNS.findIndex((c) => c.field === field));
  for (let r = 2; r <= 1000; r++) {
    ws.getCell(`${letter("status")}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Active,Inactive"'], showErrorMessage: true, errorTitle: "Status", error: "Choose Active or Inactive" };
    ws.getCell(`${letter("gstRate")}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"0,5,12,18,28"'] };
    ws.getCell(`${letter("unit")}${r}`).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: ['Lists!$A$2:$A$20'] };
    ws.getCell(`${letter("sellingPrice")}${r}`).dataValidation = { type: "decimal", operator: "greaterThanOrEqual", allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: "Selling Price", error: "Enter a number (no ₹ symbol or text)" };
  }
  ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + PRODUCT_COLUMNS.length)}1` };

  // ── Lists tab (units / categories) ──
  const lists = wb.addWorksheet("Lists");
  lists.columns = [{ header: "Units", width: 14 }, { header: "Categories", width: 24 }];
  const units = ["Nos", "Set", "License", "User", "Door", "Reader", "Month", "Year", "Lot", "Visit", "Day", "Meter"];
  const cats = [...new Set(data.map((r) => r[2]))];
  for (let i = 0; i < Math.max(units.length, cats.length); i++) lists.addRow([units[i] ?? "", cats[i] ?? ""]);
  lists.getRow(1).font = { bold: true };

  // ── Instructions tab ──
  const ins = wb.addWorksheet("Instructions");
  ins.getColumn(1).width = 22;
  ins.getColumn(2).width = 90;
  ins.addRow(["IDCUBE Product Master – how to use"]).font = { bold: true, size: 14 };
  ins.addRow([]);
  [
    ["Where to edit", "Only the 'Products' tab is read by the proposal system. Keep the header row (row 1) exactly as it is."],
    ["Bulk paste", "Paste rows from Excel below the header. Use Paste special → Values only to keep formatting clean."],
    ["Item Code", "Required and unique. Never reuse a code for a different product. Codes are matched on every sync."],
    ["Selling Price", "Plain numbers in INR, excluding GST (e.g. 45000). Rows with a missing or invalid price are skipped and reported in the app."],
    ["GST %", "0, 5, 12, 18 or 28. Blank defaults to 18."],
    ["Configuration", "Multi-line text allowed (Alt+Enter / Ctrl+Enter in Google Sheets)."],
    ["Removing items", "Set Status = Inactive instead of deleting the row. Deleted rows are also deactivated in the app on the next sync."],
    ["Sync", "The app refreshes automatically every few minutes, or instantly via Product Master → Sync now."],
    ["Old proposals", "Changing a price here never changes proposals already created – each proposal stores its own snapshot."],
    ["Sample rows", "Rows marked [SAMPLE] are dummy data for testing. Replace them with IDCUBE's real products."],
  ].forEach(([a, b]) => {
    const row = ins.addRow([a, b]);
    row.getCell(1).font = { bold: true };
    row.alignment = { wrapText: true, vertical: "top" };
  });
  ins.addRow([]);
  ins.addRow(["Columns", ""]).font = { bold: true };
  for (const c of PRODUCT_COLUMNS) {
    const row = ins.addRow([`${c.header}${c.required ? " *" : ""}`, `${c.help}  Example: ${c.example.replace(/\n/g, " / ")}`]);
    row.alignment = { wrapText: true, vertical: "top" };
  }

  const xlsx = path.join(OUT_DIR, "IDCUBE_Product_Master_Template.xlsx");
  await wb.xlsx.writeFile(xlsx);
  fs.copyFileSync(SAMPLE, path.join(OUT_DIR, "IDCUBE_Product_Master_Template.csv"));
  console.log(`✓ Wrote ${xlsx}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
