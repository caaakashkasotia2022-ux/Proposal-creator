import { NextResponse } from "next/server";
import { requireApiUser, route } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getLastSync, productSourceInfo, syncProducts } from "@/lib/products";

export const GET = route(async () => {
  await requireApiUser();
  return NextResponse.json({ lastSync: await getLastSync(), source: productSourceInfo() });
});

export const POST = route(async () => {
  const user = await requireApiUser(can.syncProducts);
  const result = await syncProducts(user.id);
  return NextResponse.json({ result, source: productSourceInfo() }, { status: result.ok ? 200 : 502 });
});
