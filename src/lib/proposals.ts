import "server-only";
import { Prisma } from "@prisma/client";
import { prisma, num, numOrNull } from "./db";
import { calculate, type SupplyType, type DiscountType } from "./calc";
import { ApiError, forbidden, notFound } from "./api";
import { can, canEditProposal, canViewProposal, type SessionUser } from "./permissions";
import { getSettings } from "./settings";
import type { ProposalInput } from "./validation";
import { addDays } from "./utils";

const fullInclude = {
  items: { orderBy: { sortOrder: "asc" as const } },
  statusHistory: { orderBy: { createdAt: "desc" as const }, include: { changedBy: { select: { name: true } } } },
  priceOverrides: { orderBy: { createdAt: "desc" as const }, include: { user: { select: { name: true } } } },
  emails: { orderBy: { createdAt: "desc" as const }, include: { sentBy: { select: { name: true } } } },
} satisfies Prisma.ProposalInclude;

export type ProposalWithRelations = Prisma.ProposalGetPayload<{ include: typeof fullInclude }>;

/** Indian financial year label, e.g. 2026-27 */
export function financialYear(d: Date): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

async function nextProposalNumber(tx: Prisma.TransactionClient, date: Date, type: "CUSTOMER" | "SI"): Promise<string> {
  const settings = await getSettings();
  const fy = financialYear(date);
  const seq = await tx.proposalSequence.upsert({
    where: { id: fy },
    update: { lastNumber: { increment: 1 } },
    create: { id: fy, lastNumber: 1 },
  });
  const typeCode = type === "SI" ? "SI" : "C";
  return `${settings.proposal.numberPrefix}/${fy}/${typeCode}/${String(seq.lastNumber).padStart(4, "0")}`;
}

export async function loadProposal(id: string, user: SessionUser): Promise<ProposalWithRelations> {
  const p = await prisma.proposal.findUnique({ where: { id }, include: fullInclude });
  if (!p || !canViewProposal(user, p)) throw notFound("Proposal not found.");
  return p;
}

const sameMoney = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Creates or updates a proposal. All totals are recomputed here from the
 * line items – client-side totals are never trusted.
 */
