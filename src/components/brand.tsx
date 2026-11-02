import { cn } from "@/lib/utils";

/** Placeholder wordmark – swap for the official IDCUBE logo (public/brand/logo.svg). */
export function BrandMark({ className, light, subtitle = "Proposal Studio" }: { className?: string; light?: boolean; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative grid h-8 w-8 place-items-center rounded-[9px] bg-gradient-to-br from-brand-500 to-brand-800 shadow-[0_4px_12px_-2px_rgb(var(--brand-600)/0.5)]">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="white" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4L12 2.8Z" />
          <path d="M12 12 20 7.4M12 12 4 7.4M12 12v9.2" opacity="0.7" />
        </svg>
      </div>
      <div className="leading-none">
        <div className={cn("text-[15px] font-bold tracking-[0.08em]", light ? "text-white" : "text-ink")}>IDCUBE</div>
        {subtitle && <div className={cn("mt-1 text-[10.5px] font-medium", light ? "text-white/60" : "text-ink-muted")}>{subtitle}</div>}
      </div>
    </div>
  );
}
