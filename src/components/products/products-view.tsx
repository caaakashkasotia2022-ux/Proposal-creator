"use client";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, Boxes, CheckCircle2, ExternalLink, FileSpreadsheet, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import type { ProductDTO, SyncResult } from "@/lib/products";
import { api } from "@/lib/client";
import { formatINR } from "@/lib/money";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { ProductFormModal } from "./product-form-modal";

interface SourceInfo { mode: "google" | "sample"; spreadsheetConfigured: boolean; credentialsConfigured: boolean; tab: string; writeBack: boolean; ttlSeconds: number; sheetUrl: string | null }

export function ProductsView({ perms, units, gstRates, source, lastSync: initialSync }: {
  perms: { add: boolean; edit: boolean; sync: boolean }; units: string[]; gstRates: number[]; source: SourceInfo; lastSync: SyncResult | null;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [products, setProducts] = useState<ProductDTO[] | null>(null);
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(initialSync);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [form, setForm] = useState<{ mode: "create" | "edit"; product?: ProductDTO } | null>(null);
  const [selected, setSelected] = useState<ProductDTO | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ q, category, status, limit: "1000" });
      const d = await api<{ products: ProductDTO[]; categories: { name: string; count: number }[] }>(`/api/products?${params}`);
      setProducts(d.products);
      setCategories(d.categories);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [q, category, status]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      const r = await api<{ result: SyncResult }>("/api/products/sync", { method: "POST" });
      setLastSync(r.result);
      toast.success("Product master synced", {
        description: `${r.result.total} products · ${r.result.created} new · ${r.result.updated} updated · ${r.result.deactivated} deactivated${r.result.issues.length ? ` · ${r.result.issues.length} row issue(s)` : ""}`,
      });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
      const d = await api<{ lastSync: SyncResult }>("/api/products/sync").catch(() => null);
      if (d) setLastSync(d.lastSync);
    } finally {
      setSyncing(false);
    }
  }

  const issues = lastSync?.issues ?? [];

  return (
    <div>
      <PageHeader title="Product master" description="Products, prices and configurations retrieved from the central Google Sheet."
        actions={<>
          {source.sheetUrl && <a href={source.sheetUrl} target="_blank" rel="noreferrer"><Button variant="secondary"><ExternalLink className="h-4 w-4" /> Open sheet</Button></a>}
          {perms.sync && <Button variant="secondary" onClick={sync} loading={syncing}>{!syncing && <RefreshCw className="h-4 w-4" />} Sync now</Button>}
          {perms.add && <Button onClick={() => setForm({ mode: "create" })}><Plus className="h-4 w-4" /> Add item</Button>}
        </>} />

      {/* Source status */}
      <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", source.mode === "google" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700")}>
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="text-sm">
            <div className="font-medium">
              {source.mode === "google" ? `Connected to Google Sheets · tab “${source.tab}”` : "Demo mode – using data/product-master-sample.csv"}
            </div>
            <div className="text-xs text-ink-muted">
              {lastSync ? <>Last sync {formatDateTime(lastSync.at)} · {lastSync.ok ? `${lastSync.total} rows` : <span className="font-medium text-rose-600">failed: {lastSync.error}</span>}</> : "Not synced yet"}
              {" · "}auto-refresh every {Math.round(source.ttlSeconds / 60)} min
              {source.mode === "sample" && " · see docs/GOOGLE_SHEETS_SETUP.md to connect the real sheet"}
            </div>
          </div>
        </div>
        {issues.length > 0 ? (
          <button onClick={() => setIssuesOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
            <AlertTriangle className="h-3.5 w-3.5" /> {issues.length} row issue{issues.length === 1 ? "" : "s"} in the sheet
          </button>
        ) : lastSync?.ok ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> All rows valid</span>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, category, description…" className="field h-9 pl-9" />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="md:w-56">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="md:w-40">
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ALL">All statuses</option>
          </Select>
        </div>

        {error ? <div className="p-6 text-sm text-rose-600">{error}</div>
          : products === null ? <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          : products.length === 0 ? <EmptyState icon={Boxes} title="No products found" description={q || category ? "Try a different search or category." : "Sync the product master or add a new item."} />
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11.5px] font-semibold uppercase tracking-wider text-ink-muted">
                    <th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5">Unit</th>
                    <th className="px-4 py-2.5 text-right">Selling price</th><th className="px-4 py-2.5 text-center">GST</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} onClick={() => setSelected(p)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                      <td className="max-w-[420px] px-4 py-2.5">
                        <div className="truncate font-medium">{p.itemName}</div>
                        <div className="truncate text-xs text-ink-muted">{p.itemCode}{p.description ? ` · ${p.description}` : ""}</div>
                      </td>
                      <td className="px-4 py-2.5 text-ink-soft">{p.category}</td>
                      <td className="px-4 py-2.5 text-ink-soft">{p.unit}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular">{formatINR(p.sellingPrice)}</td>
                      <td className="px-4 py-2.5 text-center text-ink-soft">{p.gstRate}%</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          {p.status === "ACTIVE" ? <Badge tone="emerald">Active</Badge> : <Badge>Inactive</Badge>}
                          {p.source === "APP" && <Badge tone="amber" >Not in sheet</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {perms.edit && <button onClick={() => setForm({ mode: "edit", product: p })} title="Edit" className="rounded-md p-1.5 text-ink-muted hover:bg-slate-100 hover:text-ink"><Pencil className="h-4 w-4" /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-slate-100 px-4 py-3 text-xs text-ink-muted">{products.length} product{products.length === 1 ? "" : "s"}</div>
            </div>
          )}
      </Card>

      <ProductFormModal open={Boolean(form)} onClose={() => setForm(null)} mode={form?.mode ?? "create"} product={form?.product}
        units={units} gstRates={gstRates} categories={categories.map((c) => c.name)} onSaved={() => load()} />

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.itemName ?? ""} description={selected ? `${selected.itemCode} · ${selected.category}` : ""}
        footer={perms.edit && selected ? <Button onClick={() => { setForm({ mode: "edit", product: selected }); setSelected(null); }}><Pencil className="h-4 w-4" /> Edit</Button> : undefined}>
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-ink-muted">Selling price</div><div className="font-semibold tabular">{formatINR(selected.sellingPrice)}</div></div>
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-ink-muted">Unit</div><div className="font-semibold">{selected.unit}</div></div>
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-ink-muted">GST</div><div className="font-semibold">{selected.gstRate}%</div></div>
            </div>
            {selected.description && <div><div className="label">Description</div><p className="text-ink-soft">{selected.description}</p></div>}
            {selected.configuration && <div><div className="label">Configuration</div><pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-ink-soft">{selected.configuration}</pre></div>}
            <div className="text-xs text-ink-muted">HSN/SAC {selected.hsnSac ?? "—"} · Brand {selected.brand ?? "—"} · Updated {formatDateTime(selected.updatedAt)}</div>
          </div>
        )}
      </Modal>

      <Modal open={issuesOpen} onClose={() => setIssuesOpen(false)} size="lg" title="Rows that need attention" description="Fix these in the Google Sheet, then sync again. Valid rows were imported normally.">
        <ul className="divide-y divide-slate-100 text-sm">
          <AnimatePresence>
            {issues.map((i, n) => (
              <motion.li key={n} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 py-2.5">
                <Badge tone={i.severity === "error" ? "rose" : "amber"}>Row {i.row}</Badge>
                <span className="text-ink-soft">{i.message}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </Modal>
    </div>
  );
}
