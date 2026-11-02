import { z } from "zod";

const optStr = (max = 2000) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

const money = z.coerce.number().finite().min(0, "must be zero or more").max(1e12);

export const productInput = z.object({
  itemCode: z.string().trim().max(40).regex(/^[A-Za-z0-9._\-/]*$/, "may only contain letters, numbers, - _ . /").optional().default(""),
  itemName: z.string().trim().min(2, "is required").max(200),
  category: z.string().trim().max(80).optional().default("General"),
  description: z.string().trim().max(5000).optional().default(""),
  configuration: z.string().trim().max(5000).optional().default(""),
  unit: z.string().trim().min(1).max(30).default("Nos"),
  sellingPrice: money,
  gstRate: z.coerce.number().min(0).max(100).default(18),
  hsnSac: optStr(20),
  brand: optStr(80),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});
export type ProductInput = z.infer<typeof productInput>;

export const customerInput = z.object({
  companyName: z.string().trim().min(2, "is required").max(200),
  contactPerson: optStr(120),
  email: z.string().trim().email("is not a valid email").max(200).optional().nullable().or(z.literal("")).transform((v) => v || null),
  phone: optStr(40),
  billingAddress: optStr(1000),
  shippingAddress: optStr(1000),
  gstin: z.string().trim().toUpperCase().max(15).optional().nullable().transform((v) => v || null),
  city: optStr(80),
  state: optStr(80),
  notes: optStr(2000),
});
export type CustomerInput = z.infer<typeof customerInput>;

export const proposalItemInput = z.object({
  id: z.string().optional().nullable(), // existing ProposalItem id when editing
  productId: z.string().optional().nullable(),
  itemCode: optStr(40),
  itemName: z.string().trim().min(1, "Item name is required").max(200),
  category: optStr(80),
  description: z.string().max(5000).default(""),
  configuration: z.string().max(5000).default(""),
  unit: z.string().trim().min(1).max(30).default("Nos"),
  hsnSac: optStr(20),
  quantity: z.coerce.number().finite().gt(0, "Quantity must be greater than 0").max(1e7),
  unitPrice: money,
  gstRate: z.coerce.number().min(0).max(100),
  overrideReason: optStr(300),
});
export type ProposalItemInput = z.infer<typeof proposalItemInput>;

export const proposalInput = z.object({
  customerId: z.string().optional().nullable(),
  saveCustomer: z.boolean().default(true),
  customer: z.object({
    companyName: z.string().trim().min(2, "Customer / company name is required").max(200),
    contactPerson: optStr(120),
    email: z.string().trim().email("Customer email is not valid").max(200).optional().nullable().or(z.literal("")).transform((v) => v || null),
    phone: optStr(40),
    billingAddress: optStr(1000),
    shippingAddress: optStr(1000),
    gstin: z.string().trim().toUpperCase().max(15).optional().nullable().transform((v) => v || null),
  }),
  type: z.enum(["CUSTOMER", "SI"]),
  proposalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Proposal date is required"),
  validityDays: z.coerce.number().int().min(1).max(365),
  projectName: optStr(200),
  introduction: z.string().max(10000).default(""),
  termsAndConditions: z.string().max(20000).default(""),
  paymentTerms: z.string().max(5000).default(""),
  notes: optStr(5000),
  discountType: z.enum(["PERCENT", "AMOUNT"]),
  discountValue: z.coerce.number().min(0).max(1e12),
  supplyType: z.enum(["INTRA", "INTER", "NONE"]),
  placeOfSupply: optStr(80),
  items: z.array(proposalItemInput).min(1, "Add at least one item to the proposal").max(500),
}).refine((v) => v.discountType !== "PERCENT" || v.discountValue <= 100, { message: "Discount % cannot exceed 100", path: ["discountValue"] });
export type ProposalInput = z.infer<typeof proposalInput>;

export const statusInput = z.object({
  status: z.enum(["DRAFT", "SENT", "APPROVED", "REJECTED", "EXPIRED"]),
  note: optStr(1000),
});

export const emailInput = z.object({
  to: z.string().trim().min(3).max(1000),
  cc: z.string().trim().max(1000).optional().default(""),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  message: z.string().trim().min(1, "Message is required").max(20000),
  attachPdf: z.boolean().default(true),
  attachExcel: z.boolean().default(false),
});

export function parseEmailList(raw: string): string[] {
  const list = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((e) => !z.string().email().safeParse(e).success);
  if (bad.length) throw new z.ZodError([{ code: "custom", path: ["to"], message: `Invalid email address: ${bad.join(", ")}` }]);
  return list;
}

export const userInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["ADMIN", "SALES", "VIEWER"]),
  canOverridePrice: z.boolean().default(false),
  canAddProducts: z.boolean().default(false),
  active: z.boolean().default(true),
  designation: optStr(120),
  phone: optStr(40),
  password: z.string().min(8, "Password must be at least 8 characters").max(200).optional().or(z.literal("")),
});
