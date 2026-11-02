"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, PackagePlus, Plus, Search } from "lucide-react";
import type { ProductDTO } from "@/lib/products";
import { api } from "@/lib/client";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/misc";

interface Props {
  onSelect: (p: ProductDTO) => void;
  onAddNew?: (query: string) => void;
  canAddNew: boolean;
  selectedIds?: Set<string>;
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded bg-brand-100 px-0.5 text-brand-900">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export function ProductSearch({ onSelect, onAddNew, canAddNew, selectedIds }: Props) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [results, setResults] = useState<ProductDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [preview, setPreview] = useState<ProductDTO | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // Debounced search
  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, category, limit: "40" });
        const data = await api<{ products: ProductDTO[]; categories: { name: string; count: number }[] }>(`/api/products?${params}`);
        if (id !== reqId.current) return;
        setResults(data.products);
        setCategories(data.categories);
        setActive(0);
        setError(null);
      } catch (e) {
        if (id === reqId.current) setError((e as Error).message);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 160);
    return () => clearTimeout(t);
  }, [q, category]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => setPreview(results[active] ?? null), [active, results]);

  function choose(p: ProductDTO) {
    onSelect(p);
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) setOpen(true);
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && open && results[active]) { e.preventDefault(); choose(results[active]); }
    if (e.key === "Escape") setOpen(false);
  }

  const showPanel = open;
  const catChips = useMemo(() => categories.slice(0, 12), [categories]);

  return (
    <div ref={boxRef} className="relative">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            placeholder="Search products by name, item code, category or keyword…"
            className="field h-11 pl-9 pr-10 text-[14.5px]"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls="product-results"
          />
          {loading && <Spinner className="absolute right-3 top-1/2 -translate-y-1/2" />}
        </div>
        {canAddNew && onAddNew && (
          <button type="button" onClick={() => onAddNew(q)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50/50 px-4 text-sm font-medium text-brand-700 transition hover:bg-brand-50">
            <PackagePlus className="h-4 w-4" /> Add new item
          </button>
        )}
      </div>

      <div className="scroll-thin mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
        {[{ name: "", count: 0 }, ...catChips].map((c) => (
          <button key={c.name || "all"} type="button" onClick={() => { setCategory(c.name); setOpen(true); }}
            className={cn("whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition",
              category === c.name ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink-soft ring-slate-200 hover:ring-slate-300")}>
            {c.name || "All categories"}{c.name && <span className="ml-1 opacity-60">{c.count}</span>}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            id="product-results"
            initial={{ opacity: 0, y: -4, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.16 }}
            className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lift"
          >
            {error ? (
              <div className="p-4 text-sm text-rose-600">{error}</div>
            ) : results.length === 0 && !loading ? (
              <div className="p-6 text-center">
                <p className="text-sm font-medium text-ink">No matching products</p>
                <p className="mt-1 text-xs text-ink-muted">Try another keyword or category{canAddNew ? ", or add it as a new item." : "."}</p>
                {canAddNew && onAddNew && (
                  <button type="button" onClick={() => { onAddNew(q); setOpen(false); }} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100">
                    <Plus className="h-3.5 w-3.5" /> Add &ldquo;{q || "new item"}&rdquo;
                  </button>
                )}
              </div>
            ) : (
              <div className="grid md:grid-cols-[1fr_300px]">
                <ul role="listbox" className="scroll-thin max-h-[340px] overflow-y-auto py-1">
                  {results.map((p, i) => {
                    const picked = selectedIds?.has(p.id);
                    return (
                      <li key={p.id} role="option" aria-selected={i === active}
                        onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}
                        className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors", i === active ? "bg-brand-50/70" : "")}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-ink"><Highlight text={p.itemName} q={q} /></span>
                            {picked && <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1 text-[10.5px] font-medium text-emerald-700"><Check className="h-3 w-3" />Added</span>}
                          </div>
                          <div className="truncate text-xs text-ink-muted"><Highlight text={p.itemCode} q={q} /> · {p.category}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium tabular text-ink">{formatINR(p.sellingPrice)}</div>
                          <div className="text-[11px] text-ink-muted">per {p.unit}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="hidden border-l border-slate-100 bg-slate-50/60 p-4 md:block">
                  {preview ? (
                    <div className="text-xs">
                      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">{preview.category}</div>
                      <div className="mt-1 text-sm font-semibold text-ink">{preview.itemName}</div>
                      <div className="mt-0.5 text-ink-muted">{preview.itemCode}{preview.hsnSac ? ` · HSN/SAC ${preview.hsnSac}` : ""}</div>
                      {preview.description && <p className="mt-3 leading-relaxed text-ink-soft">{preview.description}</p>}
                      {preview.configuration && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5">
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-brand-600">Configuration</div>
                          <pre className="whitespace-pre-wrap font-sans text-ink-soft">{preview.configuration}</pre>
                        </div>
                      )}
                      <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 text-ink-soft">
                        <span>GST {preview.gstRate}%</span>
                        <span className="font-semibold text-ink">{formatINR(preview.sellingPrice)} / {preview.unit}</span>
                      </div>
                      <p className="mt-3 text-[11px] text-ink-faint">Press Enter or click to add</p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
