"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Building2, CheckCircle2, CircleAlert, FileText, KeyRound, Mail, Plug, ScrollText, ShieldCheck, UserPlus, Users } from "lucide-react";
import type { AppSettings } from "@/lib/settings";
import { ROLE_LABELS, can, type Role, type SessionUser } from "@/lib/permissions";
import { api } from "@/lib/client";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/field";
import { Badge, Card, CardHeader, PageHeader, Skeleton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";

interface Integrations {
  sheets: { mode: "google" | "sample"; spreadsheetConfigured: boolean; credentialsConfigured: boolean; tab: string; writeBack: boolean; ttlSeconds: number; sheetUrl: string | null };
  email: { configured: boolean; host: string | null; from: string | null };
  database: string;
}

const TABS = [
  { key: "profile", label: "My account", icon: ShieldCheck },
  { key: "company", label: "Company", icon: Building2, admin: true },
  { key: "proposal", label: "Proposals & tax", icon: FileText, admin: true },
  { key: "email", label: "Email templates", icon: Mail, admin: true },
  { key: "integrations", label: "Integrations", icon: Plug },
  { key: "users", label: "Users & roles", icon: Users, admin: true },
  { key: "audit", label: "Audit log", icon: ScrollText, admin: true },
] as const;

export function SettingsView({ user, isAdmin, settings: initial, integrations }: { user: SessionUser; isAdmin: boolean; settings: AppSettings; integrations: Integrations }) {
  const router = useRouter();
  const [tab, setTab] = useState<string>("profile");
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const r = await api<{ settings: AppSettings }>("/api/settings", { method: "PUT", json: s });
      setS(r.settings);
      toast.success("Settings saved");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const company = (k: keyof AppSettings["company"]) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS((x) => ({ ...x, company: { ...x.company, [k]: e.target.value } }));
  const prop = <K extends keyof AppSettings["proposal"]>(k: K, v: AppSettings["proposal"][K]) => setS((x) => ({ ...x, proposal: { ...x.proposal, [k]: v } }));
  const saveBar = <div className="flex justify-end border-t border-slate-100 px-5 py-3"><Button onClick={save} loading={saving}>Save changes</Button></div>;

  return (
    <div>
      <PageHeader title="Settings" description="Company details, proposal defaults, integrations and access control." />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="scroll-thin flex gap-1 overflow-x-auto lg:flex-col">
          {TABS.filter((t) => !("admin" in t) || isAdmin).map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn("relative flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition", tab === t.key ? "text-brand-700" : "text-ink-soft hover:bg-white")}>
                {tab === t.key && <motion.span layoutId="settings-tab" className="absolute inset-0 rounded-lg bg-white shadow-card ring-1 ring-slate-200" />}
                <Icon className="relative h-4 w-4" /><span className="relative">{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {tab === "profile" && (
            <Card>
              <CardHeader title="My account" description="Your role and permissions in the proposal system." icon={ShieldCheck} />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Name"><Input value={user.name} disabled /></Field>
                <Field label="Email"><Input value={user.email} disabled /></Field>
                <Field label="Role"><Input value={ROLE_LABELS[user.role]} disabled /></Field>
              </div>
              <div className="grid gap-2 border-t border-slate-100 p-5 text-sm sm:grid-cols-2">
                {[
                  ["Create & send proposals", can.createProposal(user)],
                  ["Override selling prices", can.overridePrice(user)],
                  ["Add new items to the product master", can.addProducts(user)],
                  ["Edit master prices", can.editMasterProducts(user)],
                  ["See all team proposals", can.viewAllProposals(user)],
                  ["Manage users & settings", can.manageUsers(user)],
                ].map(([label, ok]) => (
                  <div key={label as string} className="flex items-center gap-2">
                    {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleAlert className="h-4 w-4 text-ink-faint" />}
                    <span className={ok ? "text-ink" : "text-ink-muted"}>{label as string}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === "company" && (
            <Card>
              <CardHeader title="Company information" description="Printed on every proposal. Placeholders in [brackets] must be replaced with IDCUBE's official details." icon={Building2} />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Legal name" className="sm:col-span-2"><Input value={s.company.name} onChange={company("name")} /></Field>
                <Field label="Registered address" className="sm:col-span-2"><Textarea rows={3} value={s.company.address} onChange={company("address")} /></Field>
                <Field label="Phone"><Input value={s.company.phone} onChange={company("phone")} /></Field>
                <Field label="Email"><Input value={s.company.email} onChange={company("email")} /></Field>
                <Field label="Website"><Input value={s.company.website} onChange={company("website")} /></Field>
                <Field label="Tagline"><Input value={s.company.tagline} onChange={company("tagline")} /></Field>
                <Field label="GSTIN"><Input value={s.company.gstin} onChange={company("gstin")} /></Field>
                <Field label="PAN"><Input value={s.company.pan} onChange={company("pan")} /></Field>
                <Field label="Bank details (printed on proposals)" className="sm:col-span-2"><Textarea rows={3} value={s.company.bankDetails} onChange={company("bankDetails")} /></Field>
                <Field label="Logo file" className="sm:col-span-2" hint="Copy a PNG/JPG logo into public/brand/ and enter its path, e.g. /brand/logo.png. Leave blank to use the placeholder wordmark.">
                  <Input value={s.company.logoPath} onChange={company("logoPath")} placeholder="/brand/logo.png" />
                </Field>
              </div>
              {saveBar}
            </Card>
          )}

          {tab === "proposal" && (
            <Card>
              <CardHeader title="Proposal defaults & GST" description="Applied to new proposals. Existing proposals are not changed." icon={FileText} />
              <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Number prefix" hint="Format: PREFIX/FY/C-or-SI/0001"><Input value={s.proposal.numberPrefix} onChange={(e) => prop("numberPrefix", e.target.value)} /></Field>
                <Field label="Default validity (days)"><Input type="number" min={1} max={365} value={s.proposal.defaultValidityDays} onChange={(e) => prop("defaultValidityDays", Number(e.target.value))} /></Field>
                <Field label="Default GST treatment">
                  <Select value={s.proposal.defaultSupplyType} onChange={(e) => prop("defaultSupplyType", e.target.value as "INTRA" | "INTER" | "NONE")}>
                    <option value="INTRA">Intra-state (CGST + SGST)</option><option value="INTER">Inter-state (IGST)</option><option value="NONE">No GST</option>
                  </Select>
                </Field>
                <Field label="Default GST % for new items"><Input type="number" value={s.proposal.defaultGstRate} onChange={(e) => prop("defaultGstRate", Number(e.target.value))} /></Field>
                <Field label="Available GST rates (%)" className="sm:col-span-2" hint="Comma separated, e.g. 0, 5, 12, 18, 28">
                  <Input defaultValue={s.proposal.gstRates.join(", ")} onBlur={(e) => prop("gstRates", e.target.value.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n >= 0))} />
                </Field>
                <Field label="Units" className="sm:col-span-2" hint="Comma separated">
                  <Input defaultValue={s.proposal.units.join(", ")} onBlur={(e) => prop("units", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
                </Field>
                <Field label="Customer proposal introduction" className="sm:col-span-2 lg:col-span-4" hint="Placeholders: {{customerName}}, {{contactPerson}}, {{projectName}}">
                  <Textarea rows={5} value={s.proposal.customerIntroduction} onChange={(e) => prop("customerIntroduction", e.target.value)} />
                </Field>
                <Field label="SI proposal introduction" className="sm:col-span-2 lg:col-span-4"><Textarea rows={5} value={s.proposal.siIntroduction} onChange={(e) => prop("siIntroduction", e.target.value)} /></Field>
                <Field label="Default payment terms" className="sm:col-span-2 lg:col-span-4"><Textarea rows={3} value={s.proposal.paymentTerms} onChange={(e) => prop("paymentTerms", e.target.value)} /></Field>
                <Field label="Default terms & conditions" className="sm:col-span-2 lg:col-span-4"><Textarea rows={9} value={s.proposal.termsAndConditions} onChange={(e) => prop("termsAndConditions", e.target.value)} /></Field>
              </div>
              {saveBar}
            </Card>
          )}

          {tab === "email" && (
            <Card>
              <CardHeader title="Email templates" description="Placeholders: {{number}} {{projectName}} {{customerName}} {{contactPerson}} {{grandTotal}} {{validUntil}} {{preparedBy}} {{companyName}}" icon={Mail} />
              <div className="grid gap-4 p-5">
                <Field label="Subject"><Input value={s.email.subjectTemplate} onChange={(e) => setS((x) => ({ ...x, email: { ...x.email, subjectTemplate: e.target.value } }))} /></Field>
                <Field label="Message"><Textarea rows={12} value={s.email.bodyTemplate} onChange={(e) => setS((x) => ({ ...x, email: { ...x.email, bodyTemplate: e.target.value } }))} /></Field>
              </div>
              {saveBar}
            </Card>
          )}

          {tab === "integrations" && <IntegrationsTab i={integrations} />}
          {tab === "users" && isAdmin && <UsersTab currentUserId={user.id} />}
          {tab === "audit" && isAdmin && <AuditTab />}
        </div>
      </div>
    </div>
  );
}

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 py-3">
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <CircleAlert className="mt-0.5 h-5 w-5 text-amber-600" />}
      <div className="text-sm"><div className="font-medium">{label}</div><div className="text-ink-muted">{detail}</div></div>
    </div>
  );
}

function IntegrationsTab({ i }: { i: Integrations }) {
  return (
    <Card>
      <CardHeader title="Integrations" description="Credentials live only in server environment variables and are never sent to the browser." icon={Plug} />
      <div className="divide-y divide-slate-100 px-5">
        <StatusRow ok={i.sheets.mode === "google"} label="Google Sheets product master"
          detail={i.sheets.mode === "google"
            ? `Connected · tab “${i.sheets.tab}” · write-back ${i.sheets.writeBack ? "on" : "off"} · refresh every ${Math.round(i.sheets.ttlSeconds / 60)} min`
            : `Demo mode (sample CSV). ${!i.sheets.spreadsheetConfigured ? "GOOGLE_SHEETS_SPREADSHEET_ID is not set. " : ""}${!i.sheets.credentialsConfigured ? "Service account credentials are not set. " : ""}See docs/GOOGLE_SHEETS_SETUP.md.`} />
        <StatusRow ok={i.email.configured} label="Email (SMTP)"
          detail={i.email.configured ? `Sending via ${i.email.host} as ${i.email.from}` : "Not configured – users can download proposals and send them manually. See docs/EMAIL_SETUP.md."} />
        <StatusRow ok={i.database.startsWith("PostgreSQL")} label="Database" detail={i.database} />
      </div>
    </Card>
  );
}

// ── Users ──
interface UserRow { id: string; name: string; email: string; role: Role; canOverridePrice: boolean; canAddProducts: boolean; active: boolean; designation: string | null; phone: string | null; lastLoginAt: string | null }
const EMPTY_USER = { name: "", email: "", role: "SALES" as Role, canOverridePrice: false, canAddProducts: false, active: true, designation: "", phone: "", password: "" };

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [f, setF] = useState(EMPTY_USER);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => api<{ users: UserRow[] }>("/api/users").then((d) => setUsers(d.users)).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  function open(u: UserRow | "new") {
    setErr(null);
    setEditing(u);
    setF(u === "new" ? EMPTY_USER : { ...EMPTY_USER, ...u, designation: u.designation ?? "", phone: u.phone ?? "", password: "" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (editing === "new") await api("/api/users", { method: "POST", json: f });
      else if (editing) await api(`/api/users/${editing.id}`, { method: "PATCH", json: f });
      toast.success(editing === "new" ? "User created" : "User updated");
      setEditing(null);
      load();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Users & roles" description="Admins manage everything; Sales create proposals; Viewers can only view sent/approved proposals." icon={Users}
        actions={<Button size="sm" onClick={() => open("new")}><UserPlus className="h-4 w-4" /> Add user</Button>} />
      {users === null ? <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-[11.5px] font-semibold uppercase tracking-wider text-ink-muted">
              <th className="px-5 py-2.5">User</th><th className="px-5 py-2.5">Role</th><th className="px-5 py-2.5">Permissions</th><th className="px-5 py-2.5">Last login</th><th />
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={cn("border-b border-slate-100 last:border-0", !u.active && "opacity-50")}>
                  <td className="px-5 py-3"><div className="font-medium">{u.name}</div><div className="text-xs text-ink-muted">{u.email}</div></td>
                  <td className="px-5 py-3"><Badge tone={u.role === "ADMIN" ? "brand" : u.role === "SALES" ? "sky" : "slate"}>{ROLE_LABELS[u.role]}</Badge>{!u.active && <Badge className="ml-1">Inactive</Badge>}</td>
                  <td className="px-5 py-3 text-xs text-ink-soft">
                    {u.role === "ADMIN" ? "Full access" : u.role === "VIEWER" ? "Read only" : [u.canOverridePrice && "Price override", u.canAddProducts && "Add products"].filter(Boolean).join(" · ") || "Standard"}
                  </td>
                  <td className="px-5 py-3 text-xs text-ink-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
                  <td className="px-5 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => open(u)}>Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add user" : "Edit user"}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="user-form" loading={saving}>Save</Button></>}>
        <form id="user-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{err}</div>}
          <Field label="Full name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Designation"><Input value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} /></Field>
          <Field label="Role">
            <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} disabled={editing !== "new" && editing?.id === currentUserId}>
              <option value="ADMIN">Admin</option><option value="SALES">Sales Employee</option><option value="VIEWER">Viewer</option>
            </Select>
          </Field>
          <Field label={editing === "new" ? "Password" : "Reset password"} required={editing === "new"} className="sm:col-span-2" hint={editing === "new" ? "Minimum 8 characters." : "Leave blank to keep the current password."}>
            <div className="flex gap-2">
              <Input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
              <Button type="button" variant="secondary" onClick={() => setF({ ...f, password: Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"[b % 56]).join("") })}>
                <KeyRound className="h-4 w-4" /> Generate
              </Button>
            </div>
          </Field>
          {f.role === "SALES" && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-3 sm:col-span-2">
              <Toggle checked={f.canOverridePrice} onChange={(v) => setF({ ...f, canOverridePrice: v })} label="Can override selling prices" description="Quote rates different from the master price (logged in the audit trail)." />
              <Toggle checked={f.canAddProducts} onChange={(v) => setF({ ...f, canAddProducts: v })} label="Can add new items" description="Create new products in the master and one-off proposal items." />
            </div>
          )}
          <div className="sm:col-span-2"><Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" description="Inactive users cannot sign in." disabled={editing !== "new" && editing?.id === currentUserId} /></div>
        </form>
      </Modal>
    </Card>
  );
}

function AuditTab() {
  const [logs, setLogs] = useState<{ id: string; action: string; entity: string; details: string; by: string; at: string }[] | null>(null);
  useEffect(() => { api<{ logs: typeof logs }>("/api/audit").then((d) => setLogs(d.logs)).catch((e) => toast.error(e.message)); }, []);
  return (
    <Card>
      <CardHeader title="Audit log" description="Product master changes, price changes from the sheet, sync runs, user and settings changes." icon={ScrollText} />
      {logs === null ? <div className="space-y-2 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div> : (
        <ul className="divide-y divide-slate-100">
          {logs.length === 0 && <li className="p-5 text-sm text-ink-muted">No entries yet.</li>}
          {logs.map((l) => (
            <li key={l.id} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[220px_1fr_160px]">
              <span className="font-medium">{l.action.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>
              <code className="truncate text-xs text-ink-muted" title={l.details}>{l.details === "{}" ? "" : l.details}</code>
              <span className="text-xs text-ink-muted sm:text-right">{l.by} · {formatDateTime(l.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
