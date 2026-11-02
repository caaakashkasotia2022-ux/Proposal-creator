# IDCUBE Proposal & Quotation System

A web application that lets IDCUBE employees create accurate, branded customer and System Integrator (SI) proposals in a few minutes. Products and prices come from a central Google Sheet. Proposals can be downloaded as PDF or Excel, or emailed directly to the customer.

> **Status:** fully working with sample data. Company details, logo, payment terms, tax defaults and email credentials are **clearly labelled placeholders**. See [What IDCUBE still needs to provide](#what-idcube-still-needs-to-provide).

---

## Features

| Area | What it does |
|---|---|
| **Guided proposal wizard** | Customer → Products → Commercials & Terms → Preview → Generate. Auto-numbered (`IDC/PRP/2026-27/C/0001`), drafts can be saved at any step. |
| **Product search** | Instant autocomplete by name, item code, category, or any keyword in the description/configuration. Category filter chips. Side-by-side product preview. Inactive products are hidden. |
| **Add New Item** | Saves to the product master (and writes the row back to the Google Sheet), or adds a one-off line for this proposal only. Permission-controlled. |
| **Quotation table** | Editable quantity, unit, rate, GST %, description and multi-line configuration per line, with quick-insert chips (Doors, Readers, Controllers…). Reorder and remove lines. |
| **Pricing rules** | The default price comes from the sheet. Overrides are permission-gated, clearly flagged as **Price modified** / **Special price**, can carry a reason, and are recorded in an audit trail. The master price is never changed by an override. |
| **GST** | Per-line GST rates. Intra-state (CGST + SGST), inter-state (IGST) or no GST. Percentage or fixed discount applied before tax. Breakdown by rate. Amount in words (Indian numbering). |
| **Server-side validation** | Every total is recomputed on the server in integer paise. Client-sent totals are ignored. |
| **Snapshots** | Each proposal stores the item name, description, configuration, quantity, quoted price, master price at that time, and tax. Later sheet changes never alter old proposals. |
| **Documents** | Print-ready A4 PDF with branded header and footer, page numbers and clean page breaks. Excel quotation with live formulas, Indian number format and print setup. |
| **Email** | Edit recipients, CC, subject and message; attach PDF and/or Excel; confirmation screen and delivery log. If SMTP isn't configured, users get download links and setup instructions. |
| **Dashboard & history** | Animated KPI tiles (Total, Draft, Sent, Approved, Rejected, Expired), pipeline and approved value, and recent activity. Searchable history with open, edit, duplicate, download, resend and status changes. Sent proposals expire automatically after their validity date. |
| **Customers** | Customer database with autocomplete inside the wizard. New customers are saved automatically. |
| **Roles** | Admin, Sales Employee (with optional *override price* and *add products* permissions) and Viewer. |
| **Audit** | Price overrides, master price changes detected in the sheet, product edits, sync runs, user and settings changes. |

## Quick start (local)

Requirements: **Node.js 20+** (tested on Node 24).

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET (see the file for a generator command)
npm run setup                 # creates the SQLite DB and loads demo data
npm run dev                   # http://localhost:3000
```

Demo accounts (shown on the login page in development only):

| Role | Email | Password |
|---|---|---|
| Admin | admin@idcube.local | Admin@12345 |
| Sales (override + add items) | sales@idcube.local | Sales@12345 |
| Sales (restricted) | sales2@idcube.local | Sales@12345 |
| Viewer | viewer@idcube.local | Viewer@12345 |

> ⚠️ Deactivate or change these accounts before going live (**Settings → Users & roles**).

Without Google credentials the app runs in **demo mode**. It reads products from `data/product-master-sample.csv`, and new or edited products are written back to that file, so the whole flow works offline.

## Useful scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Develop / build / run in production |
| `npm run setup` | Create the database schema and seed demo data |
| `npm run db:reset` | Wipe the local database and re-seed |
| `npm run sheet:template` | Regenerate `google-sheets/IDCUBE_Product_Master_Template.xlsx` |
| `npm test` | Unit tests for pricing, GST, discount allocation, money parsing and sheet parsing |
| `node scripts/smoke-test.mjs http://localhost:3000` | End-to-end API test (29 checks: permissions, pricing, snapshots, PDF/Excel, statuses) |
| `npm run typecheck` | TypeScript check |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): stack, data model, pricing engine, security, and open questions
- [docs/GOOGLE_SHEETS_SETUP.md](docs/GOOGLE_SHEETS_SETUP.md): create the product master sheet and connect it securely
- [docs/EMAIL_SETUP.md](docs/EMAIL_SETUP.md): Google Workspace, Microsoft 365 or a transactional provider
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): PostgreSQL/Supabase, Vercel or your own server, go-live checklist

## What IDCUBE still needs to provide

Everything below is a visible `[placeholder]` in the app and documents. Admins can fill most of it in **Settings** without code changes.

1. **Official logo** (PNG/JPG). Put it in `public/brand/` and set the path in Settings → Company.
2. **Brand colours.** Placeholder navy/indigo palette in `src/app/globals.css` (`--brand-*`).
3. **Registered address, phone, sales email, website, GSTIN, PAN and bank details.** Settings → Company.
4. **Standard payment terms and terms & conditions** (delivery, warranty, legal clauses). Settings → Proposals & tax.
5. **The real product list.** Paste it into the Google Sheet template; the `[SAMPLE]` rows are dummy data.
6. **Google service account and sheet ID.** See the Sheets setup guide.
7. **SMTP credentials** for a sending mailbox. See the email setup guide.
8. **Business decisions** to confirm (current behaviour in brackets):
   - Should Sales see each other's proposals? (No; only Admins see everything.)
   - Should the grand total be rounded to the nearest rupee? (No rounding.)
   - Proposal number format (`IDC/PRP/<FY>/<C|SI>/<0001>`, configurable prefix)
   - Should SI proposals use a separate price list? (No; same master price, overridable.)
