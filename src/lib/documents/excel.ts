import "server-only";
import ExcelJS from "exceljs";
import type { ProposalDTO } from "../proposals";
import type { AppSettings } from "../settings";
import { formatDate } from "../utils";

// Indian digit grouping: 1,23,45,678.00
const INR_FMT = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';
const BRAND = "FF1E3A8A";
const BRAND_LIGHT = "FFE8EEFB";
const BORDER = { style: "thin" as const, color: { argb: "FFCBD5E1" } };
const BOX = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

export async function buildProposalExcel(p: ProposalDTO, s: AppSettings): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = s.company.name;
  wb.created = new Date();
  const ws = wb.addWorksheet("Quotation", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: `&L${p.number}&RPage &P of &N` },
    views: [{ showGridLines: false }],
  });

  // Columns: A S.No | B Code | C Item | D Description | E Configuration | F Qty | G Unit | H Rate | I Amount | J GST% | K Taxable | L GST Amt
  ws.columns = [
    { width: 6 }, { width: 14 }, { width: 28 }, { width: 42 }, { width: 34 }, { width: 8 },
    { width: 9 }, { width: 14 }, { width: 16 }, { width: 8 }, { width: 16 }, { width: 14 },
  ];

  // ── Header block ──
  ws.mergeCells("A1:L1");
  ws.getCell("A1").value = s.company.name;
  ws.getCell("A1").font = { size: 16, bold: true, color: { argb: BRAND } };
  ws.mergeCells("A2:L2");
  ws.getCell("A2").value = [s.company.address, s.company.phone, s.company.email].filter(Boolean).join("  |  ");
  ws.getCell("A2").font = { size: 9, color: { argb: "FF64748B" } };
  ws.mergeCells("A3:L3");
  ws.getCell("A3").value = `GSTIN: ${s.company.gstin}`;
  ws.getCell("A3").font = { size: 9, color: { argb: "FF64748B" } };

  ws.mergeCells("A5:L5");
  const title = ws.getCell("A5");
  title.value = p.type === "SI" ? "SYSTEM INTEGRATOR QUOTATION" : "COMMERCIAL QUOTATION";
  title.font = { size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(5).height = 24;

  const info: [string, string, string, string][] = [
    ["Proposal No.", p.number, "Customer", p.customerName],
    ["Proposal Date", formatDate(p.proposalDate), "Contact Person", p.contactPerson ?? ""],
    ["Valid Until", `${formatDate(p.validUntil)} (${p.validityDays} days)`, "Email / Phone", [p.customerEmail, p.customerPhone].filter(Boolean).join(" / ")],
    ["Project", p.projectName ?? "", "Billing Address", (p.billingAddress ?? "").replace(/\n/g, ", ")],
    ["Prepared By", p.preparedByName, "Customer GSTIN", p.customerGstin ?? ""],
  ];
  let r = 7;
  for (const [l1, v1, l2, v2] of info) {
    ws.getCell(`A${r}`).value = l1;
    ws.mergeCells(`A${r}:B${r}`);
    ws.getCell(`C${r}`).value = v1;
    ws.getCell(`D${r}`).value = l2;
    ws.mergeCells(`E${r}:L${r}`);
    ws.getCell(`E${r}`).value = v2;
    for (const c of [`A${r}`, `D${r}`]) ws.getCell(c).font = { bold: true, size: 10, color: { argb: "FF334155" } };
    for (const c of [`C${r}`, `E${r}`]) ws.getCell(c).font = { size: 10 };
    r++;
  }

  // ── Item table ──
  r += 1;
  const headerRow = r;
  const headers = ["S.No", "Item Code", "Item Name", "Description", "Configuration", "Qty", "Unit", "Unit Price (INR)", "Amount (INR)", "GST %", "Taxable (INR)", "GST (INR)"];
  ws.getRow(r).values = headers;
  ws.getRow(r).height = 30;
  ws.getRow(r).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = BOX;
  });
  ws.views = [{ state: "frozen", ySplit: headerRow, showGridLines: false }];

  const first = r + 1;
  const last = first + p.items.length - 1;
  const subtotalRow = last + 1;
  const discountRow = last + 2;

  p.items.forEach((it, i) => {
    const row = first + i;
    ws.getRow(row).values = [
      i + 1, it.itemCode ?? "", it.itemName, it.description, it.configuration, it.quantity, it.unit, it.unitPrice,
      { formula: `ROUND(F${row}*H${row},2)`, result: it.lineTotal },
      it.gstRate,
      { formula: `IF($I$${subtotalRow}=0,I${row},I${row}-I${row}/$I$${subtotalRow}*$I$${discountRow})`, result: it.taxableAmount },
      { formula: `K${row}*J${row}/100`, result: it.taxAmount },
    ];
    const rr = ws.getRow(row);
    rr.eachCell({ includeEmpty: true }, (c, col) => {
      if (col > 12) return;
      c.border = BOX;
      c.font = { size: 10 };
      c.alignment = { vertical: "top", wrapText: true, horizontal: col === 1 || col === 6 || col === 7 || col === 10 ? "center" : undefined };
      if ([8, 9, 11, 12].includes(col)) c.numFmt = INR_FMT;
    });
    if (it.priceOverridden) ws.getCell(`H${row}`).note = `Master price: ${it.masterPrice ?? "-"} (special price for this proposal)`;
    if (i % 2 === 1) rr.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }));
  });

  // ── Summary ──
  const label = (row: number, text: string, bold = false) => {
    ws.mergeCells(`F${row}:H${row}`);
    const c = ws.getCell(`F${row}`);
    c.value = text;
    c.alignment = { horizontal: "right" };
    c.font = { bold, size: 10 };
  };
  const value = (row: number, v: ExcelJS.CellValue, bold = false) => {
    const c = ws.getCell(`I${row}`);
    c.value = v;
    c.numFmt = INR_FMT;
    c.font = { bold, size: 10 };
    c.border = BOX;
  };

  label(subtotalRow, "Subtotal");
  value(subtotalRow, { formula: `SUM(I${first}:I${last})`, result: p.subtotal });

  label(discountRow, p.discountType === "PERCENT" ? `Discount (${p.discountValue}%)` : "Discount");
  value(discountRow, p.discountType === "PERCENT"
    ? { formula: `ROUND(I${subtotalRow}*${p.discountValue}/100,2)`, result: p.discountAmount }
    : { formula: `MIN(${p.discountValue},I${subtotalRow})`, result: p.discountAmount });

  let row = discountRow + 1;
  label(row, "Taxable Value");
  value(row, { formula: `I${subtotalRow}-I${discountRow}`, result: p.taxableAmount });
  const taxableRow = row;
  const taxRows: number[] = [];

  for (const b of p.taxBreakdown) {
    const sumif = `SUMIF($J$${first}:$J$${last},${b.rate},$K$${first}:$K$${last})`;
    if (p.supplyType === "INTRA") {
      row++; label(row, `CGST @ ${b.rate / 2}% (on ${b.rate}% items)`);
      value(row, { formula: `ROUND(${sumif}*${b.rate}/200,2)`, result: b.cgst }); taxRows.push(row);
      row++; label(row, `SGST @ ${b.rate / 2}% (on ${b.rate}% items)`);
      value(row, { formula: `ROUND(${sumif}*${b.rate}/200,2)`, result: b.sgst }); taxRows.push(row);
    } else if (p.supplyType === "INTER") {
      row++; label(row, `IGST @ ${b.rate}%`);
      value(row, { formula: `ROUND(${sumif}*${b.rate}/100,2)`, result: b.igst }); taxRows.push(row);
    }
  }
  if (p.supplyType === "NONE") {
    row++; label(row, "GST"); value(row, 0);
    ws.getCell(`J${row}`).value = "Not applicable";
  }

  row++;
  label(row, "GRAND TOTAL (INR)", true);
  value(row, { formula: `I${taxableRow}${taxRows.map((t) => `+I${t}`).join("")}`, result: p.grandTotal }, true);
  for (const col of ["F", "I"]) {
    ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
  }

  // ── Terms ──
  row += 2;
  const block = (heading: string, text: string) => {
    if (!text?.trim()) return;
    ws.mergeCells(`A${row}:L${row}`);
    ws.getCell(`A${row}`).value = heading;
    ws.getCell(`A${row}`).font = { bold: true, size: 11, color: { argb: BRAND } };
    row++;
    ws.mergeCells(`A${row}:L${row}`);
    const c = ws.getCell(`A${row}`);
    c.value = text;
    c.alignment = { wrapText: true, vertical: "top" };
    c.font = { size: 10 };
    ws.getRow(row).height = Math.min(400, 15 * (text.split("\n").length + Math.ceil(text.length / 180)));
    row += 2;
  };
  block("Payment Terms", p.paymentTerms);
  block("Terms & Conditions", p.termsAndConditions);
  block("Bank Details", s.company.bankDetails);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
