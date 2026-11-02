import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Font, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ProposalDTO } from "../proposals";
import type { AppSettings } from "../settings";
import { amountInWords, formatINR } from "../money";
import { formatDate, fillTemplate } from "../utils";

// Built-in Helvetica has no ₹ glyph, so amounts are printed as "INR" figures.
const money = (n: number) => formatINR(n, { symbol: false });

// No automatic hyphenation ("Hun-dred") – wrap whole words only.
Font.registerHyphenationCallback((word) => [word]);

// Helvetica (WinAnsi) can't draw some Unicode symbols; map them to safe equivalents.
const pdfSafe = (s: string | null | undefined) =>
  (s ?? "").replace(/[→⇒]/g, "->").replace(/[←]/g, "<-").replace(/[•●]/g, "-").replace(/[✓✔]/g, "Yes").replace(/₹\s?/g, "INR ");

const C = {
  brand: "#1E3A8A",
  brandSoft: "#EEF2FF",
  ink: "#0F172A",
  soft: "#334155",
  muted: "#64748B",
  line: "#E2E8F0",
  zebra: "#F8FAFC",
  accent: "#B45309",
};

const s = StyleSheet.create({
  page: { paddingTop: 78, paddingBottom: 56, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 9, color: C.ink, lineHeight: 1.4 },
  header: { position: "absolute", top: 24, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: C.brand },
  wordmark: { fontFamily: "Helvetica-Bold", fontSize: 18, color: C.brand, letterSpacing: 1, lineHeight: 1 },
  wordSub: { fontSize: 6.5, color: C.muted, marginTop: 4, lineHeight: 1 },
  headerRight: { alignItems: "flex-end" },
  docType: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.ink, letterSpacing: 1.5 },
  small: { fontSize: 8, color: C.muted },
  footerLine: { position: "absolute", bottom: 34, left: 36, right: 36, borderTopWidth: 0.5, borderTopColor: C.line },
  footerLeft: { position: "absolute", bottom: 22, left: 36, fontSize: 7, color: C.muted },
  titleBlock: { marginBottom: 14 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 16, color: C.ink, marginBottom: 4 },
  pill: { alignSelf: "flex-start", backgroundColor: C.brandSoft, color: C.brand, fontFamily: "Helvetica-Bold", fontSize: 7, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3, letterSpacing: 0.8 },
  row: { flexDirection: "row" },
  metaGrid: { flexDirection: "row", borderWidth: 0.5, borderColor: C.line, borderRadius: 4, marginBottom: 14 },
  metaCell: { flex: 1, padding: 8, borderRightWidth: 0.5, borderRightColor: C.line },
  label: { fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  value: { fontSize: 9, color: C.ink },
  bold: { fontFamily: "Helvetica-Bold" },
  partyBox: { flex: 1, padding: 10, backgroundColor: C.zebra, borderRadius: 4 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.brand, marginBottom: 6, marginTop: 4 },
  para: { fontSize: 9, color: C.soft, marginBottom: 12 },
  th: { flexDirection: "row", backgroundColor: C.brand, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 8, paddingVertical: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 6 },
  cSno: { width: "5%", textAlign: "center" },
  cItem: { width: "45%", paddingHorizontal: 4 },
  cQty: { width: "8%", textAlign: "right", paddingRight: 4 },
  cUnit: { width: "8%", textAlign: "center" },
  cRate: { width: "13%", textAlign: "right", paddingRight: 4 },
  cGst: { width: "7%", textAlign: "center" },
  cAmt: { width: "14%", textAlign: "right", paddingRight: 6 },
  itemName: { fontFamily: "Helvetica-Bold", fontSize: 9, color: C.ink },
  itemCode: { fontSize: 7, color: C.muted, marginBottom: 2 },
  itemDesc: { fontSize: 8, color: C.soft, marginBottom: 2 },
  configBox: { marginTop: 2, paddingLeft: 6, borderLeftWidth: 1.5, borderLeftColor: C.brand },
  configLabel: { fontSize: 6.5, color: C.brand, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginBottom: 1 },
  configText: { fontSize: 7.5, color: C.soft },
  special: { fontSize: 6.5, color: C.accent, marginTop: 1 },
  summaryWrap: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  words: { width: "48%", padding: 10, backgroundColor: C.zebra, borderRadius: 4 },
  summary: { width: "48%" },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 8 },
  grand: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, paddingHorizontal: 8, backgroundColor: C.brand, color: "#FFFFFF", borderRadius: 3, marginTop: 4 },
  section: { marginTop: 16 },
  signature: { marginTop: 24, flexDirection: "row", justifyContent: "space-between" },
});

