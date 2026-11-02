"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api } from "@/lib/client";

const DEMO = [
  { label: "Admin", email: "admin@idcube.local", password: "Admin@12345" },
  { label: "Sales", email: "sales@idcube.local", password: "Sales@12345" },
  { label: "Sales (restricted)", email: "sales2@idcube.local", password: "Sales@12345" },
  { label: "Viewer", email: "viewer@idcube.local", password: "Viewer@12345" },
];

export function LoginForm({ next, showDemo }: { next?: string; showDemo: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", json: { email, password } });
      const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      window.location.assign(dest);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </motion.div>
        )}
      </AnimatePresence>
      <Field label="Work email">
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoFocus />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Sign in {!loading && <ArrowRight className="h-4 w-4" />}
      </Button>

      {showDemo && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Demo accounts (development only)</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <button key={d.email} type="button" onClick={() => { setEmail(d.email); setPassword(d.password); }}
                className="rounded-lg border border-slate-200 px-2.5 py-2 text-left text-xs transition hover:border-brand-300 hover:bg-brand-50">
                <span className="block font-medium text-ink">{d.label}</span>
                <span className="block truncate text-ink-muted">{d.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
