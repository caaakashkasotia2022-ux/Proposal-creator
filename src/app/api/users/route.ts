import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ApiError, audit, parseBody, requireApiUser, route } from "@/lib/api";
import { can } from "@/lib/permissions";
import { userInput } from "@/lib/validation";
import { userSelect } from "@/lib/users";

export const GET = route(async () => {
  await requireApiUser(can.manageUsers, "Only admins can manage users.");
  return NextResponse.json({ users: await prisma.user.findMany({ select: userSelect, orderBy: { name: "asc" } }) });
});

export const POST = route(async (req) => {
  const admin = await requireApiUser(can.manageUsers, "Only admins can manage users.");
  const { password, ...data } = await parseBody(req, userInput);
  if (!password) throw new ApiError(400, "A password is required for new users.");
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw new ApiError(409, "A user with this email already exists.");
  const user = await prisma.user.create({
    data: { ...data, passwordHash: await bcrypt.hash(password, 12) },
    select: userSelect,
  });
  await audit(prisma, admin.id, "USER_CREATED", "User", user.id, { email: user.email, role: user.role });
  return NextResponse.json({ user }, { status: 201 });
});
