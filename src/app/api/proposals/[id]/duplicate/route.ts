import { NextResponse } from "next/server";
import { requireApiUser, route } from "@/lib/api";
import { can } from "@/lib/permissions";
import { duplicateProposal } from "@/lib/proposals";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (_req, { params }) => {
  const user = await requireApiUser(can.createProposal, "Viewers cannot create proposals.");
  const { id } = await params;
  const copy = await duplicateProposal(user, id);
  return NextResponse.json({ id: copy.id, number: copy.number }, { status: 201 });
});