export async function saveProposal(user: SessionUser, input: ProposalInput, existingId?: string) {
  if (!can.createProposal(user)) throw forbidden("Viewers cannot create or edit proposals.");

  const existing = existingId
    ? await prisma.proposal.findUnique({ where: { id: existingId }, include: { items: true } })
    : null;
  if (existingId) {
    if (!existing) throw notFound("Proposal not found.");
    if (!canEditProposal(user, existing)) {
      throw forbidden(existing.status !== "DRAFT"
        ? "Only draft proposals can be edited. Duplicate this proposal to create a revision."
        : "You can only edit your own proposals.");
    }
  }
  const prevItems = new Map((existing?.items ?? []).map((i) => [i.id, i]));

  // Resolve master prices server-side
  const productIds = [...new Set(input.items.map((i) => i.productId).filter((x): x is string => Boolean(x)))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const lines = input.items.map((it) => {
    const prev = it.id ? prevItems.get(it.id) : undefined;
    const product = it.productId ? productMap.get(it.productId) : undefined;
    if (it.productId && !product) throw new ApiError(400, `Product for "${it.itemName}" no longer exists in the master.`);

    // Master price snapshot: keep the original one for existing lines, otherwise current master
    let masterPrice: number | null = null;
    if (prev && prev.productId === it.productId && prev.masterPrice !== null) masterPrice = num(prev.masterPrice);
    else if (product) masterPrice = num(product.sellingPrice);

    if (!product && !can.addProducts(user) && !(prev && !prev.productId)) {
      throw forbidden(`You are not authorised to add custom items ("${it.itemName}"). Ask an admin to add it to the product master.`);
    }

    const overridden = masterPrice !== null && !sameMoney(masterPrice, it.unitPrice);
    if (overridden && !can.overridePrice(user)) {
      // Allow unchanged legacy overrides on edit (e.g. set earlier by an authorised user)
      const unchangedLegacy = prev && sameMoney(num(prev.unitPrice), it.unitPrice);
      if (!unchangedLegacy) {
        throw forbidden(`You are not authorised to change the selling price of "${it.itemName}". The master price is ${masterPrice}.`);
      }
    }
    return { it, prev, product, masterPrice, overridden };
  });

  const calc = calculate({
    items: input.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, gstRate: i.gstRate })),
    discountType: input.discountType as DiscountType,
    discountValue: input.discountValue,
    supplyType: input.supplyType as SupplyType,
  });

  const proposalDate = new Date(`${input.proposalDate}T00:00:00`);
  const validUntil = addDays(proposalDate, input.validityDays);
  const preparedBy = existing ? await prisma.user.findUnique({ where: { id: existing.preparedById } }) : null;

  return prisma.$transaction(async (tx) => {
    // Customer: link existing or create a new customer record
    let customerId = input.customerId ?? null;
    if (customerId && !(await tx.customer.findUnique({ where: { id: customerId } }))) customerId = null;
    if (!customerId && input.saveCustomer) {
      const match = await tx.customer.findFirst({
        where: { companyName: input.customer.companyName, ...(input.customer.email ? { email: input.customer.email } : {}) },
      });
      customerId = match
        ? match.id
        : (await tx.customer.create({ data: { ...input.customer } })).id;
    }

    const data = {
      type: input.type,
      customerId,
      customerName: input.customer.companyName,
      contactPerson: input.customer.contactPerson,
      customerEmail: input.customer.email,
      customerPhone: input.customer.phone,
      billingAddress: input.customer.billingAddress,
      shippingAddress: input.customer.shippingAddress,
      customerGstin: input.customer.gstin,
      projectName: input.projectName,
      proposalDate,
      validityDays: input.validityDays,
      validUntil,
      introduction: input.introduction,
      termsAndConditions: input.termsAndConditions,
      paymentTerms: input.paymentTerms,
      notes: input.notes,
      discountType: input.discountType,
      discountValue: input.discountValue,
      supplyType: input.supplyType,
      placeOfSupply: input.placeOfSupply,
      subtotal: calc.subtotal,
      discountAmount: calc.discountAmount,
      taxableAmount: calc.taxableAmount,
      cgstAmount: calc.cgst,
      sgstAmount: calc.sgst,
      igstAmount: calc.igst,
      taxTotal: calc.taxTotal,
      grandTotal: calc.grandTotal,
      taxBreakdown: JSON.stringify(calc.breakdown),
    };

    let proposalId: string;
    if (existing) {
      await tx.proposal.update({ where: { id: existing.id }, data });
      await tx.proposalItem.deleteMany({ where: { proposalId: existing.id } });
      proposalId = existing.id;
    } else {
      const number = await nextProposalNumber(tx, proposalDate, input.type);
      const created = await tx.proposal.create({
        data: { ...data, number, status: "DRAFT", preparedById: user.id, preparedByName: user.name },
      });
      proposalId = created.id;
      await tx.proposalStatusHistory.create({
        data: { proposalId, fromStatus: null, toStatus: "DRAFT", note: "Proposal created", changedById: user.id },
      });
    }

    for (const [idx, l] of lines.entries()) {
      const c = calc.lines[idx];
      const item = await tx.proposalItem.create({
        data: {
          proposalId,
          sortOrder: idx,
          productId: l.product?.id ?? null,
          itemCode: l.it.itemCode ?? l.product?.itemCode ?? null,
          itemName: l.it.itemName,
          category: l.it.category ?? l.product?.category ?? null,
          description: l.it.description,
          configuration: l.it.configuration,
          unit: l.it.unit,
          hsnSac: l.it.hsnSac ?? l.product?.hsnSac ?? null,
          quantity: l.it.quantity,
          masterPrice: l.masterPrice,
          unitPrice: l.it.unitPrice,
          priceOverridden: l.overridden,
          gstRate: l.it.gstRate,
          lineTotal: c.lineTotal,
          discountShare: c.discountShare,
          taxableAmount: c.taxableAmount,
          taxAmount: c.taxAmount,
        },
      });

      // Audit every new/changed price override
      const prevPrice = l.prev ? num(l.prev.unitPrice) : null;
      if (l.overridden && (prevPrice === null || !sameMoney(prevPrice, l.it.unitPrice))) {
        await tx.priceOverride.create({
          data: {
            proposalId, productId: l.product?.id ?? null, itemCode: item.itemCode, itemName: item.itemName,
            masterPrice: l.masterPrice, previousPrice: prevPrice, overridePrice: l.it.unitPrice,
            reason: l.it.overrideReason, userId: user.id,
          },
        });
      }
    }

    if (existing && preparedBy) {
      await tx.auditLog.create({
        data: { userId: user.id, action: "PROPOSAL_UPDATED", entity: "Proposal", entityId: proposalId, details: JSON.stringify({ grandTotal: calc.grandTotal }) },
      });
    }
    return tx.proposal.findUniqueOrThrow({ where: { id: proposalId }, include: fullInclude });
  });
}

export async function changeStatus(user: SessionUser, id: string, status: string, note?: string | null) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.proposal.findUnique({ where: { id } });
    if (!p) throw notFound("Proposal not found.");
    if (p.status === status) return p;
    const updated = await tx.proposal.update({
      where: { id },
      data: { status, ...(status === "SENT" && !p.sentAt ? { sentAt: new Date() } : {}) },
    });
    await tx.proposalStatusHistory.create({
      data: { proposalId: id, fromStatus: p.status, toStatus: status, note: note ?? null, changedById: user.id },
    });
    return updated;
  });
}

