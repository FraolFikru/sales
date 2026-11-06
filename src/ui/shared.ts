/* Widgets shared by several screens: the metrics bar, change chips,
   status tags, segmented controls and form error helpers. */

import type { FieldErrors, PaymentMethod, PeriodId, SettlementStatus } from "../types";
import { t, tk } from "../i18n";
import { localDay, money, moneyNeg, pct } from "../format";
import { PAYMENT_IDS } from "../catalog";
import { isOverdue, ledger, metrics, rangeFor, state, totalBalance } from "../store";
import { $, esc, icon, type IconName } from "./dom";

/* ---------- change chips ---------- */

export function changePct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** ▲/▼ chip coloured by whether the direction is good for this metric. */
export function chip(change: number | null, higherIsGood: boolean, unit: "%" | "pts" = "%"): string {
  if (change === null || !Number.isFinite(change)) return `<span class="chip flat">—</span>`;
  if (Math.abs(change) < 0.05) return `<span class="chip flat">0${unit === "%" ? "%" : ` ${t("pts")}`}</span>`;
  const up = change > 0;
  const good = up === higherIsGood;
  const value = unit === "%" ? `${Math.abs(change).toFixed(1)}%` : `${Math.abs(change).toFixed(1)} ${t("pts")}`;
  return `<span class="chip ${good ? "good" : "bad"}"><span aria-hidden="true">${up ? "▲" : "▼"}</span><span class="sr">${up ? t("up") : t("down")}</span>${value}</span>`;
}

export function statusTag(r: { status: SettlementStatus; dueDate: string | null }, adjustment = false): string {
  if (adjustment) return `<span class="tag plain">${t("Non-cash")}</span>`;
  if (r.status === "PAID") return `<span class="tag paid">${t("Paid")}</span>`;
  if (isOverdue(r)) return `<span class="tag overdue">${t("Overdue")}</span>`;
  return `<span class="tag pending">${t("Pending")}</span>`;
}

export const payName = (m: PaymentMethod | null): string => (m ? tk(`pay.${m}`) : "");

/* ---------- segmented control ---------- */

export function seg(action: string, current: string, options: readonly (readonly [string, string])[], label: string, extra = ""): string {
  return `<div class="seg ${extra}" role="group" aria-label="${esc(label)}">${options
    .map(([v, l]) => `<button type="button" data-action="${action}" data-value="${esc(v)}" aria-pressed="${current === v}">${l}</button>`)
    .join("")}</div>`;
}

/* ---------- metrics bar ---------- */

/** Today / 7 days / 30 days switch, shown in each page header. */
export const periodSeg = (): string =>
  seg("period", state.period, (Object.keys(PERIOD_LABEL) as PeriodId[]).map((p) => [p, t(PERIOD_LABEL[p])] as const), t("Period"), "small");

const PERIOD_LABEL: Record<PeriodId, string> = { today: "Today", "7d": "7 days", "30d": "30 days" };

function cashFlow(start: string, end: string): number {
  const l = ledger();
  let flow = 0;
  for (const s of l.sales) if (s.status === "PAID" && s.paidAt && localDay(s.paidAt) >= start && localDay(s.paidAt) <= end) flow += s.totalAmount;
  for (const e of l.expenses) if (e.status === "PAID" && e.paymentMethod && e.paidAt && localDay(e.paidAt) >= start && localDay(e.paidAt) <= end) flow -= e.totalAmount - e.withholdingAmount;
  return flow;
}

export function metricsBar(): string {
  const r = rangeFor(state.period);
  const cur = metrics(r.start, r.end);
  const prev = metrics(r.prevStart, r.prevEnd);
  const balance = totalBalance();
  const flow = cashFlow(r.start, r.end);
  const vsLabel = r.days === 1 ? t("vs yesterday") : t("vs previous {n} days", { n: r.days });
  const card = (cls: string, ic: IconName, title: string, value: string, change: string, note: string, valueCls = ""): string => `
    <article class="metric ${cls}">
      <div class="metric-top"><span>${title}</span><span class="metric-ic">${icon(ic)}</span></div>
      <div class="metric-value ${valueCls}">${value}</div>
      <div class="metric-foot">${change}<span>${vsLabel}</span></div>
      <div class="metric-note">${note}</div>
    </article>`;

  return `
    <section class="metrics" aria-labelledby="metricsTitle">
      <h2 class="sr" id="metricsTitle">${t("Financial summary")}</h2>
      <div class="metric-grid">
        ${card("m-rev", "trendUp", t("Total Revenue"), money(cur.totalRevenue, 0), chip(changePct(cur.totalRevenue, prev.totalRevenue), true),
          t("Excl. VAT · {x} collected incl. VAT", { x: money(cur.grossSales, 0) }))}
        ${card("m-exp", "trendDown", t("Total Expense"), money(cur.totalExpense, 0), chip(changePct(cur.totalExpense, prev.totalExpense), false),
          cur.unpaidExpense ? t("{x} still unpaid", { x: money(cur.unpaidExpense, 0) }) : t("All paid"))}
        ${card("m-bal", "wallet", t("Total Balance"), moneyNeg(balance, 0), chip(changePct(balance, balance - flow), true),
          t("Across {n} payment sources", { n: PAYMENT_IDS.length }), balance < 0 ? "neg" : "")}
        ${card("m-mar", "percent", t("Profit Margin"), pct(cur.profitMargin), chip(cur.profitMargin - prev.profitMargin, true, "pts"),
          t("Net profit {x}", { x: moneyNeg(cur.netProfit, 0) }), cur.profitMargin < 0 ? "neg" : "")}
      </div>
    </section>`;
}

/* ---------- form errors ---------- */

export const errText = (errors: FieldErrors, key: string): string => `<p class="err" id="err-${key}">${esc(errors[key] ?? "")}</p>`;
export const invalid = (errors: FieldErrors, key: string): string =>
  `aria-invalid="${errors[key] ? "true" : "false"}" aria-describedby="err-${key}"`;

export function clearErrors(keys: readonly string[]): void {
  for (const k of keys) {
    if (!state.errors[k]) continue;
    delete state.errors[k];
    const p = $(`#err-${k}`);
    if (p) p.textContent = "";
    document.querySelector(`[aria-describedby="err-${k}"]`)?.setAttribute("aria-invalid", "false");
  }
}

export function showErrors(errors: FieldErrors, order: readonly string[]): boolean {
  state.errors = errors;
  for (const k of order) {
    const p = $(`#err-${k}`);
    if (p) p.textContent = errors[k] ?? "";
    document.querySelector(`[aria-describedby="err-${k}"]`)?.setAttribute("aria-invalid", errors[k] ? "true" : "false");
  }
  const first = order.find((k) => errors[k]);
  if (first) document.querySelector<HTMLElement>(`[aria-describedby="err-${first}"]`)?.focus();
  return Boolean(first);
}

export const setPressed = (el: HTMLElement): void =>
  el.parentElement?.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === el)));
