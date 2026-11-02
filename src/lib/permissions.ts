// Role-based access rules. Shared by server (enforcement) and client (UI hints).
// The server is always the authority – the client only hides what it can't do.

export type Role = "ADMIN" | "SALES" | "VIEWER";
export const ROLES: Role[] = ["ADMIN", "SALES", "VIEWER"];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  SALES: "Sales Employee",
  VIEWER: "Viewer",
};

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  canOverridePrice: boolean;
  canAddProducts: boolean;
}

export type ProposalStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED";
export const PROPOSAL_STATUSES: ProposalStatus[] = ["DRAFT", "SENT", "APPROVED", "REJECTED", "EXPIRED"];

const isAdmin = (u: SessionUser) => u.role === "ADMIN";
const isSales = (u: SessionUser) => u.role === "SALES";

export const can = {
  manageUsers: isAdmin,
  manageSettings: isAdmin,
  /** Edit default prices / details of existing master products */
  editMasterProducts: isAdmin,
  /** Create new items (in the master and ad-hoc in proposals) */
  addProducts: (u: SessionUser) => isAdmin(u) || (isSales(u) && u.canAddProducts),
  /** Quote a rate different from the master selling price */
  overridePrice: (u: SessionUser) => isAdmin(u) || (isSales(u) && u.canOverridePrice),
  createProposal: (u: SessionUser) => isAdmin(u) || isSales(u),
  manageCustomers: (u: SessionUser) => isAdmin(u) || isSales(u),
  syncProducts: (u: SessionUser) => isAdmin(u) || isSales(u),
  viewAllProposals: isAdmin,
  viewAuditLog: isAdmin,
};

/** Statuses a viewer may see. */
export const VIEWER_VISIBLE: ProposalStatus[] = ["SENT", "APPROVED"];

interface ProposalLike {
  preparedById: string;
  status: string;
}

export function canViewProposal(u: SessionUser, p: ProposalLike): boolean {
  if (isAdmin(u)) return true;
  if (isSales(u)) return p.preparedById === u.id;
  return VIEWER_VISIBLE.includes(p.status as ProposalStatus);
}

/** Only drafts are editable; sent proposals are revised by duplicating. */
export function canEditProposal(u: SessionUser, p: ProposalLike): boolean {
  if (p.status !== "DRAFT") return false;
  return isAdmin(u) || (isSales(u) && p.preparedById === u.id);
}

export function canManageProposal(u: SessionUser, p: ProposalLike): boolean {
  return isAdmin(u) || (isSales(u) && p.preparedById === u.id);
}

export function canDownloadProposal(u: SessionUser, p: ProposalLike): boolean {
  if (u.role === "VIEWER") return p.status === "APPROVED";
  return canViewProposal(u, p);
}

/** Prisma `where` fragment restricting proposals to the user's scope. */
export function proposalScope(u: SessionUser): Record<string, unknown> {
  if (isAdmin(u)) return {};
  if (isSales(u)) return { preparedById: u.id };
  return { status: { in: VIEWER_VISIBLE } };
}
