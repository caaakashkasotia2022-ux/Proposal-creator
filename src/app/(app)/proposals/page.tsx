import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ProposalsList } from "@/components/proposals/proposals-list";

export const metadata = { title: "Proposal history" };
export const dynamic = "force-dynamic";

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  return <ProposalsList initialStatus={sp.status ?? ""} initialQuery={sp.q ?? ""} canCreate={can.createProposal(user)} isViewer={user.role === "VIEWER"} currentUserId={user.id} isAdmin={user.role === "ADMIN"} />;
}
