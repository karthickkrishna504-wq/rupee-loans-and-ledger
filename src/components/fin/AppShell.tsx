import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ListOrdered, Landmark, HandCoins, Settings, Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Register", icon: ListOrdered },
  { to: "/accounts", label: "Accounts", icon: Landmark },
  { to: "/loans", label: "Loans", icon: HandCoins },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [dark, setDark] = useState(true);
  useEffect(() => { setDark(localStorage.getItem("finledger-theme") !== "light"); }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("finledger-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="grid size-8 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">₹</div>
          <div>
            <div className="text-sm font-bold">Khata ERP</div>
            <div className="text-[11px] text-muted-foreground">Personal finance & lending</div>
          </div>
        </div>
        <nav className="space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground", path === to && "bg-sidebar-accent text-sidebar-foreground")}>
              <Icon className={cn("size-4", path === to && "text-primary")} /> {label}
            </Link>
          ))}
        </nav>
        <button onClick={() => setDark(!dark)} className="mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent">
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />} {dark ? "Light mode" : "Dark mode"}
        </button>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/85 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">₹</div>
          <span className="text-sm font-bold">Khata ERP</span>
        </div>
        <button aria-label="Toggle theme" onClick={() => setDark(!dark)} className="rounded-md p-2 text-muted-foreground">
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className={cn("flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground", path === to && "text-primary")}>
            <Icon className="size-5" /> {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
