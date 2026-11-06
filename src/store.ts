/* =========================================================
   State and data access. Every write goes through `record*`
   helpers that stamp the signed-in user and append an audit entry,
   so accountability cannot be skipped by a screen.
   Records live in memory; swap `db` for an API-backed repository
   when connecting a backend.
   ========================================================= */

import type {
  AuditAction, AuditEntity, AuditEntry, CustomExpenseRecord, FieldErrors, InventoryItem, OpenOrder, OrderLine, PeriodId, PeriodTotals,
  PurchaseRecord, Role, SalePaymentMethod, SaleRecord, StaffAccount, SupportedLanguage, ThemeMode, ViewId, WasteRecord,
} from "./types";
import { BASE_INVENTORY, CAN_APPROVE_WASTE, CAN_DELETE, MENU, STAFF, VIEW_ACCESS } from "./catalog";
import { generateSeed, newId } from "./seed";
import { addDays, localDay, today } from "./format";
import { isLanguage } from "./i18n";

/* ---------- preferences & session (persisted per browser) ---------- */

interface Prefs {
  lang: SupportedLanguage;
  theme: ThemeMode;
  userId: string | null;
}

const PREFS_KEY = "bistro-ledger-v3";

function loadPrefs(): Prefs {
  const fallback: Prefs = { lang: "en", theme: "dark", userId: "u-hanna" };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      lang: isLanguage(p.lang) ? p.lang : "en",
      theme: p.theme === "light" ? "light" : "dark",
      userId: STAFF.some((s) => s.userId === p.userId) ? (p.userId as string) : null,
    };
  } catch {
    return fallback;
  }
}

/* ---------- state ---------- */

export interface UiState {
  lang: SupportedLanguage;
  theme: ThemeMode;
  userId: string | null;
  view: ViewId;
  period: PeriodId;
  errors: FieldErrors;
  /* waiter: the order being built */
  order: OrderLine[];
  orderTable: string;
  orderNote: string;
  /* cashier: the order being paid */
  cashierSel: string | null;
  payMethod: SalePaymentMethod;
  /** final price per line of the selected order (index-aligned) */
  payPrices: number[];
  tendered: string;
  payRef: string;
  menuSection: string;
  menuQuery: string;
  auditUser: string;
  auditEntity: AuditEntity | "ALL";
  auditLimit: number;
  wasteFilter: "ALL" | "PENDING";
  signInFor: string | null;
}

const prefs = loadPrefs();

export const state: UiState = {
  ...prefs,
  view: "dashboard",
  period: "today",
  errors: {},
  order: [],
  orderTable: "",
  orderNote: "",
  cashierSel: null,
  payMethod: "CASH",
  payPrices: [],
  tendered: "",
  payRef: "",
  menuSection: "ALL",
  menuQuery: "",
  auditUser: "ALL",
  auditEntity: "ALL",
  auditLimit: 25,
  wasteFilter: "ALL",
  signInFor: null,
};

export function savePrefs(): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ lang: state.lang, theme: state.theme, userId: state.userId }));
  } catch {
    /* storage unavailable */
  }
}

const seed = generateSeed();

export const db = {
  sales: seed.sales,
  openOrders: seed.openOrders,
  purchases: seed.purchases,
  waste: seed.waste,
  expenses: seed.expenses,
  audit: seed.audit,
  customInventory: [] as InventoryItem[],
  nextTicket: seed.nextTicket,
};

/* ---------- session ---------- */

export const currentUser = (): StaffAccount | null => STAFF.find((s) => s.userId === state.userId) ?? null;

/** The signed-in user; screens are only rendered when someone is signed in. */
export function user(): StaffAccount {
  const u = currentUser();
  if (!u) throw new Error("No user signed in");
  return u;
}

export const canView = (view: ViewId, role: Role = user().role): boolean => VIEW_ACCESS[view].includes(role);
export const canApproveWaste = (): boolean => CAN_APPROVE_WASTE.includes(user().role);
export const canDelete = (): boolean => CAN_DELETE.includes(user().role);

