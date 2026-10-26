import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("panel p-4", className)}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "good" | "bad" | "warn" | "brand" }) {
  const toneCls = { default: "text-foreground", good: "text-success", bad: "text-destructive", warn: "text-warning", brand: "text-primary" }[tone];
  return (
    <div className="panel p-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("num mt-1.5 text-lg font-semibold md:text-xl", toneCls)}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  good: "bg-success/15 text-success ring-success/30",
  warn: "bg-warning/15 text-warning ring-warning/30",
  bad: "bg-destructive/15 text-destructive ring-destructive/30",
  info: "bg-info/15 text-info ring-info/30",
  muted: "bg-muted text-muted-foreground ring-border",
};
const STATUS_TONE: Record<string, keyof typeof BADGE> = {
  ACTIVE: "info", PAID: "good", CLOSED: "muted", OVERDUE: "bad", PARTIAL: "warn", UPCOMING: "muted", DUE_TODAY: "warn",
  Healthy: "good", Caution: "warn", Critical: "bad", IN: "good", OUT: "bad", TRANSFER: "info", Matched: "good", Mismatch: "bad",
};
export function Badge({ children, tone }: { children: ReactNode; tone?: keyof typeof BADGE }) {
  const t = tone ?? STATUS_TONE[String(children)] ?? "muted";
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", BADGE[t])}>{String(children).replace("_", " ")}</span>;
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cn("field", className)} />;
}
export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn("field", className)} />;
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>{head.map((h) => <th key={h} className="whitespace-nowrap border-b px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>)}</tr>
        </thead>
        <tbody className="[&_td]:whitespace-nowrap [&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_tr:hover]:bg-muted/40">{children}</tbody>
      </table>
      {empty && <div className="p-8 text-center text-sm text-muted-foreground">Nothing here yet.</div>}
    </div>
  );
}
