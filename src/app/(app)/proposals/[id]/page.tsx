import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, canDownloadProposal, canEditProposal, canManageProposal, canViewProposal } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { expireStaleProposals, serializeProposal } from "@/lib/proposals";
import { emailConfig } from "@/lib/email";
import { ProposalDetail } from "@/components/proposals/proposal-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.proposal.findUnique({ where: { id }, select: { number: true } });
  return { title: p?.number ?? "Proposal" };
}

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  await expireStaleProposals();
  const p = await prisma.proposal.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      statusHistory: { orderBy: { createdAt: "desc" }, include: { changedBy: { select: { name: true } } } },
      priceOverrides: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
      emails: { orderBy: { createdAt: "desc" }, include: { sentBy: { select: { name: true } } } },
    },
  });
  if (!p || !canViewProposal(user, p)) notFound();
  const settings = await getSettings();
  const ec = emailConfig();

  return (
    <ProposalDetail
      proposal={serializeProposal(p)}
      company={settings.company}
      emailTemplates={settings.email}
      emailConfigured={ec.configured}
      perms={{
        edit: canEditProposal(user, p),
        manage: canManageProposal(user, p),
        download: canDownloadProposal(user, p),
        duplicate: can.createProposal(user),
      }}
    />
  );
}
