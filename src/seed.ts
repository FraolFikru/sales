/* =========================================================
   Sample tenants and ~10 weeks of generated history, built relative
   to today's date so the dashboard always looks current.
   Deterministic (seeded) so the numbers are stable between reloads.
   ========================================================= */

import type { CatalogItem, ExpenseRecord, PaymentMethod, SaleRecord, Tenant, TenantLedger } from "./types";
import { BASE_ITEMS } from "./catalog";
import { addDays, parseDay, round2, stamp, today } from "./format";
import { vatFromGross, withholdingFor } from "./tax";

export const TENANTS: readonly Tenant[] = [
  {
    id: "bistro-addis",
    name: "Bistro Addis",
    type: "RESTAURANT",
    location: "Bole, Addis Ababa",
    tin: "0012345678",
    vatRegistered: true,
    withholdingAgent: true,
    openingBalances: { CASH: 15_000, TELEBIRR: 40_000, CBE_BIRR: 600_000, M_PESA: 6_000, CARD: 90_000, PETTY_CASH: 5_000 },
    cashFloat: 3_000,
    salesChannels: ["lunch", "dinner", "coffee", "takeaway", "catering"],
  },
  {
    id: "shola-market",
    name: "Shola Mini Market",
    type: "RETAIL",
    location: "Shola, Addis Ababa",
    tin: "0098765432",
    vatRegistered: true,
    withholdingAgent: false,
    openingBalances: { CASH: 8_000, TELEBIRR: 22_000, CBE_BIRR: 60_000, M_PESA: 3_000, CARD: 25_000, PETTY_CASH: 2_000 },
    cashFloat: 2_000,
    salesChannels: ["counter", "wholesale", "delivery"],
  },
];

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

