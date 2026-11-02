/* Demo seed: users, settings, product master (from the sample CSV), customers and proposals.
 * Run with `npm run db:seed`. Safe to re-run: existing records are kept. */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { calculate } from "../src/lib/calc";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { syncProducts } from "../src/lib/products";

const prisma = new PrismaClient();

const DEMO_USERS = [
  { email: "admin@idcube.local", name: "Demo Admin", role: "ADMIN", password: "Admin@12345", canOverridePrice: true, canAddProducts: true, designation: "Sales Head" },
  { email: "sales@idcube.local", name: "Demo Sales Executive", role: "SALES", password: "Sales@12345", canOverridePrice: true, canAddProducts: true, designation: "Key Account Manager" },
  { email: "sales2@idcube.local", name: "Demo Sales (Restricted)", role: "SALES", password: "Sales@12345", canOverridePrice: false, canAddProducts: false, designation: "Sales Associate" },
  { email: "viewer@idcube.local", name: "Demo Viewer", role: "VIEWER", password: "Viewer@12345", canOverridePrice: false, canAddProducts: false, designation: "Management" },
];

const DEMO_CUSTOMERS = [
  { companyName: "[DEMO] Northwind Tech Park Pvt. Ltd.", contactPerson: "Facilities Manager", email: "facilities@northwind.example", phone: "+91 90000 00001", billingAddress: "Plot 12, Sample Industrial Area\nBengaluru, Karnataka 560001", city: "Bengaluru", state: "Karnataka", gstin: "29ABCDE1234F1Z5" },
  { companyName: "[DEMO] Contoso Hospitals", contactPerson: "IT Head", email: "it@contoso-hospitals.example", phone: "+91 90000 00002", billingAddress: "45 Sample Road\nNew Delhi 110001", city: "New Delhi", state: "Delhi" },
  { companyName: "[DEMO] Fabrikam Systems (SI Partner)", contactPerson: "Pre-sales Lead", email: "presales@fabrikam.example", phone: "+91 90000 00003", billingAddress: "7 Partner Lane\nPune, Maharashtra 411001", city: "Pune", state: "Maharashtra" },
  { companyName: "[DEMO] Tailspin Logistics", contactPerson: "Security Manager", email: "security@tailspin.example", phone: "+91 90000 00004", billingAddress: "Warehouse 3, Sample Logistics Hub\nChennai, Tamil Nadu 600001", city: "Chennai", state: "Tamil Nadu" },
  { companyName: "[DEMO] Woodgrove University", contactPerson: "Registrar", email: "registrar@woodgrove.example", phone: "+91 90000 00005", billingAddress: "University Campus\nHyderabad, Telangana 500001", city: "Hyderabad", state: "Telangana" },
];

type Line = { code: string; qty: number; price?: number; config?: string };

const DEMO_PROPOSALS: { customer: number; type: "CUSTOMER" | "SI"; status: string; project: string; daysAgo: number; discount: number; supply: "INTRA" | "INTER"; lines: Line[] }[] = [
  { customer: 0, type: "CUSTOMER", status: "APPROVED", project: "Tower A – Access Control (24 doors)", daysAgo: 40, discount: 5, supply: "INTRA",
    lines: [{ code: "SMP-ACS-002", qty: 6, config: "Doors: 4 per controller\nTotal doors: 24\nReaders: 48 (IN/OUT)" }, { code: "SMP-RDR-002", qty: 48 }, { code: "SMP-LCK-001", qty: 24 }, { code: "SMP-ACC-001", qty: 24 }, { code: "SMP-SW-001", qty: 1 }, { code: "SMP-SRV-001", qty: 24 }] },
  { customer: 1, type: "CUSTOMER", status: "SENT", project: "OT & ICU Restricted Access", daysAgo: 6, discount: 0, supply: "INTER",
    lines: [{ code: "SMP-ACS-001", qty: 5 }, { code: "SMP-RDR-003", qty: 10 }, { code: "SMP-LCK-002", qty: 10 }, { code: "SMP-SW-003", qty: 1 }] },
  { customer: 2, type: "SI", status: "DRAFT", project: "Partner pricing – Corporate Campus", daysAgo: 1, discount: 10, supply: "INTER",
    lines: [{ code: "SMP-ACS-002", qty: 10 }, { code: "SMP-RDR-004", qty: 8, price: 29500 }, { code: "SMP-SW-001", qty: 1 }, { code: "SMP-SW-002", qty: 8 }] },
  { customer: 3, type: "CUSTOMER", status: "REJECTED", project: "Warehouse Vehicle Gate Automation", daysAgo: 25, discount: 0, supply: "INTER",
    lines: [{ code: "SMP-ENT-003", qty: 2 }, { code: "SMP-ENT-004", qty: 2 }, { code: "SMP-ENT-005", qty: 200 }, { code: "SMP-SRV-002", qty: 1 }] },
  { customer: 4, type: "CUSTOMER", status: "SENT", project: "Library Entrance Turnstiles", daysAgo: 50, discount: 3, supply: "INTER",
    lines: [{ code: "SMP-ENT-002", qty: 2 }, { code: "SMP-RDR-002", qty: 4 }, { code: "SMP-SRV-003", qty: 1 }] },
  { customer: 0, type: "CUSTOMER", status: "DRAFT", project: "Tower B – Visitor Management", daysAgo: 0, discount: 0, supply: "INTRA",
    lines: [{ code: "SMP-SW-003", qty: 1 }, { code: "SMP-SRV-002", qty: 1 }] },
];

