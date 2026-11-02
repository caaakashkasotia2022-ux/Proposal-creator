import { notFound, redirect } from "next/navigation";
import { prisma, num } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canEditProposal, canViewProposal } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { serializeProposal, type ProposalWithRelations } from "@/lib/proposals";
import { ProposalEditor } from "@/components/proposals/proposal-editor";

export const metadata = { title: "Edit proposal" };
export const dynamic = "force-dynamic";

export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = await prisma.proposal.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } }, statusHistory: { include: { changedBy: { select: { name: true } } } }, priceOverrides: { include: { user: { select: { name: true } } } }, emails: { include: { sentBy: { select: { name: true } } } } },
  });
  if (!p || !canViewProposal(user, p)) notFound();
  if (!canEditProposal(user, p)) redirect(`/proposals/${id}`);

  // Current master prices, so the editor can flag items whose master price changed
  const productIds = p.items.map((i) => i.productId).filter((x): x is string => Boolean(x));
  const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sellingPrice: true } });
  const currentMasterPrices = Object.fromEntries(products.map((x) => [x.id, num(x.sellingPrice)]));

  return (
    <ProposalEditor mode="edit" user={user} settings={await getSettings()}
      initial={serializeProposal(p as ProposalWithRelations)} currentMasterPrices={currentMasterPrices} />
  );
}
