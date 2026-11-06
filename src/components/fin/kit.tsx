import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Inbox } from "lucide-react";
import { ResponsiveContainer } from "recharts";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export { Skeleton };

export function MoneyText({ value, compact, tone = "auto", className }: { value: number; compact?: boolean; tone?: "auto" | "plain" | "income" | "expense"; className?: string }) {
  const [full, setFull] = useState(false);
  const neg = value < 0;
  const cls = tone === "income" ? "text-income" : tone === "expense" || (tone === "auto" && neg) ? "text-expense" : "";
  const text = money(value, compact && !full);
  return compact
    ? <button type="button" onClick={() => setFull(!full)} title={money(value)} className={cn("num whitespace-nowrap text-left", cls, className)}>{text}</button>
    : <span className={cn("num whitespace-nowrap", cls, className)}>{text}</span>;
}

/** Counts up once on mount; respects reduced motion. */
export function CountUpMoney({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const done = useRef(false);
  useEffect(() => {
    if (done.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    done.current = true;
    const start = performance.now(); let raf = 0;
    const tick = (t: number) => { const p = Math.min(1, (t - start) / 700); setShown(value * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={cn("num", className)}>{money(shown)}</span>;
}

export function DeltaChip({ value, suffix, onDark }: { value: number; suffix?: string; onDark?: boolean }) {
  const up = value >= 0;
  return (
    <span className={cn("num inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium",
      onDark ? "bg-hero-foreground/10 text-hero-foreground" : up ? "bg-income/10 text-income" : "bg-expense/10 text-expense")}>
      <span className={onDark ? (up ? "text-income" : "text-expense") : ""}>{up ? "▲" : "▼"}</span>{money(Math.abs(value))}{suffix && <span className="opacity-70">{suffix}</span>}
    </span>
  );
}

export function SectionCard({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("panel fade-in p-5", className)}>
      {(title || action) && (
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          {title && <h2 className="truncate text-[17px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function CardLink({ to, children, search }: { to: string; children: ReactNode; search?: Record<string, string> }) {
  return <Link to={to as "/"} search={search as never} className="pressable inline-flex items-center gap-0.5 text-[13px] font-medium text-primary">{children}<ChevronRight className="size-4" /></Link>;
}

export function StatCard({ label, value, hint, tone, compact = true }: { label: string; value: number; hint?: string; tone?: "income" | "expense" | "plain"; compact?: boolean }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-card)] bg-muted/60 p-4">
      <div className="truncate text-[12.5px] text-muted-foreground">{label}</div>
      <MoneyText value={value} compact={compact} tone={tone ?? "auto"} className="mt-1 block text-[17px] font-semibold" />
      {hint && <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function SegmentedTabs<T extends string>({ options, value, onChange, size = "md", label }: { options: readonly T[] | { value: T; label: string }[]; value: T; onChange: (v: T) => void; size?: "sm" | "md"; label?: string }) {
  const opts = (options as (T | { value: T; label: string })[]).map((o) => typeof o === "string" ? { value: o, label: o } : o);
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-full bg-muted p-1">
      {opts.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn("pressable rounded-full font-medium", size === "sm" ? "px-3 py-1 text-[12.5px]" : "px-4 py-1.5 text-sm",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>{o.label}</button>
      ))}
    </div>
  );
}

export function ListRow({ icon, title, subtitle, trailing, trailingSub, onClick }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; trailingSub?: ReactNode; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={cn("grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left", onClick && "pressable")}>
      {icon ? <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">{icon}</span> : <span />}
      <span className="min-w-0"><span className="block truncate text-[15px] font-medium">{title}</span>{subtitle && <span className="block truncate text-[12.5px] text-muted-foreground">{subtitle}</span>}</span>
      <span className="text-right"><span className="block text-[15px] font-semibold">{trailing}</span>{trailingSub && <span className="block text-[12px] text-muted-foreground">{trailingSub}</span>}</span>
    </Comp>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">{icon ?? <Inbox className="size-5" />}</span>
      <div className="text-[15px] font-semibold">{title}</div>
      {body && <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ChartCard({ title, summary, action, children, height = 220, className }: { title: string; summary?: ReactNode; action?: ReactNode; children: React.ReactElement; height?: number; className?: string }) {
  return (
    <SectionCard className={className}>
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0"><h2 className="truncate text-[17px] font-semibold">{title}</h2>{summary && <div className="mt-0.5 text-[12.5px] text-muted-foreground">{summary}</div>}</div>
        {action}
      </div>
      <div className="min-w-0" style={{ height }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </SectionCard>
  );
}

export function FilterSheet({ open, onOpenChange, title = "Filters", children, onReset }: { open: boolean; onOpenChange: (o: boolean) => void; title?: string; children: ReactNode; onReset?: () => void }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-[var(--radius-card)] border-0 bg-card">
        <DrawerHeader className="text-left"><DrawerTitle className="text-[17px]">{title}</DrawerTitle></DrawerHeader>
        <div className="space-y-4 px-5">{children}</div>
        <DrawerFooter className="flex-row gap-2 px-5 pb-6">
          {onReset && <button onClick={onReset} className="pressable h-12 flex-1 rounded-[var(--radius)] bg-muted text-sm font-medium">Reset</button>}
          <button onClick={() => onOpenChange(false)} className="pressable h-12 flex-1 rounded-[var(--radius)] bg-primary text-sm font-medium text-primary-foreground">Apply</button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** Chart styling shared by every chart. */
export const chartAxis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false, minTickGap: 16 };
export const chartGrid = { stroke: "var(--border)", strokeDasharray: "2 4", vertical: false };
export const chartTip = {
  cursor: { fill: "var(--muted)", opacity: 0.5 },
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, boxShadow: "var(--shadow-raised)" },
  labelStyle: { color: "var(--muted-foreground)" },
  formatter: (v: number) => money(v),
};
export function chartMoney(v: number) { const a = Math.abs(v); const sign = v < 0 ? "−" : ""; return `${sign}₹${a >= 1e7 ? `${+(a / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${+(a / 1e5).toFixed(1)}L` : a >= 1e3 ? `${+(a / 1e3).toFixed(0)}k` : Math.round(a)}`; }
