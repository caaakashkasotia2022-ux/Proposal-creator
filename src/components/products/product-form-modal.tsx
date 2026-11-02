"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import type { ProductDTO } from "@/lib/products";
import { api } from "@/lib/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/field";

export interface ProductFormValues {
  itemCode: string;
  itemName: string;
  category: string;
  description: string;
  configuration: string;
  unit: string;
  sellingPrice: string;
  gstRate: string;
  hsnSac: string;
  brand: string;
  status: "ACTIVE" | "INACTIVE";
}

const EMPTY: ProductFormValues = {
  itemCode: "", itemName: "", category: "", description: "", configuration: "", unit: "Nos",
  sellingPrice: "", gstRate: "18", hsnSac: "", brand: "", status: "ACTIVE",
};

interface Props {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  product?: ProductDTO | null;
  initialName?: string;
  units: string[];
  gstRates: number[];
  categories?: string[];
  /** Proposal editor: allow adding as a one-off proposal item without touching the master */
  allowProposalOnly?: boolean;
  onSaved: (p: ProductDTO, opts: { savedToMaster: boolean }) => void;
}

export function ProductFormModal({ open, onClose, mode, product, initialName, units, gstRates, categories = [], allowProposalOnly, onSaved }: Props) {
  const [v, setV] = useState<ProductFormValues>(EMPTY);
  const [saveToMaster, setSaveToMaster] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaveToMaster(true);
    setV(product
      ? {
          itemCode: product.itemCode, itemName: product.itemName, category: product.category, description: product.description,
          configuration: product.configuration, unit: product.unit, sellingPrice: String(product.sellingPrice),
          gstRate: String(product.gstRate), hsnSac: product.hsnSac ?? "", brand: product.brand ?? "", status: product.status as "ACTIVE" | "INACTIVE",
        }
      : { ...EMPTY, itemName: initialName ?? "" });
  }, [open, product, initialName]);

  const set = (k: keyof ProductFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const price = Number(v.sellingPrice);
    if (!v.itemName.trim()) return setError("Item name is required.");
    if (v.sellingPrice.trim() === "" || !Number.isFinite(price) || price < 0) return setError("Enter a valid selling price (numbers only).");

    const payload = {
      itemCode: v.itemCode.trim(), itemName: v.itemName.trim(), category: v.category.trim() || "General",
      description: v.description, configuration: v.configuration, unit: v.unit, sellingPrice: price,
      gstRate: Number(v.gstRate), hsnSac: v.hsnSac || null, brand: v.brand || null, status: v.status,
    };

    if (allowProposalOnly && !saveToMaster) {
      // One-off proposal item – not stored in the master
      onSaved({
        id: "", ...payload, itemCode: payload.itemCode || "", hsnSac: payload.hsnSac, brand: payload.brand,
        source: "PROPOSAL", updatedAt: new Date().toISOString(), lastSyncedAt: null,
      }, { savedToMaster: false });
      onClose();
      return;
    }

    setSaving(true);
    try {
      const res = mode === "create"
        ? await api<{ product: ProductDTO; warning: string | null }>("/api/products", { method: "POST", json: payload })
        : await api<{ product: ProductDTO; warning: string | null }>(`/api/products/${product!.id}`, { method: "PATCH", json: payload });
      if (res.warning) toast.warning(res.warning);
      else toast.success(mode === "create" ? `${res.product.itemName} added to the product master` : "Product updated");
      onSaved(res.product, { savedToMaster: true });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={mode === "create" ? "Add new item" : `Edit ${product?.itemCode ?? "product"}`}
      description={mode === "create" ? "Create an item that isn't in the product master yet." : "Changes are written to the product master and apply to new proposals only."}
      footer={<>
        <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
        <Button type="submit" form="product-form" loading={saving}>
          {mode === "edit" ? "Save changes" : allowProposalOnly && !saveToMaster ? "Add to proposal" : "Save & add"}
        </Button>
      </>}>
      <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{error}</div>}
        <Field label="Item name" required className="sm:col-span-2">
          <Input value={v.itemName} onChange={set("itemName")} autoFocus placeholder="e.g. 2-Door IP Access Controller" />
        </Field>
        <Field label="Item code" hint={mode === "create" ? "Leave blank to auto-generate." : "Item codes can't be changed."}>
          <Input value={v.itemCode} onChange={set("itemCode")} disabled={mode === "edit"} placeholder="e.g. ACS-CTRL-2D" />
        </Field>
        <Field label="Category">
          <Input value={v.category} onChange={set("category")} list="category-list" placeholder="e.g. Access Control" />
          <datalist id="category-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea value={v.description} onChange={set("description")} rows={3} placeholder="Standard description printed on proposals" />
        </Field>
        <Field label="Configuration" className="sm:col-span-2" hint="Multiple lines supported – e.g. Doors: 2 ↵ Readers: 4">
          <Textarea value={v.configuration} onChange={set("configuration")} rows={3} />
        </Field>
        <Field label="Selling price (INR, excl. GST)" required>
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={v.sellingPrice} onChange={set("sellingPrice")} className="tabular" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit">
            <Select value={v.unit} onChange={set("unit")}>
              {[...new Set([...units, v.unit])].map((u) => <option key={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="GST %">
            <Select value={v.gstRate} onChange={set("gstRate")}>
              {[...new Set([...gstRates, Number(v.gstRate)])].map((g) => <option key={g} value={g}>{g}%</option>)}
            </Select>
          </Field>
        </div>
        <Field label="HSN / SAC"><Input value={v.hsnSac} onChange={set("hsnSac")} /></Field>
        <Field label="Brand / Make"><Input value={v.brand} onChange={set("brand")} /></Field>
        {mode === "edit" && (
          <Field label="Status">
            <Select value={v.status} onChange={set("status")}>
              <option value="ACTIVE">Active – visible in search</option>
              <option value="INACTIVE">Inactive – hidden from search</option>
            </Select>
          </Field>
        )}
        {allowProposalOnly && mode === "create" && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:col-span-2">
            <Toggle checked={saveToMaster} onChange={setSaveToMaster} label="Save to the central product master"
              description="Makes the item searchable for everyone and writes it to the Google Sheet. Turn off for a one-time item used only in this proposal." />
          </div>
        )}
        {mode === "edit" && (
          <p className="flex items-start gap-2 text-xs text-ink-muted sm:col-span-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Existing proposals keep the prices they were quoted at.
          </p>
        )}
      </form>
    </Modal>
  );
}
