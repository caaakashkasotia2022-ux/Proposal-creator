// Where product master rows come from.
//  • "google": Google Sheets API via a service account (server-side only)
//  • "sample": data/product-master-sample.csv – demo mode when no sheet is configured
// Credentials never leave the server; nothing here is imported by client code.

import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { JWT } from "google-auth-library";
import { buildRowForHeader, mapHeaderRow, PRODUCT_COLUMNS, type ParsedProduct } from "./product-columns";

export type SourceMode = "google" | "sample";

export interface ProductSource {
  mode: SourceMode;
  label: string;
  writable: boolean;
  read(): Promise<unknown[][]>;
  /** Appends a product row. */
  append(p: Omit<ParsedProduct, "sheetRow">): Promise<void>;
  /** Updates the row with the given item code. Returns false if not found. */
  update(itemCode: string, p: Omit<ParsedProduct, "sheetRow">): Promise<boolean>;
}

const SAMPLE_FILE = path.join(process.cwd(), "data", "product-master-sample.csv");

export function sheetConfig() {
  const spreadsheetId = (process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "").trim();
  const tab = (process.env.GOOGLE_SHEETS_TAB_NAME ?? "Products").trim() || "Products";
  const keyFile = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ?? "").trim();
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "").trim();
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  const writeBack = (process.env.SHEETS_WRITE_BACK ?? "true").toLowerCase() !== "false";
  const hasCredentials = Boolean(keyFile || (email && privateKey));
  return { spreadsheetId, tab, keyFile, email, privateKey, writeBack, hasCredentials, configured: Boolean(spreadsheetId && hasCredentials) };
}

function columnLetter(n: number): string {
  let s = "";
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// ── Google Sheets ───────────────────────────────────────────
class GoogleSheetSource implements ProductSource {
  mode = "google" as const;
  label = "Google Sheets";
  private client: JWT | null = null;
  constructor(private cfg: ReturnType<typeof sheetConfig>) {}

  get writable() {
    return this.cfg.writeBack;
  }

  private async jwt(): Promise<JWT> {
    if (this.client) return this.client;
    const scopes = [this.cfg.writeBack
      ? "https://www.googleapis.com/auth/spreadsheets"
      : "https://www.googleapis.com/auth/spreadsheets.readonly"];
    if (this.cfg.keyFile) {
      const json = JSON.parse(await fs.readFile(path.resolve(this.cfg.keyFile), "utf8"));
      this.client = new JWT({ email: json.client_email, key: json.private_key, scopes });
    } else {
      this.client = new JWT({ email: this.cfg.email, key: this.cfg.privateKey, scopes });
    }
    return this.client;
  }

  private url(range: string, suffix = "") {
    return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.cfg.spreadsheetId)}/values/${encodeURIComponent(range)}${suffix}`;
  }

  private async call<T>(opts: { url: string; method?: "GET" | "POST" | "PUT"; data?: unknown }): Promise<T> {
    try {
      const client = await this.jwt();
      const res = await client.request<T>({ ...opts, timeout: 20000 });
      return res.data;
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
      const status = e.response?.status;
      const msg = e.response?.data?.error?.message ?? e.message ?? "Unknown error";
      if (status === 403) throw new Error(`Google Sheets denied access (403). Share the sheet with the service account email. ${msg}`);
      if (status === 404) throw new Error(`Spreadsheet or tab not found (404). Check GOOGLE_SHEETS_SPREADSHEET_ID and GOOGLE_SHEETS_TAB_NAME. ${msg}`);
      throw new Error(`Google Sheets request failed: ${msg}`);
    }
  }

  async read(): Promise<unknown[][]> {
    const data = await this.call<{ values?: unknown[][] }>({
      url: this.url(this.cfg.tab, "?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING"),
    });
    return data.values ?? [];
  }

  private async header(): Promise<{ header: string[]; headerRow: number; rows: unknown[][] }> {
    const rows = await this.read();
    const idx = rows.findIndex((r) => {
      const m = mapHeaderRow(r.map((c) => String(c ?? "")));
      return m.itemName !== undefined && m.sellingPrice !== undefined;
    });
    if (idx === -1) throw new Error("Header row not found in the Google Sheet.");
    return { header: rows[idx].map((c) => String(c ?? "")), headerRow: idx, rows };
  }

  async append(p: Omit<ParsedProduct, "sheetRow">) {
    if (!this.writable) throw new Error("Write-back to Google Sheets is disabled (SHEETS_WRITE_BACK=false).");
    const { header } = await this.header();
    await this.call({
      url: this.url(`${this.cfg.tab}!A1`, ":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"),
      method: "POST",
      data: { values: [buildRowForHeader(header, p)] },
    });
  }

  async update(itemCode: string, p: Omit<ParsedProduct, "sheetRow">) {
    if (!this.writable) throw new Error("Write-back to Google Sheets is disabled (SHEETS_WRITE_BACK=false).");
    const { header, headerRow, rows } = await this.header();
    const codeIdx = mapHeaderRow(header).itemCode;
    if (codeIdx === undefined) return false;
    const i = rows.findIndex((r, n) => n > headerRow && String(r[codeIdx] ?? "").trim().toUpperCase() === itemCode.toUpperCase());
    if (i === -1) return false;
    const rowNo = i + 1;
    await this.call({
      url: this.url(`${this.cfg.tab}!A${rowNo}:${columnLetter(header.length - 1)}${rowNo}`, "?valueInputOption=USER_ENTERED"),
      method: "PUT",
      data: { values: [buildRowForHeader(header, p)] },
    });
    return true;
  }
}

// ── Local sample CSV (demo mode) ────────────────────────────
class SampleCsvSource implements ProductSource {
  mode = "sample" as const;
  label = "Sample CSV (demo mode)";
  writable = true;

  async read(): Promise<unknown[][]> {
    const text = await fs.readFile(SAMPLE_FILE, "utf8");
    const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: false });
    return parsed.data;
  }

  private async write(rows: unknown[][]) {
    await fs.writeFile(SAMPLE_FILE, Papa.unparse(rows as string[][], { newline: "\n" }) + "\n", "utf8");
  }

  async append(p: Omit<ParsedProduct, "sheetRow">) {
    const rows = (await this.read()).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
    const header = (rows[0] ?? PRODUCT_COLUMNS.map((c) => c.header)).map((c) => String(c));
    rows.push(buildRowForHeader(header, p));
    await this.write(rows);
  }

  async update(itemCode: string, p: Omit<ParsedProduct, "sheetRow">) {
    const rows = (await this.read()).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
    const header = rows[0].map((c) => String(c));
    const codeIdx = mapHeaderRow(header).itemCode ?? 0;
    const i = rows.findIndex((r, n) => n > 0 && String(r[codeIdx] ?? "").trim().toUpperCase() === itemCode.toUpperCase());
    if (i === -1) return false;
    rows[i] = buildRowForHeader(header, p);
    await this.write(rows);
    return true;
  }
}

export function getProductSource(): ProductSource {
  const cfg = sheetConfig();
  return cfg.configured ? new GoogleSheetSource(cfg) : new SampleCsvSource();
}
