import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, audit, notFound, parseBody, requireApiUser, route } from "@/lib/api";
import { can } from "@/lib/permissions";
import { customerInput } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireApiUser(can.manageCustomers);
  const { id } = await params;
  if (!(await prisma.customer.findUnique({ where: { id } }))) throw notFound("Customer not found.");
  const data = await parseBody(req, customerInput);
  const customer = await prisma.customer.update({ where: { id }, data });
  await audit(prisma, user.id, "CUSTOMER_UPDATED", "Customer", id, { companyName: customer.companyName });
  return NextResponse.json({ customer });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireApiUser(can.manageCustomers);
  const { id } = await params;
  const c = await prisma.customer.findUnique({ where: { id }, include: { _count: { select: { proposals: true } } } });
  if (!c) throw notFound("Customer not found.");
  if (c._count.proposals > 0) throw new ApiError(409, "This customer has proposals and cannot be deleted.");
  await prisma.customer.delete({ where: { id } });
  await audit(prisma, user.id, "CUSTOMER_DELETED", "Customer", id, { companyName: c.companyName });
  return NextResponse.json({ ok: true });
});
