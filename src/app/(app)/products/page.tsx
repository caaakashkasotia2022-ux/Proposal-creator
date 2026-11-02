import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { getLastSync, productSourceInfo } from "@/lib/products";
import { ProductsView } from "@/components/products/products-view";

export const metadata = { title: "Product master" };
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const user = await requireUser();
  const settings = await getSettings();
  return (
    <ProductsView
      perms={{ add: can.addProducts(user), edit: can.editMasterProducts(user), sync: can.syncProducts(user) }}
      units={settings.proposal.units}
      gstRates={settings.proposal.gstRates}
      source={productSourceInfo()}
      lastSync={await getLastSync()}
    />
  );
}