function fy(d: Date) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

async function main() {
  console.log("→ Users");
  for (const u of DEMO_USERS) {
    const { password, ...data } = u;
    await prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...data, passwordHash: await bcrypt.hash(password, 12) } });
  }

  console.log("→ Settings");
  await prisma.setting.upsert({ where: { key: "app" }, update: {}, create: { key: "app", value: JSON.stringify(DEFAULT_SETTINGS) } });

  console.log("→ Product master (sample CSV)");
  const sync = await syncProducts(null);
  console.log(`  ${sync.ok ? "ok" : "FAILED"}: ${sync.total} products, ${sync.issues.length} issues${sync.error ? " – " + sync.error : ""}`);

  if ((await prisma.proposal.count()) > 0) {
    console.log("→ Proposals already exist – skipping demo customers/proposals.");
    return;
  }

  console.log("→ Customers");
  const customers = [];
  for (const c of DEMO_CUSTOMERS) customers.push(await prisma.customer.create({ data: c }));

  console.log("→ Proposals");
  const sales = await prisma.user.findUniqueOrThrow({ where: { email: "sales@idcube.local" } });
  const s = DEFAULT_SETTINGS.proposal;

  for (const d of DEMO_PROPOSALS) {
    const cust = customers[d.customer];
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - d.daysAgo);
    const validUntil = new Date(date);
    validUntil.setDate(validUntil.getDate() + s.defaultValidityDays);

    const products = await prisma.product.findMany({ where: { itemCode: { in: d.lines.map((l) => l.code) } } });
    const lines = d.lines.map((l) => {
      const p = products.find((x) => x.itemCode === l.code)!;
      const master = Number(p.sellingPrice);
      return { l, p, master, price: l.price ?? master, gst: Number(p.gstRate) };
    });
    const calc = calculate({
      items: lines.map((x) => ({ quantity: x.l.qty, unitPrice: x.price, gstRate: x.gst })),
      discountType: "PERCENT", discountValue: d.discount, supplyType: d.supply,
    });

    const year = fy(date);
    const seq = await prisma.proposalSequence.upsert({ where: { id: year }, update: { lastNumber: { increment: 1 } }, create: { id: year, lastNumber: 1 } });
    const number = `${s.numberPrefix}/${year}/${d.type === "SI" ? "SI" : "C"}/${String(seq.lastNumber).padStart(4, "0")}`;
    const intro = (d.type === "SI" ? s.siIntroduction : s.customerIntroduction);

    const proposal = await prisma.proposal.create({
      data: {
        number, type: d.type, status: d.status, customerId: cust.id, customerName: cust.companyName,
        contactPerson: cust.contactPerson, customerEmail: cust.email, customerPhone: cust.phone,
        billingAddress: cust.billingAddress, customerGstin: cust.gstin, projectName: d.project,
        proposalDate: date, validityDays: s.defaultValidityDays, validUntil,
        preparedById: sales.id, preparedByName: sales.name,
        introduction: intro, termsAndConditions: s.termsAndConditions, paymentTerms: s.paymentTerms,
        discountType: "PERCENT", discountValue: d.discount, supplyType: d.supply, placeOfSupply: cust.state,
        subtotal: calc.subtotal, discountAmount: calc.discountAmount, taxableAmount: calc.taxableAmount,
        cgstAmount: calc.cgst, sgstAmount: calc.sgst, igstAmount: calc.igst, taxTotal: calc.taxTotal,
        grandTotal: calc.grandTotal, taxBreakdown: JSON.stringify(calc.breakdown),
        sentAt: d.status !== "DRAFT" ? date : null, createdAt: date,
        items: {
          create: lines.map((x, i) => ({
            sortOrder: i, productId: x.p.id, itemCode: x.p.itemCode, itemName: x.p.itemName, category: x.p.category,
            description: x.p.description, configuration: x.l.config ?? x.p.configuration, unit: x.p.unit, hsnSac: x.p.hsnSac,
            quantity: x.l.qty, masterPrice: x.master, unitPrice: x.price, priceOverridden: x.price !== x.master,
            gstRate: x.gst, lineTotal: calc.lines[i].lineTotal, discountShare: calc.lines[i].discountShare,
            taxableAmount: calc.lines[i].taxableAmount, taxAmount: calc.lines[i].taxAmount,
          })),
        },
        statusHistory: {
          create: [
            { toStatus: "DRAFT", note: "Proposal created", changedById: sales.id, createdAt: date },
            ...(d.status !== "DRAFT" ? [{ fromStatus: "DRAFT", toStatus: "SENT", note: "Sent to customer", changedById: sales.id, createdAt: date }] : []),
            ...(["APPROVED", "REJECTED"].includes(d.status) ? [{ fromStatus: "SENT", toStatus: d.status, changedById: sales.id }] : []),
          ],
        },
      },
    });

    for (const x of lines.filter((x) => x.price !== x.master)) {
      await prisma.priceOverride.create({
        data: { proposalId: proposal.id, productId: x.p.id, itemCode: x.p.itemCode, itemName: x.p.itemName, masterPrice: x.master, overridePrice: x.price, reason: "Partner volume pricing (demo)", userId: sales.id },
      });
    }
    console.log(`  ${number}  ${d.status.padEnd(9)} ₹${calc.grandTotal.toLocaleString("en-IN")}`);
  }
}

main()
  .then(() => console.log("✓ Seed complete"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
