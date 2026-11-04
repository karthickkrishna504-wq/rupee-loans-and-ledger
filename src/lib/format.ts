// Indian localisation helpers. Dates are stored as ISO (YYYY-MM-DD) and displayed DD MMM YYYY.
const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export const inr = (n: number) => inrFmt.format(Math.round(n || 0));
export const num = (n: number) => numFmt.format(n || 0);
export function inrCompact(n: number) {
  const a = Math.abs(n || 0);
  const s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)}K`;
  return inr(n);
}

export function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}
export const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const { y, m, d } = parts(iso);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
};
/** List-friendly date: Today / Yesterday / 04 Nov 2026. */
export function relDate(iso?: string, today = todayISO()) {
  if (!iso) return "—";
  const diff = daysBetween(iso, today);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : diff === -1 ? "Tomorrow" : fmtDate(iso);
}
/** Display money: full Indian grouping or compact (₹9.26 L), true minus sign. */
export function money(n: number, compact = false) {
  const v = Math.round(n || 0);
  const a = Math.abs(v);
  let body: string;
  if (compact && a >= 1e7) body = `₹${+(a / 1e7).toFixed(2)} Cr`;
  else if (compact && a >= 1e5) body = `₹${+(a / 1e5).toFixed(2)} L`;
  else if (compact && a >= 1e3) body = `₹${+(a / 1e3).toFixed(1)}K`;
  else body = inrFmt.format(a);
  return v < 0 ? `−${body}` : body;
}
export const toISO = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function todayISO() {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
export function addMonths(iso: string, n: number, day?: number) {
  const { y, m, d } = parts(iso);
  const t = (m - 1 + n);
  const ny = y + Math.floor(t / 12);
  const nm = ((t % 12) + 12) % 12 + 1;
  return toISO(ny, nm, Math.min(day ?? d, daysInMonth(ny, nm)));
}
export function addDays(iso: string, n: number) {
  const { y, m, d } = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
export function daysBetween(a: string, b: string) {
  const pa = parts(a), pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** Indian FY start year: April–March. 2026-10-26 -> 2026 (FY 2026-27). */
export function fyStart(iso: string) {
  const { y, m } = parts(iso);
  return m >= 4 ? y : y - 1;
}
export const fyLabel = (start: number) => `FY ${start}-${String((start + 1) % 100).padStart(2, "0")}`;
export const monthKey = (iso: string) => iso.slice(0, 7);
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
export const monthShort = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
};
