"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Boxes, FilePlus2, FileText, IndianRupee, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedNumber, Card, CardHeader, EmptyState, STATUS_META, StatusBadge } from "@/components/ui/misc";
import { formatCompactINR, formatINR } from "@/lib/money";
import { cn, formatDateTime } from "@/lib/utils";

interface Props {
  userName: string;
  canCreate: boolean;
  counts: Record<string, { count: number; value: number }>;
  productCount: number;
  sourceMode: "google" | "sample";
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  recent: { id: string; number: string; customerName: string; projectName: string | null; status: string; grandTotal: number; updatedAt: string; type: string }[];
}

const TILES = ["DRAFT", "SENT", "APPROVED", "REJECTED", "EXPIRED"] as const;

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } } };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function DashboardView({ userName, canCreate, counts, productCount, sourceMode, lastSyncAt, lastSyncOk, recent }: Props) {
  const total = Object.values(counts).reduce((a, c) => a + c.count, 0);
  const pipeline = (counts.SENT?.value ?? 0) + (counts.DRAFT?.value ?? 0);
  const won = counts.APPROVED?.value ?? 0;
  const decided = (counts.APPROVED?.count ?? 0) + (counts.REJECTED?.count ?? 0);
  const winRate = decided ? Math.round(((counts.APPROVED?.count ?? 0) / decided) * 100) : null;

  return (
    <div>
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 via-brand-800 to-indigo-700 px-6 py-7 text-white shadow-lift sm:px-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 right-40 h-40 w-40 rounded-full bg-indigo-300/20 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/70">{greeting()},</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{userName}</h1>
            <p className="mt-2 max-w-lg text-sm text-white/70">Here&apos;s what&apos;s happening with your proposals today.</p>
          </div>
          {canCreate && (
            <Link href="/proposals/new">
              <Button size="lg" className="bg-white from-white to-white text-brand-800 hover:from-brand-50 hover:to-white">
                <FilePlus2 className="h-4 w-4" /> Create proposal
              </Button>
            </Link>
          )}
        </div>
      </div>

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <motion.div variants={item}>
          <Link href="/proposals" className="card group block h-full p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
            <div className="flex items-center justify-between text-[13px] font-medium text-ink-muted">
              Total proposals <FileText className="h-4 w-4 text-brand-500" />
            </div>
            <AnimatedNumber value={total} className="mt-3 block text-[28px] font-semibold tracking-tight text-ink" />
          </Link>
        </motion.div>
        {TILES.map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <motion.div key={s} variants={item}>
              <Link href={`/proposals?status=${s}`} className="card group block h-full p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-center justify-between text-[13px] font-medium text-ink-muted">
                  {meta.label} <Icon className={cn("h-4 w-4", meta.cls.split(" ").find((c) => c.startsWith("text-")))} />
                </div>
                <AnimatedNumber value={counts[s]?.count ?? 0} className="mt-3 block text-[28px] font-semibold tracking-tight text-ink" />
                <div className="mt-1 truncate text-xs text-ink-muted tabular">{formatCompactINR(counts[s]?.value ?? 0)}</div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Recent proposals" description="Latest activity across your proposals" icon={FileText}
            actions={<Link href="/proposals" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:text-brand-700">View all <ArrowRight className="h-3.5 w-3.5" /></Link>} />
          {recent.length === 0 ? (
            <EmptyState icon={FileText} title="No proposals yet" description="Create your first proposal to see it here."
              action={canCreate ? <Link href="/proposals/new"><Button>Create proposal</Button></Link> : undefined} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((p, i) => (
                <motion.li key={p.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.04 }}>
                  <Link href={`/proposals/${p.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50/80">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-[11px] font-semibold text-ink-soft">{p.type === "SI" ? "SI" : "C"}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{p.customerName}</div>
                      <div className="truncate text-xs text-ink-muted">{p.number} · {p.projectName || "—"}</div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <div className="text-sm font-medium tabular text-ink">{formatINR(p.grandTotal)}</div>
                      <div className="text-xs text-ink-muted">{formatDateTime(p.updatedAt)}</div>
                    </div>
                    <StatusBadge status={p.status} />
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink-muted"><TrendingUp className="h-4 w-4 text-brand-500" /> Open pipeline (draft + sent)</div>
            <AnimatedNumber value={pipeline} format={(n) => formatINR(n)} className="mt-2 block text-2xl font-semibold tracking-tight" />
            <div className="mt-5 flex items-center gap-2 text-[13px] font-medium text-ink-muted"><IndianRupee className="h-4 w-4 text-emerald-600" /> Approved value</div>
            <AnimatedNumber value={won} format={(n) => formatINR(n)} className="mt-2 block text-2xl font-semibold tracking-tight" />
            <div className="mt-5 text-[13px] text-ink-muted">
              Win rate (approved vs rejected): <span className="font-semibold text-ink">{winRate === null ? "—" : `${winRate}%`}</span>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink-muted"><Boxes className="h-4 w-4 text-brand-500" /> Product master</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight"><AnimatedNumber value={productCount} /> <span className="text-sm font-normal text-ink-muted">active items</span></div>
            <div className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
              <RefreshCw className="h-3.5 w-3.5" />
              {sourceMode === "google" ? "Google Sheets" : "Sample CSV (demo mode)"} · {lastSyncAt ? `synced ${formatDateTime(lastSyncAt)}` : "not synced yet"}
              {lastSyncOk === false && <span className="font-medium text-rose-600">· last sync failed</span>}
            </div>
            <Link href="/products" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:text-brand-700">Open product master <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