export function signIn(userId: string, pin: string): boolean {
  const account = STAFF.find((s) => s.userId === userId);
  if (!account || account.pin !== pin) return false;
  state.userId = userId;
  savePrefs();
  log("SIGN_IN", "SESSION", userId, "Signed in", {});
  return true;
}

export function signOut(): void {
  if (state.userId) log("SIGN_OUT", "SESSION", state.userId, "Signed out", {});
  state.userId = null;
  state.order = [];
  state.orderTable = "";
  state.orderNote = "";
  state.cashierSel = null;
  savePrefs();
}

/* ---------- audit ---------- */

export function log(action: AuditAction, entity: AuditEntity, entityId: string, summary: string, detail: AuditEntry["detail"]): AuditEntry {
  const u = user();
  const entry: AuditEntry = {
    id: newId("aud"), action, entity, entityId, summary, detail,
    userId: u.userId, userName: u.name, role: u.role, timestamp: new Date().toISOString(),
  };
  db.audit.unshift(entry);
  return entry;
}

/** Who is stamping this record. */
export const stampUser = (): { loggedBy: string; userId: string } => ({ loggedBy: user().name, userId: user().userId });

/* ---------- writes ---------- */

export const orderTotal = (o: OpenOrder): number => o.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

/** Waiter sends an order to the cashier. No money changes hands here. */
export function sendOrder(table: string, lines: OrderLine[], note: string): OpenOrder {
  const { loggedBy, userId } = stampUser();
  const o: OpenOrder = { ticketNo: takeTicketNo(), table, lines: lines.map((l) => ({ ...l })), note, servedBy: loggedBy, servedById: userId, createdAt: new Date().toISOString() };
  db.openOrders.push(o);
  log("SEND", "ORDER", o.ticketNo, `Order ${o.ticketNo}`, { name: o.ticketNo, amount: orderTotal(o) });
  return o;
}

/** Waiter (own orders) or a manager cancels an order before it is paid. */
export function cancelOrder(ticketNo: string): OpenOrder | null {
  const o = db.openOrders.find((x) => x.ticketNo === ticketNo);
  if (!o || !(o.servedById === user().userId || canDelete())) return null;
  db.openOrders = db.openOrders.filter((x) => x !== o);
  log("CANCEL", "ORDER", ticketNo, `Order ${ticketNo}`, { name: ticketNo, amount: orderTotal(o) });
  return o;
}

export function reopenOrder(o: OpenOrder): void {
  db.openOrders.push(o);
  log("RESTORE", "ORDER", o.ticketNo, `Order ${o.ticketNo}`, { name: o.ticketNo, amount: orderTotal(o) });
}

/** Cashier takes payment for an open order: it becomes a sale, stamped with both the waiter and the cashier. */
export function takePayment(ticketNo: string, method: SalePaymentMethod, prices: number[], ref: string): SaleRecord[] | null {
  const o = db.openOrders.find((x) => x.ticketNo === ticketNo);
  if (!o || !canView("cashier")) return null;
  const { loggedBy, userId } = stampUser();
  const ts = new Date().toISOString();
  const lines: SaleRecord[] = o.lines.map((l, i) => {
    const final = prices[i] ?? l.unitPrice;
    const m = MENU.find((x) => x.id === l.menuItemId);
    return {
      id: `${o.ticketNo}-${i + 1}`, ticketNo: o.ticketNo, menuItemId: l.menuItemId, itemName: m?.nameKey ?? l.menuItemId, quantity: l.quantity,
      listPrice: l.unitPrice, finalUnitPrice: final, totalAmount: l.quantity * final, paymentMethod: method, paymentRef: ref || undefined,
      table: o.table, servedBy: o.servedBy, servedById: o.servedById, orderedAt: o.createdAt, loggedBy, cashierId: userId, timestamp: ts,
    };
  });
  db.openOrders = db.openOrders.filter((x) => x !== o);
  db.sales.push(...lines);
  log("PAY", "SALE", o.ticketNo, `Sale ${o.ticketNo}`, { name: o.ticketNo, amount: lines.reduce((s, l) => s + l.totalAmount, 0), method });
  return lines;
}

