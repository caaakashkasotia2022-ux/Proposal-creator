import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, forbidden, parseBody, requireApiUser, route } from "@/lib/api";
import { canManageProposal } from "@/lib/permissions";
import { changeStatus, loadProposal, serializeProposal } from "@/lib/proposals";
import { getSettings } from "@/lib/settings";
import { buildProposalPdf, documentFileName } from "@/lib/documents/pdf";
import { buildProposalExcel } from "@/lib/documents/excel";
import { emailConfig, sendMail } from "@/lib/email";
import { emailInput, parseEmailList } from "@/lib/validation";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async () => {
  await requireApiUser();
  const cfg = emailConfig();
  return NextResponse.json({ configured: cfg.configured, from: cfg.configured ? cfg.from : null });
});

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const p = await loadProposal(id, user);
  if (!canManageProposal(user, p)) throw forbidden("You cannot send this proposal.");
  if (!emailConfig().configured) {
    throw new ApiError(503, "Email sending is not configured. Download the PDF and send it from your mail client, or ask an admin to set up SMTP (see docs/EMAIL_SETUP.md).");
  }

  const input = await parseBody(req, emailInput);
  const to = parseEmailList(input.to);
  const cc = input.cc ? parseEmailList(input.cc) : [];
  if (!input.attachPdf && !input.attachExcel) throw new ApiError(400, "Attach at least the PDF or the Excel file.");

  const dto = serializeProposal(p);
  const settings = await getSettings();
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  if (input.attachPdf) attachments.push({ filename: documentFileName(dto, "pdf"), content: await buildProposalPdf(dto, settings), contentType: "application/pdf" });
  if (input.attachExcel) attachments.push({ filename: documentFileName(dto, "xlsx"), content: await buildProposalExcel(dto, settings), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  const sender = await prisma.user.findUnique({ where: { id: user.id } });
  const base = {
    proposalId: id, toAddress: to.join(", "), ccAddress: cc.join(", ") || null, subject: input.subject,
    body: input.message, attachments: attachments.map((a) => a.filename).join(", "), sentById: user.id,
  };

  try {
    const { messageId } = await sendMail({ to, cc, replyTo: sender?.email, subject: input.subject, text: input.message, attachments });
    await prisma.emailLog.create({ data: { ...base, status: "SENT", messageId } });
  } catch (err) {
    const message = (err as Error).message;
    await prisma.emailLog.create({ data: { ...base, status: "FAILED", error: message.slice(0, 1000) } });
    throw new ApiError(502, `The email could not be sent: ${message}`);
  }

  if (p.status === "DRAFT" || p.status === "EXPIRED") {
    await changeStatus(user, id, "SENT", `Emailed to ${to.join(", ")}`);
  } else {
    await prisma.proposalStatusHistory.create({
      data: { proposalId: id, fromStatus: p.status, toStatus: p.status, note: `Re-sent to ${to.join(", ")}`, changedById: user.id },
    });
  }
  return NextResponse.json({ ok: true, sentTo: to });
});
