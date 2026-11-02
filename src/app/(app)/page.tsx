import { prisma, num } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, proposalScope } from "@/lib/permissions";
import { expireStaleProposals } from "@/lib/proposals";
import { getLastSync, productSourceInfo } from "@/lib/products";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  await expireStaleProposals();
  const scope = proposalScope(user);

  const [grouped, recent, productCount, lastSync] = await Promise.all([
    prisma.proposal.groupBy({ by: ["status"], where: scope, _count: true, _sum: { grandTotal: true } }),
    prisma.proposal.findMany({ where: scope, orderBy: { updatedAt: "desc" }, take: 6 }),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    getLastSync(),
  ]);

  const counts: Record<string, { count: number; value: number }> = {};
  for (const g of grouped) counts[g.status] = { count: g._count, value: num(g._sum.grandTotal) };

  return (
    <DashboardView
      userName={user.name}
      canCreate={can.createProposal(user)}
      counts={counts}
      productCount={productCount}
      sourceMode={productSourceInfo().mode}
      lastSyncAt={lastSync?.at ?? null}
      lastSyncOk={lastSync?.ok ?? null}
      recent={recent.map((p) => ({
        id: p.id, number: p.number, customerName: p.customerName, projectName: p.projectName, status: p.status,
        grandTotal: num(p.grandTotal), updatedAt: p.updatedAt.toISOString(), type: p.type,
      }))}
    />
  );
}