/** Undo right after payment: the sale goes back to the cashier's queue as an open order. */
export function unpay(lines: SaleRecord[]): void {
  const no = lines[0].ticketNo;
  db.sales = db.sales.filter((s) => s.ticketNo !== no);
  const o: OpenOrder = {
    ticketNo: no, table: lines[0].table, note: "", servedBy: lines[0].servedBy, servedById: lines[0].servedById, createdAt: lines[0].orderedAt,
    lines: lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, unitPrice: l.listPrice })),
  };
  db.openOrders.push(o);
  log("DELETE", "SALE", no, `Payment ${no} undone`, { name: no, amount: lines.reduce((s, l) => s + l.totalAmount, 0) });
}

export function recordPurchase(p: PurchaseRecord): void {
  db.purchases.push(p);
  log("CREATE", "PURCHASE", p.id, `Purchase ${p.itemId}`, { name: p.itemName, amount: p.totalCost, quantity: p.quantity, unit: p.unit });
}

export function recordWaste(w: WasteRecord): void {
  db.waste.push(w);
  log("CREATE", "WASTE", w.id, `Waste ${w.itemId}`, { name: w.itemName, amount: w.lossValue, quantity: w.quantityLost, unit: w.unit });
}

export function recordExpense(e: CustomExpenseRecord): void {
  db.expenses.push(e);
  log("CREATE", "EXPENSE", e.id, e.reason, { name: e.reason, amount: e.amount });
}

export function decideWaste(id: string, approve: boolean): WasteRecord | undefined {
  const w = db.waste.find((x) => x.id === id);
  if (!w || !canApproveWaste()) return undefined;
  w.approval = approve ? "APPROVED" : "REJECTED";
  w.approvedBy = user().name;
  w.approvedAt = new Date().toISOString();
  log(approve ? "APPROVE" : "REJECT", "WASTE", w.id, `Waste ${w.itemId}`, { name: w.itemName, amount: w.lossValue });
  return w;
}

type AnyRecord =
  | { entity: "SALE"; rows: SaleRecord[] }
  | { entity: "PURCHASE"; row: PurchaseRecord }
  | { entity: "WASTE"; row: WasteRecord }
  | { entity: "EXPENSE"; row: CustomExpenseRecord };

/** Remove a record (manager action or immediate undo). Returns what was removed so it can be restored. */
export function removeRecord(entity: AuditEntity, id: string): AnyRecord | null {
  let removed: AnyRecord | null = null;
  if (entity === "SALE") {
    const rows = db.sales.filter((s) => s.ticketNo === id);
    if (rows.length) { db.sales = db.sales.filter((s) => s.ticketNo !== id); removed = { entity, rows }; }
  } else if (entity === "PURCHASE") {
    const row = db.purchases.find((p) => p.id === id);
    if (row) { db.purchases = db.purchases.filter((p) => p !== row); removed = { entity, row }; }
  } else if (entity === "WASTE") {
    const row = db.waste.find((w) => w.id === id);
    if (row) { db.waste = db.waste.filter((w) => w !== row); removed = { entity, row }; }
  } else if (entity === "EXPENSE") {
    const row = db.expenses.find((e) => e.id === id);
    if (row) { db.expenses = db.expenses.filter((e) => e !== row); removed = { entity, row }; }
  }
  if (removed) log("DELETE", entity, id, `Deleted ${entity.toLowerCase()}`, removedDetail(removed));
  return removed;
}