function Logo({ settings }: { settings: AppSettings }) {
  const logo = settings.company.logoPath;
  if (logo && /\.(png|jpe?g)$/i.test(logo)) {
    const file = path.join(process.cwd(), "public", logo.replace(/^\//, ""));
    if (fs.existsSync(file)) return <Image src={file} style={{ height: 30, objectFit: "contain" }} />;
  }
  return (
    <View>
      <Text style={s.wordmark}>IDCUBE</Text>
      <Text style={s.wordSub}>[Logo placeholder – upload in Settings]</Text>
    </View>
  );
}

function ProposalPdf({ p, settings }: { p: ProposalDTO; settings: AppSettings }) {
  const vars = { customerName: p.customerName, contactPerson: p.contactPerson ?? "Sir/Madam", projectName: p.projectName ?? "your project" };
  const typeLabel = p.type === "SI" ? "SYSTEM INTEGRATOR PROPOSAL" : "CUSTOMER PROPOSAL";

  return (
    <Document title={`${p.number} – ${p.customerName}`} author={settings.company.name} subject={p.projectName ?? "Proposal"} creator="IDCUBE Proposal System">
      <Page size="A4" style={s.page} wrap>
        <View style={s.header} fixed>
          <Logo settings={settings} />
          <View style={s.headerRight}>
            <Text style={s.docType}>PROPOSAL</Text>
            <Text style={s.small}>{p.number}</Text>
          </View>
        </View>

        <View style={s.titleBlock}>
          <Text style={s.pill}>{typeLabel}</Text>
          <Text style={[s.title, { marginTop: 6 }]}>{p.projectName || "Commercial Proposal"}</Text>
        </View>

        <View style={s.metaGrid}>
          {[
            ["Proposal No.", p.number],
            ["Date", formatDate(p.proposalDate)],
            ["Valid Until", `${formatDate(p.validUntil)}`],
            ["Prepared By", p.preparedByName],
          ].map(([l, v], i, arr) => (
            <View key={l} style={[s.metaCell, i === arr.length - 1 ? { borderRightWidth: 0 } : {}]}>
              <Text style={s.label}>{l}</Text>
              <Text style={[s.value, s.bold]}>{v}</Text>
            </View>
          ))}
        </View>

        <View style={[s.row, { gap: 10, marginBottom: 16 }]}>
          <View style={s.partyBox}>
            <Text style={s.label}>Prepared for</Text>
            <Text style={[s.value, s.bold]}>{p.customerName}</Text>
            {p.contactPerson ? <Text style={s.value}>Attn: {p.contactPerson}</Text> : null}
            {p.billingAddress ? <Text style={[s.value, { color: C.soft }]}>{p.billingAddress}</Text> : null}
            {[p.customerEmail, p.customerPhone].filter(Boolean).length ? (
              <Text style={[s.value, { color: C.soft }]}>{[p.customerEmail, p.customerPhone].filter(Boolean).join("  ·  ")}</Text>
            ) : null}
            {p.customerGstin ? <Text style={[s.small, { marginTop: 2 }]}>GSTIN: {p.customerGstin}</Text> : null}
          </View>
          <View style={s.partyBox}>
            <Text style={s.label}>{p.shippingAddress ? "Installation / Shipping address" : "Prepared by"}</Text>
            {p.shippingAddress ? (
              <Text style={[s.value, { color: C.soft }]}>{p.shippingAddress}</Text>
            ) : (
              <>
                <Text style={[s.value, s.bold]}>{settings.company.name}</Text>
                <Text style={[s.value, { color: C.soft }]}>{settings.company.address}</Text>
                <Text style={[s.small, { marginTop: 2 }]}>GSTIN: {settings.company.gstin}</Text>
              </>
            )}
          </View>
        </View>

        {p.introduction?.trim() ? (
          <View>
            <Text style={s.h2}>Introduction</Text>
            <Text style={s.para}>{fillTemplate(p.introduction, vars)}</Text>
          </View>
        ) : null}

        <Text style={s.h2}>Commercial Offer</Text>
        <View style={s.th} fixed={false}>
          <Text style={s.cSno}>#</Text>
          <Text style={s.cItem}>Item & Description</Text>
          <Text style={s.cQty}>Qty</Text>
          <Text style={s.cUnit}>Unit</Text>
          <Text style={s.cRate}>Unit Price</Text>
          <Text style={s.cGst}>GST</Text>
          <Text style={s.cAmt}>Amount (INR)</Text>
        </View>
        {p.items.map((it, i) => (
          <View key={it.id} style={[s.tr, i % 2 ? { backgroundColor: C.zebra } : {}]} wrap={false}>
            <Text style={s.cSno}>{i + 1}</Text>
            <View style={s.cItem}>
              <Text style={s.itemName}>{it.itemName}</Text>
              {it.itemCode || it.hsnSac ? (
                <Text style={s.itemCode}>{[it.itemCode, it.hsnSac ? `HSN/SAC ${it.hsnSac}` : null].filter(Boolean).join("  ·  ")}</Text>
              ) : null}
              {it.description ? <Text style={s.itemDesc}>{it.description}</Text> : null}
              {it.configuration ? (
                <View style={s.configBox}>
                  <Text style={s.configLabel}>CONFIGURATION</Text>
                  <Text style={s.configText}>{it.configuration}</Text>
                </View>
              ) : null}
            </View>
            <Text style={s.cQty}>{it.quantity}</Text>
            <Text style={s.cUnit}>{it.unit}</Text>
            <View style={s.cRate}>
              <Text>{money(it.unitPrice)}</Text>
              {it.priceOverridden ? <Text style={s.special}>Special price</Text> : null}
            </View>
            <Text style={s.cGst}>{p.supplyType === "NONE" ? "–" : `${it.gstRate}%`}</Text>
            <Text style={s.cAmt}>{money(it.lineTotal)}</Text>
          </View>
        ))}

        <View style={s.summaryWrap} wrap={false}>
          <View style={s.words}>
            <Text style={s.label}>Amount in words</Text>
            <Text style={[s.value, s.bold]}>{amountInWords(p.grandTotal)}</Text>
            {p.placeOfSupply ? <Text style={[s.small, { marginTop: 6 }]}>Place of supply: {p.placeOfSupply}</Text> : null}
            <Text style={[s.small, { marginTop: 2 }]}>
              {p.supplyType === "INTRA" ? "Intra-state supply (CGST + SGST)" : p.supplyType === "INTER" ? "Inter-state supply (IGST)" : "GST not applicable"}
            </Text>
          </View>
          <View style={s.summary}>
            <View style={s.sumRow}><Text>Subtotal</Text><Text>{money(p.subtotal)}</Text></View>
            {p.discountAmount > 0 ? (
              <View style={s.sumRow}>
                <Text>Discount{p.discountType === "PERCENT" ? ` (${p.discountValue}%)` : ""}</Text>
                <Text>- {money(p.discountAmount)}</Text>
              </View>
            ) : null}
            <View style={[s.sumRow, { borderTopWidth: 0.5, borderTopColor: C.line }]}><Text>Taxable value</Text><Text>{money(p.taxableAmount)}</Text></View>
            {p.taxBreakdown.flatMap((b) =>
              p.supplyType === "INTRA"
                ? [
                    <View key={`c${b.rate}`} style={s.sumRow}><Text style={{ color: C.soft }}>CGST @ {b.rate / 2}%</Text><Text>{money(b.cgst)}</Text></View>,
                    <View key={`s${b.rate}`} style={s.sumRow}><Text style={{ color: C.soft }}>SGST @ {b.rate / 2}%</Text><Text>{money(b.sgst)}</Text></View>,
                  ]
                : [<View key={`i${b.rate}`} style={s.sumRow}><Text style={{ color: C.soft }}>IGST @ {b.rate}%</Text><Text>{money(b.igst)}</Text></View>],
            )}
            <View style={s.grand}>
              <Text style={s.bold}>Grand Total (INR)</Text>
              <Text style={s.bold}>{money(p.grandTotal)}</Text>
            </View>
          </View>
        </View>

        {p.paymentTerms?.trim() ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Payment Terms</Text>
            <Text style={s.para}>{p.paymentTerms}</Text>
          </View>
        ) : null}

        {p.termsAndConditions?.trim() ? (
          <View style={s.section}>
            <Text style={s.h2}>Terms & Conditions</Text>
            <Text style={s.para}>{p.termsAndConditions}</Text>
          </View>
        ) : null}

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Validity</Text>
          <Text style={s.para}>
            This proposal is valid for {p.validityDays} days from {formatDate(p.proposalDate)}, i.e. until {formatDate(p.validUntil)}.
          </Text>
          <Text style={s.h2}>Bank Details</Text>
          <Text style={s.para}>{settings.company.bankDetails}</Text>
        </View>

        <View style={s.signature} wrap={false}>
          <View>
            <Text style={s.label}>Prepared by</Text>
            <Text style={[s.value, s.bold]}>{p.preparedByName}</Text>
            <Text style={s.value}>{settings.company.name}</Text>
            <Text style={s.small}>{settings.company.email}  ·  {settings.company.phone}</Text>
            <Text style={s.small}>{settings.company.website}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.label, { marginBottom: 28 }]}>Accepted by (customer)</Text>
            <Text style={s.small}>Name, signature, seal & date</Text>
          </View>
        </View>

        {/* Footer – declared last so it is painted on every page */}
        <View style={s.footerLine} fixed />
        <Text style={s.footerLeft} fixed>{settings.company.name}  ·  {settings.company.phone}  ·  {settings.company.email}</Text>
      </Page>
    </Document>
  );
}

export async function buildProposalPdf(p: ProposalDTO, settings: AppSettings): Promise<Buffer> {
  const safe = <T,>(v: T): T => JSON.parse(JSON.stringify(v), (_k, x) => (typeof x === "string" ? pdfSafe(x) : x));
  const raw = await renderToBuffer(<ProposalPdf p={safe(p)} settings={safe(settings)} />);
  return stampPageNumbers(raw);
}

/** Adds "Page X of Y" to every page (react-pdf's dynamic `render` text is unreliable). */
async function stampPageNumbers(pdf: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const text = `Page ${i + 1} of ${pages.length}`;
    const size = 7;
    page.drawText(text, {
      x: page.getWidth() - 36 - font.widthOfTextAtSize(text, size),
      y: 25,
      size,
      font,
      color: rgb(0.392, 0.455, 0.545),
    });
  });
  return Buffer.from(await doc.save());
}

export function documentFileName(p: ProposalDTO, ext: "pdf" | "xlsx") {
  const safe = `${p.number}_${p.customerName}`.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 100);
  return `${safe}.${ext}`;
}
