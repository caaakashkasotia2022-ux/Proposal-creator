import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../src/lib/calc";
import { amountInWords, parseMoney } from "../src/lib/money";
import { parseProductRows } from "../src/lib/product-columns";

test("line totals, subtotal and intra-state GST", () => {
  const r = calculate({
    items: [{ quantity: 3, unitPrice: 1000, gstRate: 18 }, { quantity: 2, unitPrice: 250.5, gstRate: 18 }],
    discountType: "PERCENT", discountValue: 0, supplyType: "INTRA",
  });
  assert.equal(r.subtotal, 3501);
  assert.equal(r.cgst, 315.09);
  assert.equal(r.sgst, 315.09);
  assert.equal(r.grandTotal, 4131.18);
});

test("percent discount is applied before GST and spread exactly across lines", () => {
  const r = calculate({
    items: [{ quantity: 1, unitPrice: 333.33, gstRate: 18 }, { quantity: 1, unitPrice: 333.33, gstRate: 18 }, { quantity: 1, unitPrice: 333.34, gstRate: 5 }],
    discountType: "PERCENT", discountValue: 10, supplyType: "INTER",
  });
  assert.equal(r.subtotal, 1000);
  assert.equal(r.discountAmount, 100);
  assert.equal(r.lines.reduce((a, l) => a + Math.round(l.discountShare * 100), 0), 10000);
  assert.equal(r.taxableAmount, 900);
  assert.equal(r.breakdown.length, 2);
  assert.equal(r.igst, r.breakdown.reduce((a, b) => a + b.igst, 0));
  assert.equal(r.grandTotal, Math.round((r.taxableAmount + r.taxTotal) * 100) / 100);
});

test("fixed discount cannot exceed subtotal; NONE supply has no GST", () => {
  const r = calculate({ items: [{ quantity: 1, unitPrice: 500, gstRate: 18 }], discountType: "AMOUNT", discountValue: 900, supplyType: "NONE" });
  assert.equal(r.discountAmount, 500);
  assert.equal(r.taxTotal, 0);
  assert.equal(r.grandTotal, 0);
});

test("floating-point safe quantities and rates", () => {
  const r = calculate({ items: [{ quantity: 0.1, unitPrice: 0.2, gstRate: 0 }, { quantity: 3, unitPrice: 19.99, gstRate: 0 }], discountType: "PERCENT", discountValue: 0, supplyType: "INTRA" });
  assert.equal(r.subtotal, 59.99); // 0.02 + 59.97
});

test("money parsing and words", () => {
  assert.equal(parseMoney("₹ 1,25,000.50"), 125000.5);
  assert.equal(parseMoney("Rs. 500/-"), 500);
  assert.equal(parseMoney("abc"), null);
  assert.equal(amountInWords(125000.5), "Rupees One Lakh Twenty Five Thousand and Fifty Paise Only");
});

test("sheet parsing tolerates bad rows", () => {
  const { products, issues } = parseProductRows([
    ["IDCUBE Product Master"],
    ["Code", "Name", "Price", "GST", "Status"],
    ["A1", "Reader", "₹4,200", "18%", ""],
    ["A1", "Duplicate", "100", "", ""],
    ["", "No code item", "50", "0.18", "Inactive"],
    ["B2", "Bad price", "call us", "", ""],
    ["", "", "", "", ""],
  ]);
  assert.equal(products.length, 2);
  assert.equal(products[0].sellingPrice, 4200);
  assert.equal(products[1].gstRate, 18);
  assert.equal(products[1].status, "INACTIVE");
  assert.equal(issues.filter((i) => i.severity === "error").length, 2);
});
