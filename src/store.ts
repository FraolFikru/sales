/* =========================================================
   Application state: preferences, per-tenant ledgers, form drafts,
   plus pure selectors (metrics, balances, tax position).
   Records live in memory; swap `ledgers` for an API-backed
   repository when connecting a backend.
   ========================================================= */

import type {
  CatalogItem,
  ChartMode,
  ExpenseDraft,
  ExpenseRecord,
  FieldErrors,
  LedgerEntry,
  LedgerFilter,
  MainCategory,
  PaymentMethod,
  PeriodId,
  PeriodMetrics,
  RegisterClose,
  SaleDraft,
  SaleRecord,
  SubCategoryDef,
  SupportedLanguage,
  TaxPosition,
  Tenant,
  TenantLedger,
  ThemeMode,
  UnitDef,
  ViewId,
} from "./types";
import { BASE_ITEMS, BASE_UNITS, PAYMENT_IDS, SUB_CATEGORIES, mainCategoryDef } from "./catalog";
import { TENANTS, generateLedger } from "./seed";
import { addDays, localDay, normalize, today } from "./format";
import { isLanguage, tk, tkAll } from "./i18n";

/* ---------- preferences (persisted per browser) ---------- */

interface Prefs {
  lang: SupportedLanguage;
  theme: ThemeMode;
  tenantId: string;
}

const PREFS_KEY = "bistro-ledger-prefs";

function loadPrefs(): Prefs {
  const fallback: Prefs = { lang: "en", theme: "dark", tenantId: TENANTS[0].id };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      lang: isLanguage(p.lang) ? p.lang : fallback.lang,
      theme: p.theme === "light" ? "light" : "dark",
      tenantId: TENANTS.some((x) => x.id === p.tenantId) ? (p.tenantId as string) : fallback.tenantId,
    };
  } catch {
    return fallback;
  }
}

export function savePrefs(): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ lang: state.lang, theme: state.theme, tenantId: state.tenantId }));
  } catch {
    /* storage unavailable: preferences just won't persist */
  }
}

/* ---------- state ---------- */

export interface UiState {
  lang: SupportedLanguage;
  theme: ThemeMode;
  tenantId: string;
  view: ViewId;
  period: PeriodId;
  chart: ChartMode;
  filter: LedgerFilter;
  tableLimit: number;
  payingId: string | null;
  payMethod: PaymentMethod;
  errors: FieldErrors;
  countedCash: string;
}

const prefs = loadPrefs();

export const state: UiState = {
  ...prefs,
  view: "overview",
  period: "30d",
  chart: "daily",
  filter: { kind: "ALL", status: "ALL", category: "ALL", query: "", missingReceipt: false },
  tableLimit: 12,
  payingId: null,
  payMethod: "CASH",
  errors: {},
  countedCash: "",
};

const ledgers = new Map<string, TenantLedger>(TENANTS.map((t) => [t.id, generateLedger(t)]));

export const tenant = (): Tenant => TENANTS.find((t) => t.id === state.tenantId) ?? TENANTS[0];
export const ledger = (): TenantLedger => {
  const l = ledgers.get(state.tenantId);
  if (!l) throw new Error(`No ledger for ${state.tenantId}`);
  return l;
};

/* ---------- drafts ---------- */

export const newExpenseDraft = (keep: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  query: "", itemId: null, category: "", subCategory: "", quantity: "", unit: "kg", unitPrice: "", total: "",
  lastEdited: "price", vendor: keep.vendor ?? "", date: keep.date ?? today(), settle: keep.settle ?? "PAID",
  paymentMethod: keep.paymentMethod ?? "CASH", dueDate: keep.dueDate ?? addDays(today(), 7),
  vatIncluded: false, vendorHasTin: true, note: "",
});

export const newSaleDraft = (keep: Partial<SaleDraft> = {}): SaleDraft => ({
  channelId: keep.channelId ?? tenant().salesChannels[0], amount: "", date: keep.date ?? today(), settle: "PAID",
  paymentMethod: keep.paymentMethod ?? "CASH", customer: "", customerTin: "", dueDate: addDays(today(), 14),
  fiscalReceiptNo: "", reference: "",
});

export const drafts = { expense: newExpenseDraft(), sale: newSaleDraft() };

export function resetDrafts(): void {
  drafts.expense = newExpenseDraft();
  drafts.sale = newSaleDraft();
  state.errors = {};
}

