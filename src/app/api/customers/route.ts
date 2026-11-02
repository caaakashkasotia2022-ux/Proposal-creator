import { NextResponse } from "next/server";
import { prisma, ilike } from "@/lib/db";
import { audit, parseBody, requireApiUser, route } from "@/lib/api";
import { can } from "@/lib/permissions";
import { customerInput } from "@/lib/validation";

export const GET = route(async (req) => {
  await requireApiUser();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const customers = await prisma.customer.findMany({
    where: q
      ? { OR: [{ companyName: ilike(q) }, { contactPerson: ilike(q) }, { email: ilike(q) }, { city: ilike(q) }] }
      : {},
    orderBy: { companyName: "asc" },
    take: q ? 20 : 500,
    include: { _count: { select: { proposals: true } } },
  });
  return NextResponse.json({ customers });
});

export const POST = route(async (req) => {
  const user = await requireApiUser(can.manageCustomers);
  const data = await parseBody(req, customerInput);
  const customer = await prisma.customer.create({ data });
  await audit(prisma, user.id, "CUSTOMER_CREATED", "Customer", customer.id, { companyName: customer.companyName });
  return NextResponse.json({ customer }, { status: 201 });
});
