// End-to-end smoke test against a running server.
// Usage: node scripts/smoke-test.mjs [baseUrl]   (default http://localhost:3000)
const BASE = process.argv[2] ?? "http://localhost:3000";
let failures = 0;

function check(cond, label, extra = "") {
  console.log(`${cond ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!cond) failures++;
}

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const cookie = r.headers.get("set-cookie")?.split(";")[0];
  return { ok: r.ok, cookie };
}

function client(cookie) {
  return async (path, opts = {}) => {
    const r = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: { Cookie: cookie, ...(opts.json ? { "Content-Type": "application/json" } : {}) },
      body: opts.json ? JSON.stringify(opts.json) : undefined,
    });
    const type = r.headers.get("content-type") ?? "";
    const body = type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, body, type };
  };
}

const bad = await login("sales@idcube.local", "wrong");
check(!bad.ok, "rejects wrong password");
const unauth = await fetch(`${BASE}/api/products`);
check(unauth.status === 401, "API requires authentication");

const sales = client((await login("sales@idcube.local", "Sales@12345")).cookie);
const restricted = client((await login("sales2@idcube.local", "Sales@12345")).cookie);
const viewer = client((await login("viewer@idcube.local", "Viewer@12345")).cookie);
const admin = client((await login("admin@idcube.local", "Admin@12345")).cookie);

// Product search
const search = await sales("/api/products?q=reader");
check(search.status === 200 && search.body.products.length > 0, "product search by name", `(${search.body.products?.length} hits)`);
const byCode = await sales("/api/products?q=SMP-ACS-002");
check(byCode.body.products[0]?.itemCode === "SMP-ACS-002", "product search by item code");
const byKeyword = await sales("/api/products?q=liveness");
check(byKeyword.body.products.some((p) => p.itemCode === "SMP-RDR-004"), "search by description keyword");
const inactive = await sales("/api/products?q=magstripe");
check(inactive.body.products.length === 0, "inactive products hidden from search");
const cat = await sales("/api/products?category=Software");
check(cat.body.products.length > 0 && cat.body.products.every((p) => p.category === "Software"), "filter by category");

const ctrl = byCode.body.products[0];
const rdr = (await sales("/api/products?q=SMP-RDR-002")).body.products[0];

const proposal = (price) => ({
  customer: { companyName: "[TEST] Smoke Test Industries", contactPerson: "Test Contact", email: "test@example.com", billingAddress: "Test address" },
  type: "CUSTOMER", proposalDate: new Date().toISOString().slice(0, 10), validityDays: 30, projectName: "Smoke test project",
  introduction: "Intro", termsAndConditions: "T&C", paymentTerms: "50% advance", discountType: "PERCENT", discountValue: 10, supplyType: "INTRA",
  items: [
    { productId: ctrl.id, itemCode: ctrl.itemCode, itemName: ctrl.itemName, description: ctrl.description, configuration: "Doors: 4\nReaders: 8", unit: ctrl.unit, quantity: 2, unitPrice: price, gstRate: 18 },
    { productId: rdr.id, itemCode: rdr.itemCode, itemName: rdr.itemName, description: rdr.description, configuration: "", unit: rdr.unit, quantity: 8, unitPrice: rdr.sellingPrice, gstRate: 18 },
  ],
});

// Restricted user cannot override price
const denied = await restricted("/api/proposals", { method: "POST", json: proposal(ctrl.sellingPrice - 1000) });
check(denied.status === 403, "restricted sales user cannot override price", denied.body.error);
const viewerCreate = await viewer("/api/proposals", { method: "POST", json: proposal(ctrl.sellingPrice) });
check(viewerCreate.status === 403, "viewer cannot create proposals");

// Authorised override
const created = await sales("/api/proposals", { method: "POST", json: proposal(ctrl.sellingPrice - 1000) });
check(created.status === 201, "sales creates proposal with override", created.body.proposal?.number);
const p = created.body.proposal;
const expectedSubtotal = 2 * (ctrl.sellingPrice - 1000) + 8 * rdr.sellingPrice;
const disc = Math.round(expectedSubtotal * 10) / 100;
const taxable = expectedSubtotal - disc;
const half = Math.round(taxable * 9) / 100;
check(p.subtotal === expectedSubtotal, "server subtotal correct", `${p.subtotal}`);
check(p.discountAmount === disc && p.cgstAmount === half && p.sgstAmount === half, "discount & CGST/SGST correct");
check(Math.abs(p.grandTotal - (taxable + 2 * half)) < 0.001, "grand total correct", `${p.grandTotal}`);
check(p.items[0].priceOverridden && p.items[0].masterPrice === ctrl.sellingPrice, "override flagged with master snapshot");
check(p.priceOverrides.length === 1, "price override audited");
const masterAfter = (await sales("/api/products?q=SMP-ACS-002")).body.products[0];
check(masterAfter.sellingPrice === ctrl.sellingPrice, "master price unchanged by override");

// Tampered totals are ignored (server recomputes)
const tampered = await sales(`/api/proposals/${p.id}`, { method: "PUT", json: { ...proposal(ctrl.sellingPrice - 1000), grandTotal: 1, items: proposal(ctrl.sellingPrice - 1000).items.map((it, i) => ({ ...it, id: p.items[i].id })) } });
check(tampered.status === 200 && tampered.body.proposal.grandTotal === p.grandTotal, "client-supplied totals ignored");

// Documents
const pdf = await sales(`/api/proposals/${p.id}/pdf`);
check(pdf.status === 200 && pdf.type.includes("pdf") && pdf.body.subarray(0, 4).toString() === "%PDF", "PDF generated", `${pdf.body.length} bytes`);
const xlsx = await sales(`/api/proposals/${p.id}/excel`);
check(xlsx.status === 200 && xlsx.body.subarray(0, 2).toString() === "PK", "Excel generated", `${xlsx.body.length} bytes`);

// Email (not configured in dev)
const mail = await sales(`/api/proposals/${p.id}/email`, { method: "POST", json: { to: "test@example.com", subject: "x", message: "y" } });
check(mail.status === 503 || mail.status === 200, "email endpoint responds", `${mail.status} ${mail.body.error ?? ""}`);

// Viewer access rules
const viewerDraft = await viewer(`/api/proposals/${p.id}`);
check(viewerDraft.status === 404, "viewer cannot see drafts");
const st = await sales(`/api/proposals/${p.id}/status`, { method: "POST", json: { status: "SENT" } });
check(st.status === 200, "status → SENT");
const viewerPdfSent = await viewer(`/api/proposals/${p.id}/pdf`);
check(viewerPdfSent.status === 403, "viewer cannot download non-approved");
await sales(`/api/proposals/${p.id}/status`, { method: "POST", json: { status: "APPROVED" } });
const viewerPdf = await viewer(`/api/proposals/${p.id}/pdf`);
check(viewerPdf.status === 200, "viewer downloads approved proposal");

// Sent proposals are locked; duplicate creates a new draft
const edit = await sales(`/api/proposals/${p.id}`, { method: "PUT", json: proposal(ctrl.sellingPrice) });
check(edit.status === 403, "approved proposal cannot be edited");
const dup = await sales(`/api/proposals/${p.id}/duplicate`, { method: "POST" });
check(dup.status === 201 && dup.body.number !== p.number, "duplicate creates new draft", dup.body.number);

// Product master permissions
const restrictedAdd = await restricted("/api/products", { method: "POST", json: { itemName: "X", sellingPrice: 1 } });
check(restrictedAdd.status === 403, "restricted user cannot add products");
const salesEdit = await sales(`/api/products/${ctrl.id}`, { method: "PATCH", json: { sellingPrice: 1 } });
check(salesEdit.status === 403, "sales cannot edit master prices");

const sync = await admin("/api/products/sync", { method: "POST" });
check(sync.status === 200 && sync.body.result.ok, "manual sync", `${sync.body.result?.total} products`);

// Cleanup the duplicate draft
await sales(`/api/proposals/${dup.body.id}`, { method: "DELETE" });

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
