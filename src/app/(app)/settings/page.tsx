import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { productSourceInfo } from "@/lib/products";
import { emailConfig } from "@/lib/email";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const ec = emailConfig();
  return (
    <SettingsView
      user={user}
      isAdmin={can.manageSettings(user)}
      settings={await getSettings()}
      integrations={{
        sheets: productSourceInfo(),
        email: { configured: ec.configured, host: ec.host || null, from: ec.from || null },
        database: /^postgres/.test(process.env.DATABASE_URL ?? "") ? "PostgreSQL" : "SQLite (local development)",
      }}
    />
  );
}
