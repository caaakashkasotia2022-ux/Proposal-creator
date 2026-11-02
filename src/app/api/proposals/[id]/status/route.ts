import { NextResponse } from "next/server";
import { forbidden, parseBody, requireApiUser, route } from "@/lib/api";
import { canManageProposal } from "@/lib/permissions";
import { changeStatus, loadProposal } from "@/lib/proposals";
import { statusInput } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const p = await loadProposal(id, user);
  if (!canManageProposal(user, p)) throw forbidden("You cannot change the status of this proposal.");
  const { status, note } = await parseBody(req, statusInput);
  const updated = await changeStatus(user, id, status, note);
  return NextResponse.json({ status: updated.status });
});