export async function duplicateProposal(user: SessionUser, id: string) {
  const src = await prisma.proposal.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!src || !canViewProposal(user, src)) throw notFound("Proposal not found.");
  if (!can.createProposal(user)) throw forbidden();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.$transaction(async (tx) => {
    const number = await nextProposalNumber(tx, today, src.type as "CUSTOMER" | "SI");
    const { id: _id, number: _n, createdAt: _c, updatedAt: _u, sentAt: _s, status: _st, items, ...rest } = src;
    const copy = await tx.proposal.create({
      data: {
        ...rest,
        number,
        status: "DRAFT",
        proposalDate: today,
        validUntil: addDays(today, src.validityDays),
        preparedById: user.id,
        preparedByName: user.name,
        duplicatedFromId: src.id,
        items: {
          create: items.map(({ id: _i, proposalId: _p, ...it }) => it),
        },
      },
    });
    await tx.proposalStatusHistory.create({
      data: { proposalId: copy.id, toStatus: "DRAFT", note: `Duplicated from ${src.number}`, changedById: user.id },
    });
    return copy;
  });
}

/** Moves SENT proposals past their validity date to EXPIRED. Idempotent; cheap. */
export async function expireStaleProposals() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const stale = await prisma.proposal.findMany({ where: { status: "SENT", validUntil: { lt: today } }, select: { id: true } });
  if (!stale.length) return;
  await prisma.$transaction([
    prisma.proposal.updateMany({ where: { id: { in: stale.map((s) => s.id) } }, data: { status: "EXPIRED" } }),
    ...stale.map((s) =>
      prisma.proposalStatusHistory.create({
        data: { proposalId: s.id, fromStatus: "SENT", toStatus: "EXPIRED", note: "Validity period ended (automatic)" },
      }),
    ),
  ]);
}

// ── Serialisation (plain JSON for client components & documents) ──
export function serializeProposal(p: ProposalWithRelations) {
  return {
    id: p.id,
    number: p.number,
    type: p.type as "CUSTOMER" | "SI",
    status: p.status,
    customerId: p.customerId,
    customerName: p.customerName,
    contactPerson: p.contactPerson,
    customerEmail: p.customerEmail,
    customerPhone: p.customerPhone,
    billingAddress: p.billingAddress,
    shippingAddress: p.shippingAddress,
    customerGstin: p.customerGstin,
    projectName: p.projectName,
    proposalDate: p.proposalDate.toISOString(),
    validityDays: p.validityDays,
    validUntil: p.validUntil.toISOString(),
    preparedById: p.preparedById,
    preparedByName: p.preparedByName,
    introduction: p.introduction,
    termsAndConditions: p.termsAndConditions,
    paymentTerms: p.paymentTerms,
    notes: p.notes,
    currency: p.currency,
    discountType: p.discountType as DiscountType,
    discountValue: num(p.discountValue),
    supplyType: p.supplyType as SupplyType,
    placeOfSupply: p.placeOfSupply,
    subtotal: num(p.subtotal),
    discountAmount: num(p.discountAmount),
    taxableAmount: num(p.taxableAmount),
    cgstAmount: num(p.cgstAmount),
    sgstAmount: num(p.sgstAmount),
    igstAmount: num(p.igstAmount),
    taxTotal: num(p.taxTotal),
    grandTotal: num(p.grandTotal),
    taxBreakdown: JSON.parse(p.taxBreakdown || "[]") as { rate: number; taxable: number; cgst: number; sgst: number; igst: number; tax: number }[],
    sentAt: p.sentAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    items: p.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      itemCode: i.itemCode,
      itemName: i.itemName,
      category: i.category,
      description: i.description,
      configuration: i.configuration,
      unit: i.unit,
      hsnSac: i.hsnSac,
      quantity: num(i.quantity),
      masterPrice: numOrNull(i.masterPrice),
      unitPrice: num(i.unitPrice),
      priceOverridden: i.priceOverridden,
      gstRate: num(i.gstRate),
      lineTotal: num(i.lineTotal),
      taxableAmount: num(i.taxableAmount),
      taxAmount: num(i.taxAmount),
    })),
    statusHistory: p.statusHistory.map((h) => ({
      id: h.id, fromStatus: h.fromStatus, toStatus: h.toStatus, note: h.note,
      by: h.changedBy?.name ?? "System", at: h.createdAt.toISOString(),
    })),
    priceOverrides: p.priceOverrides.map((o) => ({
      id: o.id, itemName: o.itemName, itemCode: o.itemCode, masterPrice: numOrNull(o.masterPrice),
      previousPrice: numOrNull(o.previousPrice), overridePrice: num(o.overridePrice), reason: o.reason,
      by: o.user.name, at: o.createdAt.toISOString(),
    })),
    emails: p.emails.map((e) => ({
      id: e.id, to: e.toAddress, cc: e.ccAddress, subject: e.subject, status: e.status, error: e.error,
      attachments: e.attachments, by: e.sentBy.name, at: e.createdAt.toISOString(),
    })),
  };
}
export type ProposalDTO = ReturnType<typeof serializeProposal>;
