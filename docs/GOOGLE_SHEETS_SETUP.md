# Google Sheets product master: setup

The Google Sheet is the **single source of truth** for products and default selling prices. The app reads it with a **Google service account** on the server. Credentials never reach the browser, and the sheet stays private (shared only with your team and the service account).

## 1. Create the sheet from the template

1. Open Google Drive and choose **New → File upload**, then upload `google-sheets/IDCUBE_Product_Master_Template.xlsx`.
2. Open it and choose **File → Save as Google Sheets**.
3. The workbook has three tabs:
   - **Products**: the only tab the app reads. Keep the header row.
   - **Lists**: units and categories used by the drop-downs.
   - **Instructions**: rules for the people maintaining the sheet.
4. Replace the `[SAMPLE]` rows with IDCUBE's real products. You can paste bulk data straight from Excel; use *Paste special → Values only* to keep the formatting clean.

### Columns

| Column | Required | Notes |
|---|---|---|
| Item Code | ✅ | Unique and permanent. Used to match rows on every sync. |
| Item Name | ✅ | Shown in search and on proposals. |
| Category | | Used for filtering (e.g. Access Control, Readers, Software, Services). |
| Description | | Standard description printed on proposals. |
| Configuration | | Default technical configuration. Multi-line text is allowed (Ctrl+Enter). |
| Unit | | Nos, Set, License, Door, Month, Year… Defaults to *Nos*. |
| Selling Price | ✅ | INR, **excluding GST**, numbers only. `₹ 1,25,000` and `Rs. 500/-` are also accepted. |
| GST % | | 0 / 5 / 12 / 18 / 28. Blank means 18. `0.18` and `18%` are understood. |
| HSN/SAC | | Printed under the item on proposals. |
| Brand / Make | | Optional. |
| Status | | `Active` or `Inactive`. Inactive items are hidden from search. |
| Last Updated | | For your reference only. |

Column order doesn't matter, and common alternative headers are recognised (e.g. *SKU*, *Price*, *UOM*, *HSN*). Title rows above the header are ignored.

### How bad data is handled

- **Missing name, missing or invalid price, or duplicate item code:** the row is skipped and listed under *Product Master → row issues* with its row number. All other rows import normally.
- **Missing item code:** a stable `AUTO-…` code is generated and a warning is shown. Please add a real code.
- **Invalid GST:** defaults to 18% with a warning.
- **Row deleted from the sheet:** the product is marked *Inactive* in the app. It is never deleted, because old proposals reference it.
- **Sheet unreachable:** the app keeps using the last successful data and shows the error on the Product Master page.

## 2. Create a service account (one-time, by an admin)

1. Go to <https://console.cloud.google.com/> and create (or select) a project, e.g. `idcube-proposals`.
2. Go to **APIs & Services → Library**, search for **Google Sheets API** and click **Enable**.
3. Go to **APIs & Services → Credentials → Create credentials → Service account**. Name it `proposal-system` and skip the optional role steps.
4. Open the service account, go to **Keys → Add key → Create new key → JSON**, and download the file.
5. Copy the service account's email address (e.g. `proposal-system@idcube-proposals.iam.gserviceaccount.com`).

> If your Google Workspace blocks service account keys (`iam.disableServiceAccountKeyCreation`), ask your Workspace admin for an exception for this project.

## 3. Share the sheet with the service account

In the Google Sheet, click **Share** and add the service account email:
- **Editor**: if you want *Add New Item* and admin price edits in the app to be written back to the sheet (recommended).
- **Viewer**: for read-only. Also set `SHEETS_WRITE_BACK="false"`.

Do **not** make the sheet public or "anyone with the link".

## 4. Configure the app

Get the spreadsheet ID from the URL: `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`.

In `.env` (or your hosting provider's environment settings):

```env
GOOGLE_SHEETS_SPREADSHEET_ID="1AbC...xyz"
GOOGLE_SHEETS_TAB_NAME="Products"

# Option A – path to the JSON key (servers / Docker). Keep the file outside the repo.
GOOGLE_SERVICE_ACCOUNT_KEY_FILE="/etc/idcube/proposal-system.json"

# Option B – inline values (Vercel and other serverless hosts)
GOOGLE_SERVICE_ACCOUNT_EMAIL="proposal-system@idcube-proposals.iam.gserviceaccount.com"
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"

SHEETS_SYNC_TTL_SECONDS=300   # auto-refresh interval
SHEETS_WRITE_BACK="true"
```

Restart the app, open **Product Master** and click **Sync now**. The banner should read *Connected to Google Sheets*. Check **Settings → Integrations** if it doesn't.

## How syncing works

- Products are cached in the database for fast search. The cache refreshes automatically when it is older than `SHEETS_SYNC_TTL_SECONDS` (default 5 minutes), in the background so searches stay instant. **Sync now** forces a refresh.
- Matching is by **Item Code**. Changes to price, description and so on update the cache. Price changes are recorded in the audit log (*Master price changed in sheet*).
- **Existing proposals never change.** Each proposal stores its own snapshot of every line. When a draft is reopened, items whose master price has since changed show a *Master price has changed – use current price* hint.
- **New items added in the app** are appended to the sheet as a new row. **Admin edits** in the app update the matching row. If the sheet write fails, the user sees a warning and the item stays in the app, marked *Not in sheet*.

## Troubleshooting

| Message | Fix |
|---|---|
| `Google Sheets denied access (403)` | Share the sheet with the service account email. |
| `Spreadsheet or tab not found (404)` | Check `GOOGLE_SHEETS_SPREADSHEET_ID` and `GOOGLE_SHEETS_TAB_NAME`. |
| `Header row not found` | The tab needs at least *Item Name* and *Selling Price* headers. |
| `invalid_grant` / key errors | The private key is malformed. Keep the `\n` sequences and wrap the value in double quotes. |
