import { NextResponse } from "next/server";
import { prisma, num } from "@/lib/db";
import { ApiError, audit, notFound, parseBody, requireApiUser, route } from "@/lib/api";
import { can } from "@/lib/permissions";
import { serializeProduct } from "@/lib/products";
import { getProductSource } from "@/lib/product-source";
import { productInput } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/products/:id – admin only. Writes through to the sheet first so
// the next sync doesn't revert the change.
export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireApiUser(can.editMasterProducts, "Only admins can change master products and default prices.");
  const { id } = await params;
  const current = await prisma.product.findUnique({ where: { id } });
  if (!current) throw notFound("Product not found.");
  const input = await parseBody(req, productInput.partial());

  const next = {
    itemCode: current.itemCode,
    itemName: input.itemName ?? current.itemName,
    category: input.category ?? current.category,
    description: input.description ?? current.description,
    configuration: input.configuration ?? current.configuration,
    unit: input.unit ?? current.unit,
    sellingPrice: input.sellingPrice ?? num(current.sellingPrice),
    gstRate: input.gstRate ?? num(current.gstRate),
    hsnSac: input.hsnSac !== undefined ? input.hsnSac : current.hsnSac,
    brand: input.brand !== undefined ? input.brand : current.brand,
    status: (input.status ?? current.status) as "ACTIVE" | "INACTIVE",
  };

  let warning: string | null = null;
  if (current.source === "SHEET" || current.source === "SAMPLE") {
    const source = getProductSource();
    try {
      const found = await source.update(current.itemCode, next);
      if (!found) warning = `Row for ${current.itemCode} was not found in ${source.label}; the change is saved in the app only.`;
    } catch (err) {
      throw new ApiError(502, `Could not update ${source.label}: ${(err as Error).message}. The product was not changed.`);
    }
  }

  const { itemCode: _code, ...data } = next;
  const product = await prisma.product.update({ where: { id }, data });
  await audit(prisma, user.id, "PRODUCT_UPDATED", "Product", id, {
    itemCode: current.itemCode,
    ...(num(current.sellingPrice) !== next.sellingPrice ? { priceFrom: num(current.sellingPrice), priceTo: next.sellingPrice } : {}),
    ...(current.status !== next.status ? { statusFrom: current.status, statusTo: next.status } : {}),
  });
  return NextResponse.json({ product: serializeProduct(product), warning });
});
