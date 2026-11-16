import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Home, ListOrdered, Landmark, Target, FileChartColumn, Settings, Moon, Sun, Plus, Inbox, HandCoins, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Upload, UserRound } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { TransactionDialog } from "./TransactionDialog";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

export const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/transactions", label: "Transactions", icon: ListOrdered },
  { to: "/accounts", label: "Accounts", icon: Landmark },
  { to: "/loans", label: "Lending & Borrowing", icon: HandCoins },
  { to: "/statements", label: "Reports", icon: FileChartColumn },
] as const;
const FAB_ROUTES = ["/", "/transactions", "/accounts", "/loans"];

const ProfileCtx = createContext<{ name: string; setName: (n: string) => void; openAdd: () => void }>({ name: "", setName: () => {}, openAdd: () => {} });
export const useProfile = () => useContext(ProfileCtx);

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return <span className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-foreground", className)}>{initials || <UserRound className="size-4" />}</span>;
}

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-primary text-sm font-bold text-primary-foreground">₹</span>
      <span className="truncate text-[17px] font-semibold tracking-tight">Kanakku</span>
    </div>
  );
}

function AvatarMenu({ name, dark, onTheme, onName }: { name: string; dark: boolean; onTheme: () => void; onName: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Open account menu" className="pressable rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"><Avatar name={name} /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-[var(--radius)] p-1.5">
        <DropdownMenuLabel className="text-[13px]">{name || "Your profile"}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onName}><UserRound /> {name ? "Edit name" : "Set your name"}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link to="/planning"><Target /> Plan & budgets</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/bank-sync"><Inbox /> Bank Sync & import</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/settings"><Settings /> Settings & backup</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onTheme}>{dark ? <Sun /> : <Moon />} {dark ? "Light mode" : "Dark mode"}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BottomNav({ path }: { path: string }) {
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 backdrop-blur lg:hidden">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = path === to;
        return (
          <Link key={to} to={to} aria-current={active ? "page" : undefined} className={cn("pressable flex min-w-0 flex-col items-center gap-1 pb-2 pt-2 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
            <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors duration-200", active && "bg-accent")}><Icon className="size-5" /></span>
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar({ path }: { path: string }) {
  const item = (active: boolean) => cn("pressable flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-[15px] font-medium", active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground");
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r px-4 py-6 lg:flex">
      <div className="mb-8 px-2"><Brand /></div>
      <nav aria-label="Main" className="space-y-1">
        {NAV.map(({ to, label, icon: Icon }) => <Link key={to} to={to} className={item(path === to)}><Icon className="size-5" /> {label}</Link>)}
      </nav>
      <Link to="/settings" className={cn(item(path === "/settings"), "mt-auto")}><Settings className="size-5" /> Settings</Link>
    </aside>
  );
}

const ADD_OPTIONS = [
  { key: "expense", label: "Expense", icon: ArrowUpRight, tone: "text-expense bg-expense/10" },
  { key: "income", label: "Income", icon: ArrowDownLeft, tone: "text-income bg-income/10" },
  { key: "transfer", label: "Transfer", icon: ArrowLeftRight, tone: "text-info bg-info/10" },
  { key: "loan", label: "Lend / Borrow", icon: HandCoins, tone: "text-warning bg-warning/10" },
  { key: "import", label: "Import statement", icon: Upload, tone: "text-primary bg-accent" },
] as const;

function AddSheet({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (k: (typeof ADD_OPTIONS)[number]["key"]) => void }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-[var(--radius-card)] border-0 bg-card">
        <DrawerHeader className="text-left"><DrawerTitle className="text-[17px]">Add</DrawerTitle><DrawerDescription>What would you like to record?</DrawerDescription></DrawerHeader>
        <div className="grid gap-1 px-3 pb-8">
          {ADD_OPTIONS.map(({ key, label, icon: Icon, tone }) => (
            <button key={key} onClick={() => onPick(key)} className="pressable flex items-center gap-3 rounded-[var(--radius)] px-3 py-3 text-left text-[15px] font-medium hover:bg-muted">
              <span className={cn("grid size-10 place-items-center rounded-full", tone)}><Icon className="size-5" /></span>{label}
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [dark, setDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [name, setNameState] = useState("");
  const [sheet, setSheet] = useState(false);
  const [entry, setEntry] = useState<Partial<Transaction> | null>(null);
  useEffect(() => { setDark(localStorage.getItem("finledger-theme") === "dark"); setNameState(localStorage.getItem("kanakku-name") ?? ""); setThemeReady(true); }, []);
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("finledger-theme", dark ? "dark" : "light");
  }, [dark, themeReady]);
  const setName = (n: string) => { setNameState(n); localStorage.setItem("kanakku-name", n); };
  const askName = () => { const n = window.prompt("Your name", name); if (n !== null) setName(n.trim()); };

  const pick = (k: (typeof ADD_OPTIONS)[number]["key"]) => {
    setSheet(false);
    if (k === "loan") return navigate({ to: "/loans" });
    if (k === "import") return navigate({ to: "/bank-sync" });
    setEntry({ type: k === "expense" ? "Daily Expense" : k === "income" ? "Salary Income" : "Transfer Between Own Accounts" });
  };
  const showFab = FAB_ROUTES.includes(path);

  return (
    <ProfileCtx.Provider value={{ name, setName, openAdd: () => setSheet(true) }}>
      <div className="min-h-screen lg:flex">
        <Sidebar path={path} />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 grid h-[60px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-background/90 px-5 backdrop-blur lg:static lg:mx-auto lg:max-w-[1120px] lg:bg-transparent">
            <div className="lg:invisible"><Brand /></div>
            <AvatarMenu name={name} dark={dark} onTheme={() => setDark(!dark)} onName={askName} />
          </header>
          <main className={cn("mx-auto w-full max-w-[1120px] px-5 pt-1 lg:px-8 lg:pb-12", showFab ? "pb-[calc(152px+env(safe-area-inset-bottom))]" : "pb-[calc(96px+env(safe-area-inset-bottom))]")}>{children}</main>
        </div>
        {showFab && (
          <button onClick={() => setSheet(true)} aria-label="Add" className="pressable raised fixed right-5 z-30 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground bottom-[calc(80px+env(safe-area-inset-bottom))] lg:bottom-8 lg:right-8">
            <Plus className="size-6" />
          </button>
        )}
        <AddSheet open={sheet} onOpenChange={setSheet} onPick={pick} />
        <TransactionDialog open={entry !== null} onOpenChange={(o) => !o && setEntry(null)} initial={entry ?? undefined} />
        <BottomNav path={path} />
      </div>
    </ProfileCtx.Provider>
  );
}