export function restoreRecord(r: AnyRecord): void {
  if (r.entity === "SALE") db.sales.push(...r.rows);
  else if (r.entity === "PURCHASE") db.purchases.push(r.row);
  else if (r.entity === "WASTE") db.waste.push(r.row);
  else db.expenses.push(r.row);
  const id = r.entity === "SALE" ? r.rows[0].ticketNo : r.row.id;
  log("RESTORE", r.entity, id, `Restored ${r.entity.toLowerCase()}`, removedDetail(r));
}

function removedDetail(r: AnyRecord): AuditEntry["detail"] {
  if (r.entity === "SALE") return { name: r.rows[0].ticketNo, amount: r.rows.reduce((s, x) => s + x.totalAmount, 0) };
  if (r.entity === "PURCHASE") return { name: r.row.itemName, amount: r.row.totalCost };
  if (r.entity === "WASTE") return { name: r.row.itemName, amount: r.row.lossValue };
  return { name: r.row.reason, amount: r.row.amount };
}

export const takeTicketNo = (): string => `T-${db.nextTicket++}`;

/* ---------- catalog ---------- */

export const inventory = (): InventoryItem[] => [...BASE_INVENTORY, ...db.customInventory];
export const inventoryItem = (id: string): InventoryItem | undefined => inventory().find((i) => i.id === id);

export function lastCost(itemId: string): number | undefined {
  let best: PurchaseRecord | undefined;
  for (const p of db.purchases) if (p.itemId === itemId && (!best || p.timestamp > best.timestamp)) best = p;
  return best?.unitCost;
}

export const vendors = (): string[] => [...new Set(db.purchases.map((p) => p.vendor).filter(Boolean))].sort();
export const pastReasons = (): string[] => [...new Set(db.expenses.map((e) => e.reason))];

/* ---------- periods & totals ---------- */

export function rangeFor(period: PeriodId): { start: string; end: string; prevStart: string; prevEnd: string; days: number } {
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const end = today();
  const start = addDays(end, -(days - 1));
  const prevEnd = addDays(start, -1);
  return { start, end, prevStart: addDays(prevEnd, -(days - 1)), prevEnd, days };
}

const inRange = (iso: string, a: string, b: string): boolean => {
  const d = localDay(iso);
  return d >= a && d <= b;
};

/** Same-length comparison window: for "today" compare with the same time yesterday so a half day isn't judged against a full one. */
export function totals(start: string, end: string, cutoffMs?: number): PeriodTotals {
  const ok = (iso: string): boolean => inRange(iso, start, end) && (cutoffMs === undefined || new Date(iso).getTime() <= cutoffMs);
  let sales = 0;
  const tickets = new Set<string>();
  for (const s of db.sales) if (ok(s.timestamp)) { sales += s.totalAmount; tickets.add(s.ticketNo); }
  let purchases = 0;
  for (const p of db.purchases) if (ok(p.timestamp)) purchases += p.totalCost;
  let waste = 0, wastePending = 0;
  for (const w of db.waste) {
    if (!ok(w.timestamp) || w.approval === "REJECTED") continue;
    if (w.approval === "APPROVED") waste += w.lossValue;
    else wastePending += w.lossValue;
  }
  let expenses = 0;
  for (const e of db.expenses) if (ok(e.timestamp)) expenses += e.amount;
  return {
    sales, tickets: tickets.size, purchases, waste, wastePending, expenses,
    grossProfit: sales - purchases - expenses,
    costPct: sales ? (purchases / sales) * 100 : 0,
  };
}

export function periodTotals(): { cur: PeriodTotals; prev: PeriodTotals } {
  const r = rangeFor(state.period);
  if (state.period === "today") {
    const yesterdaySameTime = Date.now() - 86_400_000;
    return { cur: totals(r.start, r.end), prev: totals(r.prevStart, r.prevEnd, yesterdaySameTime) };
  }
  return { cur: totals(r.start, r.end), prev: totals(r.prevStart, r.prevEnd) };
}

export const inPeriod = (iso: string): boolean => {
  const r = rangeFor(state.period);
  return inRange(iso, r.start, r.end);
};