let idCounter = 0;
export const newId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(++idCounter).toString(36)}`;

const byId = (id: string): CatalogItem => {
  const it = BASE_ITEMS.find((i) => i.id === id);
  if (!it) throw new Error(`Unknown item ${id}`);
  return it;
};

interface BuyOptions {
  method?: PaymentMethod;
  /** bought on credit: due this many days later */
  creditDays?: number;
  /** keep it unpaid regardless of age */
  forcePending?: boolean;
  /** credit purchases younger than this many days are still unpaid */
  pendingWindow?: number;
  price?: number;
  hour?: number;
  vatIncluded?: boolean;
  exactPrice?: boolean;
}

const SALE_SPLIT: readonly [PaymentMethod, number][] = [
  ["CASH", 0.38], ["TELEBIRR", 0.27], ["CBE_BIRR", 0.15], ["CARD", 0.14], ["M_PESA", 0.06],
];

export function generateLedger(tenant: Tenant): TenantLedger {
  const r = rng(tenant.type === "RESTAURANT" ? 20261106 : 777);
  const now = today();
  const expenses: ExpenseRecord[] = [];
  const sales: SaleRecord[] = [];
  let fiscal = tenant.type === "RESTAURANT" ? 18_420 : 5_310;
  const between = (a: number, b: number): number => Math.round(a + r() * (b - a));
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];

  const buy = (day: string, id: string, qty: number, vendor: string, o: BuyOptions = {}): void => {
    const it = byId(id);
    const base = o.price ?? it.defaultPrice;
    const unitPrice = o.exactPrice ? base : base >= 20 ? Math.round(base * (0.95 + r() * 0.1)) : round2(base * (0.95 + r() * 0.1));
    const total = round2(qty * unitPrice);
    const adjustment = it.kind === "ADJUSTMENT";
    const vatIncluded = !adjustment && (o.vatIncluded ?? it.vatApplicable);
    const wht = withholdingFor(it, total, true, tenant.withholdingAgent);
    const ts = stamp(day, o.hour ?? between(7, 16), between(0, 59));
    const rec: ExpenseRecord = {
      id: newId("exp"), itemId: it.id, itemName: it.nameKey, category: it.mainCategory, subCategory: it.subCategory,
      quantity: qty, unit: it.defaultUnit, unitPrice, totalAmount: total,
      paymentMethod: adjustment ? null : o.method ?? "CASH", timestamp: ts,
      tenantId: tenant.id, vendor: adjustment ? "" : vendor, status: "PAID", dueDate: null, paidAt: ts,
      vatAmount: vatIncluded ? vatFromGross(total) : 0, withholdingAmount: wht.amount, withholdingRate: wht.rate, note: "",
    };
    if (o.creditDays !== undefined && !adjustment) {
      rec.dueDate = addDays(day, o.creditDays);
      const age = Math.round((parseDay(now).getTime() - parseDay(day).getTime()) / 86_400_000);
      if (o.forcePending || age <= (o.pendingWindow ?? 9)) {
        rec.status = "PENDING";
        rec.paymentMethod = null;
        rec.paidAt = null;
      } else {
        rec.paidAt = stamp(rec.dueDate, 10);
        rec.paymentMethod = o.method ?? "CBE_BIRR";
      }
    }
    expenses.push(rec);
  };

  const sell = (day: string, channelId: string, total: number, method: PaymentMethod, hour: number, missingReceipt = false): void => {
    const ts = stamp(day, hour, between(0, 59));
    sales.push({
      id: newId("sale"), tenantId: tenant.id, channelId, totalAmount: total, vatAmount: tenant.vatRegistered ? vatFromGross(total) : 0,
      paymentMethod: method, status: "PAID", timestamp: ts, paidAt: ts, customer: "", customerTin: "",
      fiscalReceiptNo: missingReceipt ? "" : `FS-${String(++fiscal).padStart(8, "0")}`, dueDate: null, reference: "",
    });
  };

  const invoice = (day: string, channelId: string, total: number, customer: string, tin: string, days: number): void => {
    const ts = stamp(day, 11);
    const due = addDays(day, days);
    const age = Math.round((parseDay(now).getTime() - parseDay(day).getTime()) / 86_400_000);
    const paid = age > 12;
    sales.push({
      id: newId("sale"), tenantId: tenant.id, channelId, totalAmount: total, vatAmount: tenant.vatRegistered ? vatFromGross(total) : 0,
      paymentMethod: paid ? "CBE_BIRR" : null, status: paid ? "PAID" : "PENDING", timestamp: ts, paidAt: paid ? stamp(due, 15) : null,
      customer, customerTin: tin, fiscalReceiptNo: `FS-${String(++fiscal).padStart(8, "0")}`, dueDate: due, reference: "",
    });
  };

  /** split a service total across payment methods */
  const service = (day: string, channelId: string, amount: number, hour: number, missingOk: boolean): void => {
    for (const [m, share] of SALE_SPLIT) {
      const v = Math.round((amount * share * (0.85 + r() * 0.3)) / 10) * 10;
      if (v > 0) sell(day, channelId, v, m, hour, missingOk && r() < 0.03);
    }
  };

  for (let back = 69; back >= 0; back--) {
    const day = addDays(now, -back);
    const d = parseDay(day);
    const dow = d.getDay();
    const weekend = dow === 0 || dow === 6;
    const isToday = back === 0;
    const firstOfMonth = d.getDate() === 1;
    const lastOfMonth = parseDay(addDays(day, 1)).getDate() === 1;
    const thisMonth = parseDay(now).getMonth() === d.getMonth();
    const recent = back <= 7;
    const boost = weekend ? 1.25 : 1;

    if (tenant.type === "RESTAURANT") {
      /* ----- sales ----- */
      service(day, "lunch", 15_000 * boost * (0.86 + r() * 0.28), 13, recent);
      if (!isToday) service(day, "dinner", 21_000 * boost * (0.86 + r() * 0.28), 20, recent);
      service(day, "coffee", 3_800 * (0.86 + r() * 0.28), 10, recent);
      service(day, "takeaway", 2_800 * (0.8 + r() * 0.4), 14, recent);
      if (back % 6 === 3) invoice(day, "catering", between(9000, 14000), "Zemen Office Lunch", "0045671234", 14);

      /* ----- COGS ----- */
      const produce = back % 2 ? "Merkato Fresh Produce" : "Shola Vegetables";
      buy(day, "injera", between(110, 140), "Alem Injera Bakery", { hour: 7 });
      buy(day, "onion", between(8, 14), produce, { method: pick(["CASH", "TELEBIRR"] as const), hour: 8 });
      buy(day, "tomato", between(6, 10), produce, { method: pick(["CASH", "TELEBIRR"] as const), hour: 8 });
      if (back % 2 === 0) { buy(day, "green-pepper", between(3, 5), produce, { hour: 8 }); buy(day, "potato", between(10, 15), produce, { hour: 8 }); }
      if (back % 2 === 1) buy(day, "beef", between(9, 14), "Kaliti Meat Supply", { creditDays: 7, pendingWindow: 8, hour: 9 });
      if (back % 3 === 0) {
        buy(day, "chicken", between(8, 12), "Kaliti Meat Supply", { creditDays: 7, pendingWindow: 7, hour: 9 });
        buy(day, "eggs", 90, "Sheger Dairy", { hour: 9 });
        buy(day, "kibbeh", between(2, 3), "Sheger Dairy", { creditDays: 7, pendingWindow: 7, hour: 9 });
        buy(day, "milk", 20, "Sheger Dairy", { method: "TELEBIRR", hour: 9 });
      }
      if (back % 7 === 1) {
        buy(day, "berbere", 3, "Habesha Grain Store", { method: "CBE_BIRR" });
        buy(day, "oil", 10, "Habesha Grain Store", { method: "CBE_BIRR" });
        buy(day, "olive-oil", 2, "Habesha Grain Store", { method: "CBE_BIRR" });
      }
      if (d.getDate() === 2) buy(day, "teff", 150, "Habesha Grain Store", { method: "CBE_BIRR", exactPrice: true }); // ≥ ETB 20,000 → withholding
      if (back % 7 === 4) {
        buy(day, "soft-drinks", 4, "Bole Beverage Distributors", { creditDays: 14, pendingWindow: 13 });
        buy(day, "beer", 4, "Bole Beverage Distributors", { creditDays: 14, pendingWindow: 13 });
        buy(day, "water", 5, "Bole Beverage Distributors", { method: "CASH" });
        buy(day, "coffee", 4, "Yirga Coffee Roasters", { method: "TELEBIRR" });
      }
      if (back % 10 === 5) {
        buy(day, "takeaway-box", 2, "Addis Packaging", { method: "CASH" });
        buy(day, "napkins", 2, "Addis Packaging", { method: "CASH" });
        buy(day, "foil", 2, "Addis Packaging", { method: "CASH" });
      }
      // waste, staff meals and comps (non-cash, but they are real costs)
      if (back % 2 === 0) buy(day, "spoilage", between(1, 3), "", { hour: 22 });
      buy(day, "staff-meal", 8, "", { exactPrice: true, hour: 15 });
      if (back % 5 === 2) buy(day, "manager-comp", 1, "", { price: between(250, 600), exactPrice: true, hour: 21 });

      /* ----- labor ----- */
      if (dow === 5 || dow === 6) buy(day, "casual-hours", 16, "Casual staff", { method: "CASH", exactPrice: true, hour: 23 });
      if (lastOfMonth) {
        buy(day, "salary-kitchen", 1, "Staff payroll", { method: "CBE_BIRR", exactPrice: true, hour: 17 });
        buy(day, "salary-floor", 1, "Staff payroll", { method: "CBE_BIRR", exactPrice: true, hour: 17 });
        buy(day, "salary-manager", 1, "Staff payroll", { method: "CBE_BIRR", exactPrice: true, hour: 17 });
        buy(day, "pension", 1, "POESSA (pension)", { price: 27_000, exactPrice: true, creditDays: 30, pendingWindow: 31, hour: 17 });
        buy(day, "paye", 1, "Ministry of Revenues", { price: 38_500, exactPrice: true, creditDays: 30, pendingWindow: 31, hour: 17 });
      }

      /* ----- facilities, tech, marketing ----- */
      if (firstOfMonth) {
        const bill = (id: string, vendor: string, dueDay: number): void =>
          buy(day, id, 1, vendor, { creditDays: dueDay - 1, forcePending: thisMonth, pendingWindow: -1, method: "TELEBIRR", exactPrice: true, hour: 9 });
        bill("electricity", "Ethiopian Electric Utility", 10);
        bill("water-bill", "AA Water & Sewerage", 15);
        bill("internet", "Ethio telecom", 5);
        bill("cloud-pos", "Cloud POS provider", 3);
        bill("trash-collection", "Bole Sub-city Sanitation", 10);
        buy(day, "cleaning-contract", 1, "Kebena Cleaning Services", { method: "CBE_BIRR", exactPrice: true });
        buy(day, "social-ads", 1, "Meta Ads", { method: "CARD", exactPrice: true });
      }
      if (back % 14 === 9) buy(day, "gas", 2, "Habesha Grain Store", { method: "CASH", exactPrice: true });
      if (back % 10 === 7) buy(day, "dish-soap", 5, "Addis Packaging", { method: "PETTY_CASH" });
      if (back === 18) buy(day, "fridge-repair", 1, "Abebe Cooling Service", { method: "CASH" });
      if (back === 4) buy(day, "plumbing", 1, "Abebe Cooling Service", { creditDays: 10, forcePending: true });
      if (back === 11) buy(day, "onsite-ad", 1, "Sheger Signs", { method: "CBE_BIRR", exactPrice: true });
      if (back === 6) buy(day, "market-run", 1, "Merkato", { method: "PETTY_CASH", price: 640, exactPrice: true });
    } else {
      /* ----- retail ----- */
      service(day, "counter", 10_500 * boost * (0.85 + r() * 0.3), 18, recent);
      service(day, "delivery", 2_200 * (0.8 + r() * 0.4), 19, recent);
      if (back % 7 === 2) invoice(day, "wholesale", between(7000, 11000), "Kebede Kiosk", "0067812345", 10);

      buy(day, "soft-drinks", between(5, 8), "Bole Beverage Distributors", { creditDays: 14, pendingWindow: 13, hour: 9 });
      buy(day, "water", between(4, 7), "Bole Beverage Distributors", { method: "CASH", hour: 9 });
      if (back % 4 === 1) buy(day, "beer", between(6, 10), "Bole Beverage Distributors", { creditDays: 14, pendingWindow: 13, hour: 9 });
      if (back % 7 === 3) buy(day, "carry-bags", 6, "Addis Packaging", { method: "CASH" });
      if (back % 5 === 0) buy(day, "expired", 1, "", { price: between(150, 420), exactPrice: true, hour: 21 });
      if (back % 9 === 4) buy(day, "register-short", 1, "", { price: between(50, 220), exactPrice: true, hour: 21 });
      if (back % 8 === 6) buy(day, "market-run", 1, "Shola Market", { method: "PETTY_CASH", price: between(200, 500), exactPrice: true });
      if (lastOfMonth) {
        buy(day, "salary-floor", 2, "Staff payroll", { method: "CBE_BIRR", price: 9_000, exactPrice: true, hour: 17 });
        buy(day, "pension", 1, "POESSA (pension)", { price: 1_980, exactPrice: true, creditDays: 30, pendingWindow: 31 });
      }
      if (firstOfMonth) {
        buy(day, "electricity", 1, "Ethiopian Electric Utility", { price: 2_800, exactPrice: true, creditDays: 9, forcePending: thisMonth, pendingWindow: -1, method: "TELEBIRR" });
        buy(day, "cloud-pos", 1, "Cloud POS provider", { price: 1_200, exactPrice: true, method: "CARD" });
        buy(day, "internet", 1, "Safaricom Ethiopia", { exactPrice: true, method: "M_PESA" });
      }
      if (back === 15) buy(day, "flyers", 500, "Shola Print", { method: "CASH", exactPrice: true });
    }
  }

  const vendors = [...new Set(expenses.map((e) => e.vendor).filter(Boolean))].sort();
  return { expenses, sales, registerCloses: [], vendors, customItems: [], customSubCategories: [], customUnits: [], nextFiscalNo: fiscal + 1 };
}
