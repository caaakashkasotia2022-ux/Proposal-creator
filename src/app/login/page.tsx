import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/brand";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  const showDemo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_LOGINS === "true";

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-brand-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[420px] w-[420px] rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <BrandMark light className="relative" />
        <div className="relative max-w-md">
          <h1 className="text-[34px] font-semibold leading-tight tracking-tight">Customer-ready proposals in minutes, not hours.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            Live pricing from the product master, accurate GST, and branded PDF &amp; Excel quotations – all in one place.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-sm">
            {["Live product master", "Server-checked pricing", "PDF · Excel · Email"].map((t) => (
              <div key={t} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-white/80 backdrop-blur">{t}</div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/40">© IDCUBE Identification Systems Pvt. Ltd. · Internal use only</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <BrandMark className="mb-10 lg:hidden" />
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-ink-muted">Use your IDCUBE employee account.</p>
          <LoginForm next={next} showDemo={showDemo} />
        </div>
      </div>
    </div>
  );
}
