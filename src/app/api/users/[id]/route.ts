import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ApiError, audit, notFound, parseBody, requireApiUser, route } from "@/lib/api";
import { can } from "@/lib/permissions";
import { userInput } from "@/lib/validation";
import { userSelect } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const admin = await requireApiUser(can.manageUsers, "Only admins can manage users.");
  const { id } = await params;
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) throw notFound("User not found.");
  const { password, ...data } = await parseBody(req, userInput);

  if (id === admin.id && (data.role !== "ADMIN" || !data.active)) {
    throw new ApiError(400, "You cannot remove your own admin access or deactivate yourself.");
  }
  if (data.email !== current.email && (await prisma.user.findUnique({ where: { email: data.email } }))) {
    throw new ApiError(409, "Another user already uses this email.");
  }

  const user = await prisma.user.update({
    where: { id },
    data: { ...data, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
    select: userSelect,
  });
  await audit(prisma, admin.id, "USER_UPDATED", "User", id, {
    email: user.email, role: user.role, active: user.active, canOverridePrice: user.canOverridePrice,
    canAddProducts: user.canAddProducts, passwordReset: Boolean(password),
  });
  return NextResponse.json({ user });
});