/* ---------- catalog (shared base + tenant additions) ---------- */

export const catalog = (): CatalogItem[] => [...BASE_ITEMS, ...ledger().customItems];
export const subCategories = (): SubCategoryDef[] => [...SUB_CATEGORIES, ...ledger().customSubCategories];
export const subsOf = (main: MainCategory): SubCategoryDef[] => subCategories().filter((s) => s.mainCategory === main);
export const units = (): UnitDef[] => [...BASE_UNITS, ...ledger().customUnits];
export const itemById = (id: string): CatalogItem | undefined => catalog().find((i) => i.id === id);
export const itemsOf = (sub: string): CatalogItem[] => catalog().filter((i) => i.subCategory === sub);

/** Display name for an item, falling back to the stored key. */
export const itemLabel = (e: Pick<ExpenseRecord, "itemName">): string => tk(e.itemName);

/* ---------- date ranges ---------- */

export interface Range {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  days: number;
}

export function rangeFor(period: PeriodId): Range {
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

/* ---------- selectors ---------- */

/** Money in each payment source right now: opening balance + paid sales − paid expenses. */
export function balances(): Record<PaymentMethod, number> {
  const out = { ...tenant().openingBalances } as Record<PaymentMethod, number>;
  const l = ledger();
  for (const s of l.sales) if (s.status === "PAID" && s.paymentMethod) out[s.paymentMethod] += s.totalAmount;
  for (const e of l.expenses) if (e.status === "PAID" && e.paymentMethod) out[e.paymentMethod] -= e.totalAmount - e.withholdingAmount;
  return out;
}

export const totalBalance = (): number => PAYMENT_IDS.reduce((s, m) => s + balances()[m], 0);

export function metrics(start: string, end: string): PeriodMetrics {
  const l = ledger();
  let grossSales = 0, vatOutput = 0, receivables = 0;
  for (const s of l.sales) {
    if (!inRange(s.timestamp, start, end)) continue;
    grossSales += s.totalAmount;
    vatOutput += s.vatAmount;
    if (s.status === "PENDING") receivables += s.totalAmount;
  }
  let expense = 0, vatInput = 0, cogs = 0, labor = 0, waste = 0, unpaid = 0;
  for (const e of l.expenses) {
    if (!inRange(e.timestamp, start, end)) continue;
    const net = e.totalAmount - e.vatAmount; // recoverable input VAT is not a cost
    expense += net;
    vatInput += e.vatAmount;
    const group = mainCategoryDef(e.category).group;
    if (group === "COGS") cogs += net;
    if (group === "LABOR") labor += net;
    if (e.subCategory === "COGS_WASTE") waste += net;
    if (e.status === "PENDING") unpaid += e.totalAmount;
  }
  const revenue = grossSales - vatOutput;
  const netProfit = revenue - expense;
  return {
    totalRevenue: revenue, totalExpense: expense, totalBalance: totalBalance(),
    profitMargin: revenue ? (netProfit / revenue) * 100 : 0,
    grossSales, vatOutput, vatInput, cogs, labor, waste, netProfit, unpaidExpense: unpaid, receivables,
  };
}

export function spendByCategory(start: string, end: string): { id: MainCategory; amount: number }[] {
  const m = new Map<MainCategory, number>();
  for (const e of ledger().expenses) {
    if (!inRange(e.timestamp, start, end)) continue;
    m.set(e.category, (m.get(e.category) ?? 0) + e.totalAmount - e.vatAmount);
  }
  return [...m.entries()].map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount);
}

/** VAT and withholding owed for the current calendar month. */
export function taxPosition(): TaxPosition {
  const now = today();
  const monthStart = `${now.slice(0, 8)}01`;
  const m = metrics(monthStart, now);
  const l = ledger();
  const withholdingToRemit = l.expenses
    .filter((e) => e.status === "PAID" && e.withholdingAmount > 0 && localDay(e.timestamp) >= monthStart)
    .reduce((s, e) => s + e.withholdingAmount, 0);
  const salesMissingReceipt = l.sales.filter((s) => !s.fiscalReceiptNo && localDay(s.timestamp) >= addDays(now, -6)).length;
  return { vatOutput: m.vatOutput, vatInput: m.vatInput, vatPayable: m.vatOutput - m.vatInput, withholdingToRemit, salesMissingReceipt };
}

export const isOverdue = (r: { status: string; dueDate: string | null }): boolean =>
  r.status === "PENDING" && r.dueDate !== null && r.dueDate < today();

