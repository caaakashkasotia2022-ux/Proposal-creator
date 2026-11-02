import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CustomersView } from "@/components/customers/customers-view";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await requireUser();
  return <CustomersView canManage={can.manageCustomers(user)} canCreateProposal={can.createProposal(user)} />;
}
