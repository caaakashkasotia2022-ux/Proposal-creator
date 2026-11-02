import { forbidden, requireApiUser, route } from "@/lib/api";
import { canDownloadProposal } from "@/lib/permissions";
import { loadProposal, serializeProposal } from "@/lib/proposals";
import { getSettings } from "@/lib/settings";
import { buildProposalExcel } from "@/lib/documents/excel";
import { documentFileName } from "@/lib/documents/pdf";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const p = await loadProposal(id, user);
  if (!canDownloadProposal(user, p)) throw forbidden("Viewers can only download approved proposals.");
  const dto = serializeProposal(p);
  const xlsx = await buildProposalExcel(dto, await getSettings());
  return new Response(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${documentFileName(dto, "xlsx")}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
