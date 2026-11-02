import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiUser, route } from "@/lib/api";
import { can } from "@/lib/permissions";

export const GET = route(async (req) => {
  await requireApiUser(can.viewAuditLog, "Only admins can view the audit log.");
  const entity = new URL(req.url).searchParams.get("entity") ?? "";
  const logs = await prisma.auditLog.findMany({
    where: entity ? { entity } : {},
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { name: true } } },
  });
  return NextResponse.json({
    logs: logs.map((l) => ({ id: l.id, action: l.action, entity: l.entity, entityId: l.entityId, details: l.details, by: l.user?.name ?? "System", at: l.createdAt.toISOString() })),
  });
});
