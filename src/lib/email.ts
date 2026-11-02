import "server-only";
import nodemailer from "nodemailer";

export function emailConfig() {
  const host = (process.env.SMTP_HOST ?? "").trim();
  return {
    configured: Boolean(host && process.env.EMAIL_FROM),
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.EMAIL_FROM ?? "",
    bcc: (process.env.EMAIL_BCC ?? "").trim() || undefined,
  };
}

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  attachments: { filename: string; content: Buffer; contentType: string }[];
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendMail(mail: OutgoingMail): Promise<{ messageId: string }> {
  const cfg = emailConfig();
  if (!cfg.configured) throw new Error("Email is not configured. Set SMTP_HOST and EMAIL_FROM in the environment.");
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a">${escapeHtml(mail.text).replace(/\n/g, "<br>")}</div>`;
  const info = await transport.sendMail({
    from: cfg.from,
    to: mail.to,
    cc: mail.cc?.length ? mail.cc : undefined,
    bcc: cfg.bcc,
    replyTo: mail.replyTo,
    subject: mail.subject,
    text: mail.text,
    html,
    attachments: mail.attachments,
  });
  return { messageId: info.messageId };
}
