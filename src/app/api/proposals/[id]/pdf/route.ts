import { forbidden, requireApiUser, route } from "@/lib/api";
import { canDownloadProposal } from "@/lib/permissions";
import { loadProposal, serializeProposal } from "@/lib/proposals";
import { getSettings } from "@/lib/settings";
import { buildProposalPdf, documentFileName } from "@/lib/documents/pdf";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const p = await loadProposal(id, user);
  if (!canDownloadProposal(user, p)) throw forbidden("Viewers can only download approved proposals.");
  const dto = serializeProposal(p);
  const pdf = await buildProposalPdf(dto, await getSettings());
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${documentFileName(dto, "pdf")}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
