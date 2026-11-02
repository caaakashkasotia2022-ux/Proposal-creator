// Product master sync: Google Sheet (or sample CSV) → local Product table.
// The local table is a cache used for fast search; proposals copy values
// out of it as snapshots, so syncing never alters historical proposals.

import { Prisma } from "@prisma/client";
import { prisma, num } from "./db";
import { parseProductRows, type ParseIssue } from "./product-columns";
import { getProductSource, sheetConfig } from "./product-source";
import { getJsonSetting, setJsonSetting } from "./settings";

export interface SyncResult {
  at: string;
  mode: "google" | "sample";
  ok: boolean;
  error?: string;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  priceChanges: number;
  issues: ParseIssue[];
  durationMs: number;
}

const LAST_SYNC_KEY = "products.lastSync";
let inflight: Promise<SyncResult> | null = null;

export function syncTtlSeconds(): number {
  const n = Number(process.env.SHEETS_SYNC_TTL_SECONDS);
  return Number.isFinite(n) && n >= 0 ? n : 300;
}

export async function getLastSync(): Promise<SyncResult | null> {
  return getJsonSetting<SyncResult>(LAST_SYNC_KEY);
}

/** Runs a sync; concurrent callers share the same in-flight run. */
export function syncProducts(userId?: string | null): Promise<SyncResult> {
  if (!inflight) {
    inflight = runSync(userId).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function runSync(userId?: string | null): Promise<SyncResult> {
  const started = Date.now();
  const source = getProductSource();
  const base: SyncResult = {
    at: new Date().toISOString(), mode: source.mode, ok: false, total: 0, created: 0, updated: 0,
    unchanged: 0, deactivated: 0, priceChanges: 0, issues: [], durationMs: 0,
  };

  let rows: unknown[][];
  try {
    rows = await source.read();
  } catch (err) {
    // Keep serving the last good data; record the failure.
    const result = { ...base, error: (err as Error).message, durationMs: Date.now() - started };
    await setJsonSetting(LAST_SYNC_KEY, result);
    return result;
  }

  const { products, issues } = parseProductRows(rows);
  const hardFailure = products.length === 0 && issues.some((i) => i.row === 1 && i.severity === "error");
  if (hardFailure) {
    const result = { ...base, issues, error: issues[0].message, durationMs: Date.now() - started };
    await setJsonSetting(LAST_SYNC_KEY, result);
    return result;
  }

  const existing = await prisma.product.findMany();
  const byCode = new Map(existing.map((p) => [p.itemCode, p]));
  const sourceTag = source.mode === "google" ? "SHEET" : "SAMPLE";
  const now = new Date();
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const priceLog: { itemCode: string; from: number; to: number }[] = [];
  let created = 0, updated = 0, unchanged = 0;

  for (const p of products) {
    const data = {
      itemName: p.itemName, category: p.category, description: p.description, configuration: p.configuration,
      unit: p.unit, sellingPrice: p.sellingPrice, gstRate: p.gstRate, hsnSac: p.hsnSac, brand: p.brand,
      status: p.status, source: sourceTag, sheetRow: p.sheetRow, lastSyncedAt: now,
    };
    const cur = byCode.get(p.itemCode);
    if (!cur) {
      created++;
      ops.push(prisma.product.create({ data: { itemCode: p.itemCode, ...data } }));
      continue;
    }
    const changed =
      cur.itemName !== p.itemName || cur.category !== p.category || cur.description !== p.description ||
      cur.configuration !== p.configuration || cur.unit !== p.unit || num(cur.sellingPrice) !== p.sellingPrice ||
      num(cur.gstRate) !== p.gstRate || cur.hsnSac !== p.hsnSac || cur.brand !== p.brand ||
      cur.status !== p.status || cur.source !== sourceTag || cur.sheetRow !== p.sheetRow;
    if (num(cur.sellingPrice) !== p.sellingPrice) priceLog.push({ itemCode: p.itemCode, from: num(cur.sellingPrice), to: p.sellingPrice });
    if (changed) {
      updated++;
      ops.push(prisma.product.update({ where: { id: cur.id }, data }));
    } else {
      unchanged++;
      ops.push(prisma.product.update({ where: { id: cur.id }, data: { lastSyncedAt: now } }));
    }
  }

  // Rows removed from the sheet → deactivate (never delete: proposals may reference them)
  const present = new Set(products.map((p) => p.itemCode));
  const toDeactivate = existing.filter(
    (p) => (p.source === "SHEET" || p.source === "SAMPLE") && !present.has(p.itemCode) && p.status === "ACTIVE",
  );
  if (toDeactivate.length) {
    ops.push(prisma.product.updateMany({ where: { id: { in: toDeactivate.map((p) => p.id) } }, data: { status: "INACTIVE" } }));
  }

  if (priceLog.length) {
    ops.push(prisma.auditLog.create({
      data: { userId: userId ?? null, action: "MASTER_PRICE_CHANGED_IN_SHEET", entity: "Product", details: JSON.stringify({ changes: priceLog }) },
    }));
  }

  await prisma.$transaction(ops);

  const result: SyncResult = {
    ...base, ok: true, total: products.length, created, updated, unchanged,
    deactivated: toDeactivate.length, priceChanges: priceLog.length, issues: issues.slice(0, 100),
    durationMs: Date.now() - started,
  };
  await setJsonSetting(LAST_SYNC_KEY, result);
  await prisma.auditLog.create({
    data: {
      userId: userId ?? null, action: "PRODUCT_SYNC", entity: "Product",
      details: JSON.stringify({ mode: result.mode, total: result.total, created, updated, deactivated: result.deactivated, issues: issues.length }),
    },
  });
  return result;
}

/**
 * Keeps the cache fresh. First ever call waits for the sync; afterwards a
 * stale cache is refreshed in the background so searches stay instant.
 */
export async function ensureFreshProducts(): Promise<void> {
  const last = await getLastSync();
  if (!last) {
    await syncProducts(null);
    return;
  }
  const age = (Date.now() - new Date(last.at).getTime()) / 1000;
  if (age > syncTtlSeconds()) {
    syncProducts(null).catch((err) => console.error("[sync] background sync failed", err));
  }
}

export function productSourceInfo() {
  const cfg = sheetConfig();
  return {
    mode: cfg.configured ? ("google" as const) : ("sample" as const),
    spreadsheetConfigured: Boolean(cfg.spreadsheetId),
    credentialsConfigured: cfg.hasCredentials,
    tab: cfg.tab,
    writeBack: cfg.writeBack,
    ttlSeconds: syncTtlSeconds(),
    sheetUrl: cfg.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/edit` : null,
  };
}

export function serializeProduct(p: {
  id: string; itemCode: string; itemName: string; category: string; description: string; configuration: string;
  unit: string; sellingPrice: Prisma.Decimal; gstRate: Prisma.Decimal; hsnSac: string | null; brand: string | null;
  status: string; source: string; updatedAt: Date; lastSyncedAt: Date | null;
}) {
  return {
    id: p.id, itemCode: p.itemCode, itemName: p.itemName, category: p.category, description: p.description,
    configuration: p.configuration, unit: p.unit, sellingPrice: num(p.sellingPrice), gstRate: num(p.gstRate),
    hsnSac: p.hsnSac, brand: p.brand, status: p.status, source: p.source,
    updatedAt: p.updatedAt.toISOString(), lastSyncedAt: p.lastSyncedAt?.toISOString() ?? null,
  };
}
export type ProductDTO = ReturnType<typeof serializeProduct>;
