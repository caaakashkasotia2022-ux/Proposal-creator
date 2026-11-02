"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Boxes, FilePlus2, FileText, LayoutDashboard, LogOut, Menu, Settings, Users, X } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { cn, initials } from "@/lib/utils";
import { ROLE_LABELS, type SessionUser } from "@/lib/permissions";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/proposals/new", label: "Create Proposal", icon: FilePlus2, hideForViewer: true },
  { href: "/proposals", label: "Proposal History", icon: FileText },
  { href: "/products", label: "Product Master", icon: Boxes },
  { href: "/customers", label: "Customer Database", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/proposals") return path.startsWith("/proposals") && !path.startsWith("/proposals/new");
  return path.startsWith(href);
}

function Nav({ user, onNavigate }: { user: SessionUser; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {NAV.filter((n) => !(n.hideForViewer && user.role === "VIEWER")).map((n) => {
        const active = isActive(path, n.href);
        const Icon = n.icon;
        return (
          <Link key={n.href} href={n.href} onClick={onNavigate}
            className={cn("group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
              active ? "text-white" : "text-white/60 hover:bg-white/5 hover:text-white")}>
            {active && (
              <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-white/10 ring-1 ring-inset ring-white/10"
                transition={{ type: "spring", stiffness: 500, damping: 38 }} />
            )}
            <Icon className="relative h-[17px] w-[17px]" />
            <span className="relative">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function UserCard({ user }: { user: SessionUser }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }
  return (
    <div className="m-3 flex items-center gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-inset ring-white/10">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-xs font-semibold text-white">
        {initials(user.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-white">{user.name}</div>
        <div className="truncate text-[11.5px] text-white/50">{ROLE_LABELS[user.role]}</div>
      </div>
      <button onClick={logout} title="Sign out" className="rounded-md p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

function SidebarBody({ user, onNavigate }: { user: SessionUser; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-brand-950 via-[#141b45] to-[#0f1435]">
      <div className="px-5 pb-6 pt-5"><BrandMark light /></div>
      <div className="px-6 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/30">Workspace</div>
      <Nav user={user} onNavigate={onNavigate} />
      <UserCard user={user} />
    </div>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block">
        <SidebarBody user={user} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur lg:hidden">
        <BrandMark />
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-soft hover:bg-slate-100" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </header>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-slate-900/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div className="absolute inset-y-0 left-0 w-[272px]" initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "spring", stiffness: 420, damping: 40 }}>
              <SidebarBody user={user} onNavigate={() => setOpen(false)} />
              <button onClick={() => setOpen(false)} className="absolute right-3 top-5 rounded-md p-1 text-white/60 hover:text-white" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="lg:pl-[248px]">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
