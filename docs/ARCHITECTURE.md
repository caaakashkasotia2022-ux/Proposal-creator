# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router) + React 19 + TypeScript | One deployable unit: UI, API routes and server rendering |
| Styling / motion | Tailwind CSS 3, Framer Motion, Inter, lucide icons | Consistent design system; restrained animation (respects *reduced motion*) |
| Database | Prisma ORM. SQLite locally, PostgreSQL/Supabase in production | Zero-setup development; the same schema runs on both |
| Product master | Google Sheets API v4 via a service account (`google-auth-library`) | Non-technical staff maintain prices in a sheet; credentials stay on the server |
| PDF | `@react-pdf/renderer` (server-side) + `pdf-lib` (page numbering) | Deterministic, print-ready A4 output without a headless browser |
| Excel | ExcelJS | Real formulas, Indian number format, print setup |
| Email | Nodemailer (SMTP) | Works with Google Workspace, Microsoft 365, SES, SendGrid… |
| Auth | Email + password (bcrypt, cost 12), HS256 JWT in an httpOnly cookie (`jose`) | No external identity dependency; can later move to Google/Microsoft SSO |

## Folder layout

```
prisma/schema.prisma        Data model
prisma/seed.ts              Demo users, settings, products, customers, proposals
data/product-master-sample.csv   Demo-mode product source
google-sheets/              Template to import into Google Sheets
src/lib/
  calc.ts                   Pricing & GST engine (pure; shared by browser and server)
  money.ts                  Paise arithmetic, INR formatting, amount in words, price parsing
  product-columns.ts        Sheet column definitions, tolerant header matching, row validation
  product-source.ts         Google Sheets / sample CSV reader and writer
  products.ts               Sync engine (sheet → DB cache), TTL refresh, audit
  proposals.ts              Save (snapshot + permission checks + override audit), numbering, status, duplicate, expiry
  permissions.ts            Roles and access rules
  documents/pdf.tsx, excel.ts   Document generators
  email.ts, auth.ts, session.ts, api.ts, settings.ts, validation.ts
src/app/(app)/…             Pages: dashboard, proposals, products, customers, settings
src/app/api/…               JSON API routes
src/components/…            UI components (wizard, product search, preview, …)
```

## Data model

- **User**: role (`ADMIN | SALES | VIEWER`), `canOverridePrice`, `canAddProducts`, `active`.
- **Customer**: company, contact, addresses, GSTIN.
- **Product**: local cache of the sheet (`itemCode` unique, `status`, `source = SHEET | SAMPLE | APP`).
- **Proposal**: a frozen copy of the customer details, text, commercial settings and every computed total (subtotal, discount, taxable value, CGST/SGST/IGST, grand total, per-rate breakdown as JSON).
- **ProposalItem**: snapshot of each line (name, description, configuration, unit, HSN, quantity, **master price at quoting time**, **quoted price**, override flag, GST rate, line/taxable/tax amounts).
- **ProposalStatusHistory**: every status change, with who, when and an optional note (including automatic expiry).
- **PriceOverride**: audit trail of proposal-specific rate changes (master price, previous price, new price, reason, user).
- **EmailLog**: every send attempt, with recipients, subject, attachments, result and error.
- **AuditLog**: product master changes, sheet price changes, sync runs, users, settings.
- **ProposalSequence**: per-financial-year counter for gap-free numbering.
- **Setting**: company details, proposal defaults, GST rates, units, text templates, last sync result.

## Pricing engine (`src/lib/calc.ts`)

1. Line total = round(quantity × rate), computed in integer **paise**.
2. Discount: percentage (rounded) or fixed amount (capped at the subtotal).
3. The discount is spread across lines in proportion to their value, using largest-remainder allocation so the parts add up exactly.
4. GST is calculated **per rate group** on the discounted taxable value. Intra-state supply gives CGST = SGST = round(taxable × rate / 200); inter-state supply gives IGST = round(taxable × rate / 100); *No GST* gives zero.
5. Grand total = taxable value + total tax.

The browser runs the same function for live totals. The server re-runs it on every save and ignores any totals the client sends. The Excel export re-expresses the same logic as formulas (`ROUND`, `SUMIF` per GST rate), with cached results identical to the PDF.

## Security

- All credentials (database, Google, SMTP, `AUTH_SECRET`) live only in server environment variables. No secrets are bundled into client code.
- Middleware rejects unauthenticated requests. Every API route re-checks the user against the database, so deactivation and permission changes apply immediately.
- **Role checks happen on the server**, including price overrides (rejected with 403 unless the user has permission), custom items, master edits, user and settings management, proposal visibility (Sales see their own proposals, Viewers only Sent/Approved) and downloads (Viewers: Approved only).
- Only drafts can be edited. Sent, approved or rejected proposals are revised by **Duplicate**, which preserves history.
- CSRF: `SameSite=Lax` cookies plus an Origin check on state-changing API calls. Security headers: X-Frame-Options DENY, nosniff, and a Referrer-Policy.
- Login throttling (5 failures → 10-minute lock per email/IP), bcrypt password hashing, and zod validation on every input.

## Open questions and dependencies

Placeholders are used until these are provided (see README → *What IDCUBE still needs to provide*): logo and brand colours, legal entity details, bank details, standard T&C and payment terms, the real product list, Google service account, SMTP mailbox, and a few business-rule confirmations (proposal visibility between Sales users, grand total rounding, SI price lists, approval workflow for large discounts).

Possible next steps: SSO (Google Workspace / Microsoft Entra), a manager approval step for discounts above a threshold, multiple price lists (Customer vs SI), version history between duplicated revisions, and analytics by product/category.
