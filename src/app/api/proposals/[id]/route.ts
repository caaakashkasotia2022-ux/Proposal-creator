import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, forbidden, parseBody, requireApiUser, route } from "@/lib/api";
import { canEditProposal } from "@/lib/permissions";
import { loadProposal, saveProposal, serializeProposal } from "@/lib/proposals";
import { proposalInput } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  return NextResponse.json({ proposal: serializeProposal(await loadProposal(id, user)) });
});

export const PUT = route<Ctx>(async (req, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const input = await parseBody(req, proposalInput);
  const proposal = await saveProposal(user, input, id);
  return NextResponse.json({ proposal: serializeProposal(proposal) });
});

// Only drafts can be deleted; everything else is kept for history.
export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const p = await loadProposal(id, user);
  if (!canEditProposal(user, p)) throw forbidden("Only your own draft proposals can be deleted.");
  await prisma.proposal.delete({ where: { id } });
  await audit(prisma, user.id, "PROPOSAL_DELETED", "Proposal", id, { number: p.number });
  return NextResponse.json({ ok: true });
});
