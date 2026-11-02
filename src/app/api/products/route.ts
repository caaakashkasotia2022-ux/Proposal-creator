import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, ilike } from "@/lib/db";
import { ApiError, audit, parseBody, requireApiUser, route } from "@/lib/api";
import { can } from "@/lib/permissions";
import { ensureFreshProducts, serializeProduct } from "@/lib/products";
import { getProductSource } from "@/lib/product-source";
import { productInput } from "@/lib/validation";

// GET /api/products?q=&category=&status=ACTIVE|INACTIVE|ALL&limit=
export const GET = route(async (req) => {
  await requireApiUser();
  await ensureFreshProducts();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const category = url.searchParams.get("category") ?? "";
  const status = url.searchParams.get("status") ?? "ACTIVE";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 1000);

  const where: Prisma.ProductWhereInput = {};
  if (status !== "ALL") where.status = status;
  if (category) where.category = category;
  if (q) {
    // Every word must match somewhere (name, code, category, description, configuration)
    where.AND = q.split(/\s+/).slice(0, 6).map((term) => ({
      OR: [
        { itemName: ilike(term) },
        { itemCode: ilike(term) },
        { category: ilike(term) },
        { description: ilike(term) },
        { configuration: ilike(term) },
        { brand: ilike(term) },
      ],
    }));
  }

  const [rows, categories] = await Promise.all([
    prisma.product.findMany({ where, orderBy: [{ category: "asc" }, { itemName: "asc" }], take: limit }),
    prisma.product.groupBy({ by: ["category"], where: status === "ALL" ? {} : { status }, _count: true, orderBy: { category: "asc" } }),
  ]);

  // Rank: name starts-with > code match > name contains > others
  const lower = q.toLowerCase();
  const score = (p: (typeof rows)[number]) =>
    !q ? 0 : p.itemName.toLowerCase().startsWith(lower) ? 0 : p.itemCode.toLowerCase().includes(lower) ? 1 : p.itemName.toLowerCase().includes(lower) ? 2 : 3;
  rows.sort((a, b) => score(a) - score(b));

  return NextResponse.json({
    products: rows.map(serializeProduct),
    categories: categories.map((c) => ({ name: c.category, count: c._count })),
  });
});

async function nextItemCode(): Promise<string> {
  const d = new Date();
  const prefix = `NEW-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}-`;
  const count = await prisma.product.count({ where: { itemCode: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

// POST /api/products – add a new item to the master (and write back to the sheet)
export const POST = route(async (req) => {
  const user = await requireApiUser(can.addProducts, "You are not authorised to add products to the master. Ask an admin.");
  const input = await parseBody(req, productInput);
  const itemCode = (input.itemCode || (await nextItemCode())).toUpperCase();
  if (await prisma.product.findUnique({ where: { itemCode } })) {
    throw new ApiError(409, `Item code ${itemCode} already exists.`);
  }

  const source = getProductSource();
  let sheetWarning: string | null = null;
  let synced = false;
  try {
    await source.append({ ...input, itemCode, category: input.category || "General", hsnSac: input.hsnSac, brand: input.brand });
    synced = true;
  } catch (err) {
    sheetWarning = `Saved in the app, but could not be written to ${source.label}: ${(err as Error).message}`;
  }

  const product = await prisma.product.create({
    data: {
      ...input,
      itemCode,
      category: input.category || "General",
      source: synced ? (source.mode === "google" ? "SHEET" : "SAMPLE") : "APP",
      lastSyncedAt: synced ? new Date() : null,
    },
  });
  await audit(prisma, user.id, "PRODUCT_CREATED", "Product", product.id, { itemCode, sellingPrice: input.sellingPrice, writtenToSheet: synced });
  return NextResponse.json({ product: serializeProduct(product), warning: sheetWarning }, { status: 201 });
});
