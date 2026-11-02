import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, parseBody, requireApiUser, route } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getSettings, saveSettings } from "@/lib/settings";

const str = (max = 5000) => z.string().max(max);
const schema = z.object({
  company: z.object({
    name: str(200), tagline: str(300), address: str(1000), phone: str(100), email: str(200), website: str(200),
    gstin: str(30), pan: str(30), bankDetails: str(2000),
    logoPath: z.string().max(200).regex(/^$|^\/[\w\-./]+\.(png|jpe?g)$/i, "Logo must be a PNG/JPG path under /public, e.g. /brand/logo.png"),
  }),
  proposal: z.object({
    numberPrefix: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9\-/]+$/, "Prefix may contain letters, numbers, - and /"),
    defaultValidityDays: z.coerce.number().int().min(1).max(365),
    defaultSupplyType: z.enum(["INTRA", "INTER", "NONE"]),
    gstRates: z.array(z.coerce.number().min(0).max(100)).min(1).max(20),
    defaultGstRate: z.coerce.number().min(0).max(100),
    units: z.array(z.string().trim().min(1).max(30)).min(1).max(50),
    customerIntroduction: str(10000), siIntroduction: str(10000), termsAndConditions: str(20000), paymentTerms: str(5000),
  }),
  email: z.object({ subjectTemplate: str(300), bodyTemplate: str(10000) }),
});

export const GET = route(async () => {
  await requireApiUser();
  return NextResponse.json({ settings: await getSettings() });
});

export const PUT = route(async (req) => {
  const user = await requireApiUser(can.manageSettings, "Only admins can change settings.");
  const settings = await parseBody(req, schema);
  settings.proposal.gstRates = [...new Set(settings.proposal.gstRates)].sort((a, b) => a - b);
  await saveSettings(settings);
  await audit(prisma, user.id, "SETTINGS_UPDATED", "Setting", "app", {});
  return NextResponse.json({ settings });
});
