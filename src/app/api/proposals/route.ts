import { NextResponse } from "next/server";
import { prisma, num, ilike } from "@/lib/db";
import { parseBody, requireApiUser, route } from "@/lib/api";
import { can, proposalScope } from "@/lib/permissions";
import { expireStaleProposals, saveProposal, serializeProposal } from "@/lib/proposals";
import { proposalInput } from "@/lib/validation";

export const GET = route(async (req) => {
  const user = await requireApiUser();
  await expireStaleProposals();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status") ?? "";
  const rows = await prisma.proposal.findMany({
    where: {
      AND: [
        proposalScope(user),
        status ? { status } : {},
        q ? { OR: [{ number: ilike(q) }, { customerName: ilike(q) }, { projectName: ilike(q) }, { contactPerson: ilike(q) }] } : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json({
    proposals: rows.map((p) => ({
      id: p.id, number: p.number, type: p.type, status: p.status, customerName: p.customerName,
      projectName: p.projectName, grandTotal: num(p.grandTotal), proposalDate: p.proposalDate.toISOString(),
      validUntil: p.validUntil.toISOString(), preparedByName: p.preparedByName, preparedById: p.preparedById,
      createdAt: p.createdAt.toISOString(),
    })),
  });
});

export const POST = route(async (req) => {
  const user = await requireApiUser(can.createProposal, "Viewers cannot create proposals.");
  const input = await parseBody(req, proposalInput);
  const proposal = await saveProposal(user, input);
  return NextResponse.json({ proposal: serializeProposal(proposal) }, { status: 201 });
});