export const payables = (): ExpenseRecord[] =>
  ledger().expenses.filter((e) => e.status === "PENDING").sort((a, b) => (a.dueDate ?? "9") < (b.dueDate ?? "9") ? -1 : 1);

export const receivables = (): SaleRecord[] =>
  ledger().sales.filter((s) => s.status === "PENDING").sort((a, b) => (a.dueDate ?? "9") < (b.dueDate ?? "9") ? -1 : 1);

export function ledgerEntries(f: LedgerFilter): LedgerEntry[] {
  const q = normalize(f.query);
  const l = ledger();
  const rows: LedgerEntry[] = [];
  const statusOk = (s: string): boolean => f.status === "ALL" || s === f.status;
  if (f.kind !== "EXPENSE" && f.category === "ALL") {
    for (const s of l.sales) {
      if (!statusOk(s.status)) continue;
      if (f.missingReceipt && s.fiscalReceiptNo) continue;
      if (q && ![...tkAll(`channel.${s.channelId}`), s.customer, s.fiscalReceiptNo, s.paymentMethod ? tk(`pay.${s.paymentMethod}`) : ""]
        .some((h) => normalize(h).includes(q))) continue;
      rows.push({ kind: "SALE", record: s });
    }
  }
  if (f.kind !== "SALE" && !f.missingReceipt) {
    for (const e of l.expenses) {
      if (!statusOk(e.status)) continue;
      if (f.category !== "ALL" && e.category !== f.category) continue;
      if (q && ![...tkAll(e.itemName), e.vendor, ...tkAll(`sub.${e.subCategory}`), ...tkAll(`catShort.${e.category}`), ...(itemById(e.itemId)?.aliases ?? [])]
        .some((h) => normalize(h).includes(q))) continue;
      rows.push({ kind: "EXPENSE", record: e });
    }
  }
  return rows.sort((a, b) => (a.record.timestamp < b.record.timestamp ? 1 : -1));
}

/** Cash that should be in the drawer at the end of a day. */
export function expectedCash(day: string): { float: number; cashIn: number; cashOut: number; expected: number } {
  const l = ledger();
  const float = tenant().cashFloat;
  const cashIn = l.sales.filter((s) => s.paymentMethod === "CASH" && s.paidAt && localDay(s.paidAt) === day).reduce((a, s) => a + s.totalAmount, 0);
  const cashOut = l.expenses
    .filter((e) => e.paymentMethod === "CASH" && e.paidAt && localDay(e.paidAt) === day)
    .reduce((a, e) => a + e.totalAmount - e.withholdingAmount, 0);
  return { float, cashIn, cashOut, expected: float + cashIn - cashOut };
}

export const lastPurchaseOf = (itemId: string): ExpenseRecord | undefined =>
  ledger().expenses.filter((e) => e.itemId === itemId).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];

export const usageCount = (itemId: string): number => ledger().expenses.reduce((n, e) => n + (e.itemId === itemId ? 1 : 0), 0);

/* ---------- mutations ---------- */

export function addExpense(e: ExpenseRecord): void {
  ledger().expenses.push(e);
  if (e.vendor && !ledger().vendors.includes(e.vendor)) ledger().vendors.push(e.vendor);
}

export function addSale(s: SaleRecord): void {
  ledger().sales.push(s);
}

export function removeRecord(id: string): ExpenseRecord | SaleRecord | undefined {
  const l = ledger();
  const ei = l.expenses.findIndex((e) => e.id === id);
  if (ei >= 0) return l.expenses.splice(ei, 1)[0];
  const si = l.sales.findIndex((s) => s.id === id);
  if (si >= 0) return l.sales.splice(si, 1)[0];
  return undefined;
}

export function restoreRecord(r: ExpenseRecord | SaleRecord): void {
  if ("itemId" in r) ledger().expenses.push(r);
  else ledger().sales.push(r);
}

export function findRecord(id: string): ExpenseRecord | SaleRecord | undefined {
  const l = ledger();
  return l.expenses.find((e) => e.id === id) ?? l.sales.find((s) => s.id === id);
}

export function addRegisterClose(c: RegisterClose): void {
  ledger().registerCloses.unshift(c);
}

export function takeFiscalNo(): string {
  const l = ledger();
  return `FS-${String(l.nextFiscalNo++).padStart(8, "0")}`;
}
