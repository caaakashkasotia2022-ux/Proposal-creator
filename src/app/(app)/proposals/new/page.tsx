import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { ProposalEditor } from "@/components/proposals/proposal-editor";

export const metadata = { title: "Create proposal" };
export const dynamic = "force-dynamic";

export default async function NewProposalPage() {
  const user = await requireUser();
  if (!can.createProposal(user)) redirect("/proposals");
  return <ProposalEditor mode="create" user={user} settings={await getSettings()} />;
}
