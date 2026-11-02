// Application settings stored in the `Setting` table (key "app").
// Company details are deliberately PLACEHOLDERS – fill them in from
// Settings → Company once IDCUBE's official information is confirmed.

import { prisma } from "./db";

export interface CompanySettings {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  bankDetails: string;
  /** Optional PNG/JPG path under /public, e.g. "/brand/logo.png" */
  logoPath: string;
}

export interface ProposalSettings {
  numberPrefix: string;
  defaultValidityDays: number;
  defaultSupplyType: "INTRA" | "INTER" | "NONE";
  gstRates: number[];
  defaultGstRate: number;
  units: string[];
  customerIntroduction: string;
  siIntroduction: string;
  termsAndConditions: string;
  paymentTerms: string;
}

export interface EmailSettings {
  subjectTemplate: string;
  bodyTemplate: string;
}

export interface AppSettings {
  company: CompanySettings;
  proposal: ProposalSettings;
  email: EmailSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  company: {
    name: "IDCUBE Identification Systems Pvt. Ltd.",
    tagline: "[Company tagline – to be confirmed]",
    address: "[Registered office address – configure in Settings > Company]",
    phone: "[Phone – to be configured]",
    email: "[sales@your-domain – to be configured]",
    website: "[Website – to be configured]",
    gstin: "[GSTIN – to be configured]",
    pan: "[PAN – to be configured]",
    bankDetails: "[Bank name, account number, IFSC – to be configured by Finance]",
    logoPath: "",
  },
  proposal: {
    numberPrefix: "IDC/PRP",
    defaultValidityDays: 30,
    defaultSupplyType: "INTRA",
    gstRates: [0, 5, 12, 18, 28],
    defaultGstRate: 18,
    units: ["Nos", "Set", "License", "User", "Door", "Reader", "Month", "Year", "Lot", "Visit", "Day", "Meter"],
    customerIntroduction:
      "Dear {{contactPerson}},\n\nThank you for the opportunity to propose a solution for {{projectName}}. " +
      "Based on our understanding of your requirements, we are pleased to submit our techno-commercial proposal " +
      "covering the products, configuration and services detailed below.\n\n" +
      "We look forward to partnering with {{customerName}} on this project.",
    siIntroduction:
      "Dear {{contactPerson}},\n\nThank you for partnering with IDCUBE. Please find below our System Integrator " +
      "pricing for {{projectName}}. The prices quoted are partner prices and are intended for your use in preparing " +
      "the end-customer proposal.\n\nPlease reach out for technical assistance with design, configuration or deployment.",
    termsAndConditions:
      "1. Prices are quoted in Indian Rupees (INR). Applicable GST is shown separately.\n" +
      "2. Delivery: [X–Y] weeks from the date of receipt of a confirmed Purchase Order. [To be confirmed]\n" +
      "3. Installation, testing and commissioning are included only where explicitly listed as a line item.\n" +
      "4. Civil work, cabling, conduiting and power points are in the customer's scope unless quoted.\n" +
      "5. Warranty: [12] months from the date of supply against manufacturing defects. [To be confirmed]\n" +
      "6. Any change in quantities or scope may result in revised pricing.\n" +
      "7. [Additional standard IDCUBE terms – to be provided by Legal/Commercial team]",
    paymentTerms:
      "[XX]% advance along with the Purchase Order; balance [XX]% on delivery / commissioning. " +
      "[Payment terms to be confirmed by IDCUBE Finance]",
  },
  email: {
    subjectTemplate: "Proposal {{number}} – {{projectName}} | IDCUBE",
    bodyTemplate:
      "Dear {{contactPerson}},\n\nPlease find attached our proposal {{number}} for {{projectName}}.\n\n" +
      "Grand total: {{grandTotal}} (inclusive of applicable GST)\nValid until: {{validUntil}}\n\n" +
      "Please feel free to reach out if you have any questions or would like to discuss the proposal.\n\n" +
      "Best regards,\n{{preparedBy}}\n{{companyName}}",
  },
};

function merge<T extends object>(base: T, override: Partial<T> | undefined): T {
  return { ...base, ...(override ?? {}) };
}

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.setting.findUnique({ where: { key: "app" } });
  if (!row) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(row.value) as Partial<AppSettings>;
    return {
      company: merge(DEFAULT_SETTINGS.company, parsed.company),
      proposal: merge(DEFAULT_SETTINGS.proposal, parsed.proposal),
      email: merge(DEFAULT_SETTINGS.email, parsed.email),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const value = JSON.stringify(settings);
  await prisma.setting.upsert({ where: { key: "app" }, update: { value }, create: { key: "app", value } });
}

// Small key/value helpers for internal state (e.g. last product sync result)
export async function getJsonSetting<T>(key: string): Promise<T | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function setJsonSetting(key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value);
  await prisma.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } });
}
