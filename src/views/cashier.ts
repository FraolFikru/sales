/* Cashier — the till. Orders sent by waiters wait here, oldest first.
   The cashier picks one, applies any discount, chooses how the guest pays,
   enters cash received (change is worked out) or the mobile-money / card
   reference, and takes payment. Only then does the order become a sale,
   stamped with the waiter who served it and the cashier who was paid. */

import type { OpenOrder, SaleRecord } from "../types";
import { t, tk } from "../i18n";
import { fmtTime, localDay, money, parseAmount, today } from "../format";
import { MENU, NEEDS_REF, SALE_METHODS, isSaleMethod } from "../catalog";
import { canDelete, db, orderTotal, removeRecord, restoreRecord, state, takePayment, unpay, user } from "../store";
import { $, esc, icon } from "../ui/dom";
import { byline, errText, payName, showErrors } from "../ui/shared";
import { toast } from "../ui/toast";
import { rerender, type ActionMap } from "../ui/app";
import { lineSummary, tableName, waitedMin } from "./sales";

/** Opening cash float in the drawer at the start of each shift. */
export const OPENING_FLOAT = 2000;

const queue = (): OpenOrder[] => [...db.openOrders].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

/** Keep a valid selection: the chosen order, or the one that has waited longest. */
function selected(): OpenOrder | undefined {
  const q = queue();
  let o = q.find((x) => x.ticketNo === state.cashierSel);
  if (!o && q.length) {
    o = q[0];
    selectOrder(o);
  }
  return o;
}

function selectOrder(o: OpenOrder | undefined): void {
  state.cashierSel = o?.ticketNo ?? null;
  state.payPrices = o ? o.lines.map((l) => l.unitPrice) : [];
  state.payMethod = "CASH";
  state.tendered = "";
  state.payRef = "";
  state.errors = {};
}

const dueTotal = (o: OpenOrder): number => o.lines.reduce((s, l, i) => s + l.quantity * (state.payPrices[i] ?? l.unitPrice), 0);

const waitClass = (min: number): string => (min >= 15 ? "late" : min >= 8 ? "slow" : "");

function queuePanel(): string {
  const q = queue();
  const total = q.reduce((s, o) => s + orderTotal(o), 0);
  return `
    <div class="card-head"><div><h2 id="queueTitle">${t("Waiting to pay")}</h2><p>${t("{n} orders · {x}", { n: q.length, x: money(total, 0) })}</p></div></div>
    ${q.length ? `<ul class="queue">${q.map((o) => {
      const min = waitedMin(o.createdAt);
      const items = o.lines.reduce((s, l) => s + l.quantity, 0);
      return `<li><button type="button" class="queue-item" data-action="pick-order" data-value="${esc(o.ticketNo)}" aria-pressed="${state.cashierSel === o.ticketNo}">
        <span class="q-table${o.table === "TA" ? " ta" : ""}" aria-hidden="true">${o.table === "TA" ? icon("box") : esc(o.table)}</span>
        <span class="q-main"><strong>${esc(tableName(o.table))} · ${esc(o.ticketNo)}</strong>
          <small>${t("{n} items", { n: items })} · ${t("Waiter")}: ${esc(o.servedBy)}</small></span>
        <span class="q-side"><span class="num">${money(orderTotal(o))}</span><small class="q-wait ${waitClass(min)}">${t("{n} min", { n: min })}</small></span>
      </button></li>`;
    }).join("")}</ul>` : `<div class="empty"><strong>${t("No orders waiting")}</strong>${t("Orders appear here when a waiter sends them.")}</div>`}`;
}

function changeLine(o: OpenOrder): string {
  const due = dueTotal(o);
  const got = parseAmount(state.tendered);
  if (!state.tendered.trim() || !(got >= 0)) return `<span class="meta">${t("Enter cash received to see change")}</span>`;
  const diff = got - due;
  return diff >= 0
    ? `<span>${t("Change to give")}</span> <strong class="change-amt">${money(diff, 2)}</strong>`
    : `<span class="warn-text">${t("Short by {x}", { x: money(-diff, 2) })}</span>`;
}

/** Quick-cash buttons: exact, then the next round notes above the total. */
function quickCash(due: number): number[] {
  const out = new Set<number>([Math.ceil(due)]);
  for (const step of [50, 100, 500, 1000]) {
    const v = Math.ceil(due / step) * step;
    if (v > due) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

function payPanel(): string {
  const o = selected();
  if (!o) return `<div class="empty pay-empty">${icon("drawer")}<strong>${t("Select an order to take payment")}</strong></div>`;
  const due = dueTotal(o);
  const list = o.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const discount = list - due;
  const e = state.errors;
  const isCash = state.payMethod === "CASH";
  const needsRef = NEEDS_REF.includes(state.payMethod);
  return `
    <div class="card-head"><div><h2 id="payTitle">${esc(tableName(o.table))} · ${esc(o.ticketNo)}</h2>
      <p>${t("Waiter: {name}", { name: esc(o.servedBy) })} · ${t("sent {time}", { time: fmtTime(o.createdAt) })}</p></div>
      <span class="role-tag role-cashier">${t("Cashier: {name}", { name: esc(user().name) })}</span></div>
    ${o.note ? `<p class="order-note">${icon("alert")} ${esc(o.note)}</p>` : ""}
    <ul class="ticket-lines">${o.lines.map((l, i) => {
      const m = MENU.find((x) => x.id === l.menuItemId);
      const final = state.payPrices[i] ?? l.unitPrice;
      return `<li class="ticket-line no-step">
        <div class="tl-name"><strong>${l.quantity}× ${esc(m ? tk(m.nameKey) : l.menuItemId)}</strong>
          <small>${final !== l.unitPrice ? `<s>${money(l.unitPrice)}</s> ` : ""}${t("{x} each", { x: money(final) })}</small></div>
        <label class="price-edit"><span class="sr">${t("Final price per item")}</span>
          <span class="affix"><span>ETB</span><input class="input num-in" inputmode="decimal" value="${final}" data-line-price="${i}" aria-label="${t("Final price per item")}"></span></label>
        <span class="num tl-total">${money(l.quantity * final)}</span>
      </li>`;
    }).join("")}</ul>
    ${errText(e, "lines")}
    <div class="field"><span class="label" id="payLbl">${t("How is the guest paying?")}</span>
      <div class="pay-grid five" role="group" aria-labelledby="payLbl">${SALE_METHODS.map((m) =>
        `<button type="button" class="pay-opt" data-action="pay-method" data-value="${m}" aria-pressed="${state.payMethod === m}"><strong>${esc(payName(m))}</strong></button>`).join("")}</div></div>
    ${isCash ? `
    <div class="field"><label for="tendered">${t("Cash received")}</label>
      <span class="affix"><span>ETB</span><input id="tendered" class="input num-in big-in" inputmode="decimal" autocomplete="off" value="${esc(state.tendered)}" data-bind="pay.tendered" aria-describedby="changeLine err-tendered" ${e.tendered ? 'aria-invalid="true"' : ""}></span>
      <div class="quick-cash" role="group" aria-label="${t("Quick amounts")}">${quickCash(due).map((v, i) =>
        `<button type="button" class="btn small" data-action="quick-cash" data-value="${v}">${i === 0 && v === Math.ceil(due) ? t("Exact") + " · " : ""}${money(v, 0)}</button>`).join("")}</div>
      <p class="change-line" id="changeLine" aria-live="polite">${changeLine(o)}</p>
      ${errText(e, "tendered")}</div>` : `
    <div class="field"><label for="payRef">${needsRef ? t("Transaction / slip number") : t("Reference")} <span class="meta">${t("(optional)")}</span></label>
      <input id="payRef" class="input" autocomplete="off" maxlength="40" value="${esc(state.payRef)}" data-bind="pay.ref" placeholder="${state.payMethod === "CARD" ? t("e.g. slip 4821") : t("e.g. FT24A1B2C3")}"></div>`}
    <div class="total-bar">
      <div><span class="label">${t("Total to collect")}</span><output id="dueTotal" aria-live="polite">${money(due, 2)}</output>
        <small id="discountNote">${discount > 0.004 ? t("Discount {x}", { x: money(discount, 2) }) : ""}</small></div>
      <button type="button" class="btn primary big" data-action="take-payment">${icon("check")} ${t("Take payment")}</button>
    </div>`;
}

function drawer(): string {
  const me = user();
  const manager = canDelete();
  const now = today();
  const byMethod = new Map<string, number>();
  let collected = 0;
  const tickets = new Set<string>();
  for (const s of db.sales) {
    if (localDay(s.timestamp) !== now || (!manager && s.cashierId !== me.userId)) continue;
    byMethod.set(s.paymentMethod, (byMethod.get(s.paymentMethod) ?? 0) + s.totalAmount);
    collected += s.totalAmount;
    tickets.add(s.ticketNo);
  }
  const cash = byMethod.get("CASH") ?? 0;
  return `
    <div class="card-head"><div><h2>${manager ? t("Till today · all cashiers") : t("My drawer today")}</h2>
      <p>${t("{n} payments · {x}", { n: tickets.size, x: money(collected, 0) })}</p></div></div>
    <div class="drawer-grid">
      <div class="drawer-cell big"><span class="label">${t("Cash expected in drawer")}</span><strong class="num">${money(OPENING_FLOAT + cash, 0)}</strong>
        <small>${t("{x} float + {y} cash sales", { x: money(OPENING_FLOAT, 0), y: money(cash, 0) })}</small></div>
      ${SALE_METHODS.map((m) => `<div class="drawer-cell"><span class="label">${esc(payName(m))}</span><strong class="num">${money(byMethod.get(m) ?? 0, 0)}</strong></div>`).join("")}
    </div>`;
}

function paidToday(): string {
  const me = user();
  const manager = canDelete();
  const now = today();
  const tickets = new Map<string, SaleRecord[]>();
  for (const s of db.sales) {
    if (localDay(s.timestamp) !== now || (!manager && s.cashierId !== me.userId)) continue;
    const arr = tickets.get(s.ticketNo) ?? [];
    arr.push(s);
    tickets.set(s.ticketNo, arr);
  }
  const list = [...tickets.entries()].sort((a, b) => (a[1][0].timestamp < b[1][0].timestamp ? 1 : -1));
  return `
    <div class="card-head"><div><h2>${manager ? t("Paid today") : t("Paid to you today")}</h2><p>${t("{n} tickets", { n: list.length })}</p></div></div>
    ${list.length ? `<ul class="entry-list">${list.slice(0, 15).map(([no, rows]) => `
      <li class="entry row-hover">
        <strong>${esc(no)} · ${esc(tableName(rows[0].table))} · ${esc(lineSummary(rows))}</strong>
        <span class="num">${money(rows.reduce((a, r) => a + r.totalAmount, 0))}</span>
        <div class="entry-meta"><span>${esc(payName(rows[0].paymentMethod))}${rows[0].paymentRef ? ` · <span class="mono">${esc(rows[0].paymentRef)}</span>` : ""}
          · ${t("Waiter")}: ${esc(rows[0].servedBy)} · ${t("Cashier")}: ${byline(rows[0].loggedBy, rows[0].timestamp)}</span>
          ${manager ? `<button type="button" class="btn ghost small icon-btn" data-action="void-ticket" data-value="${esc(no)}" aria-label="${t("Void ticket {x}", { x: no })}">${icon("trash")}</button>` : ""}</div>
      </li>`).join("")}</ul>` : `<div class="empty"><strong>${t("No payments yet today")}</strong></div>`}`;
}

export function renderCashier(): string {
  return `
    <div class="page-head"><div><h1>${t("Cashier")}</h1>
      <p>${t("Take payment for orders sent by waiters. Every payment is stamped with your name.")}</p></div></div>
    <div class="pos-layout cashier-layout">
      <section class="card" aria-labelledby="queueTitle" id="queuePanel">${queuePanel()}</section>
      <section class="card ticket" aria-label="${t("Payment")}" id="payPanel">${payPanel()}</section>
    </div>
    <div class="two-col">
      <section class="card" id="drawer">${drawer()}</section>
      <section class="card" id="paidToday">${paidToday()}</section>
    </div>`;
}

/* ---------- live updates without a full re-render ---------- */

function refreshDue(): void {
  const o = selected();
  if (!o) return;
  const due = dueTotal(o);
  const out = $("#dueTotal");
  if (out) out.textContent = money(due, 2);
  const list = o.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const note = $("#discountNote");
  if (note) note.textContent = list - due > 0.004 ? t("Discount {x}", { x: money(list - due, 2) }) : "";
  const cl = $("#changeLine");
  if (cl) cl.innerHTML = changeLine(o);
}

/** Line price edits on the cashier screen (data-line-price is shared with main.ts routing). */
export function onPayLinePrice(index: number, value: string): void {
  const o = selected();
  const v = parseAmount(value);
  if (!o || !o.lines[index] || !(v >= 0)) return;
  state.payPrices[index] = v;
  const row = document.querySelector(`[data-line-price="${index}"]`)?.closest(".ticket-line");
  const cell = row?.querySelector(".tl-total");
  if (cell) cell.textContent = money(o.lines[index].quantity * v);
  refreshDue();
}

export function onPayInput(key: string, value: string): void {
  if (key === "tendered") {
    state.tendered = value;
    if (state.errors.tendered) {
      delete state.errors.tendered;
      $("#tendered")?.removeAttribute("aria-invalid");
      const err = $("#err-tendered");
      if (err) err.textContent = "";
    }
    refreshDue();
  } else if (key === "ref") state.payRef = value;
}

function pay(): void {
  const o = selected();
  if (!o) return;
  if (state.payPrices.some((p) => !(p > 0))) {
    showErrors({ lines: t("Every line needs a price above 0.") }, ["lines"]);
    return;
  }
  const due = dueTotal(o);
  let change = 0;
  if (state.payMethod === "CASH") {
    const got = parseAmount(state.tendered);
    if (!state.tendered.trim() || !(got >= 0)) {
      showErrors({ tendered: t("Enter the cash received from the guest.") }, ["tendered"]);
      return;
    }
    if (got + 0.004 < due) {
      showErrors({ tendered: t("Cash received is less than the total.") }, ["tendered"]);
      return;
    }
    change = got - due;
  }
  const method = state.payMethod;
  const lines = takePayment(o.ticketNo, method, state.payPrices, state.payRef.trim());
  if (!lines) return;
  selectOrder(undefined);
  rerender();
  const msg = method === "CASH"
    ? t("Paid {no} · {x} cash · change {c} · by {name}", { no: o.ticketNo, x: money(due, 2), c: money(change, 2), name: user().name })
    : t("Paid {no} · {x} · {m} · by {name}", { no: o.ticketNo, x: money(due, 2), m: payName(method), name: user().name });
  toast(msg, () => {
    unpay(lines);
    state.cashierSel = o.ticketNo;
    state.payPrices = lines.map((l) => l.finalUnitPrice);
    rerender();
  });
}

export const cashierActions: ActionMap = {
  "pick-order": (el) => {
    const o = db.openOrders.find((x) => x.ticketNo === el.dataset.value);
    if (!o || o.ticketNo === state.cashierSel) return;
    selectOrder(o);
    const qp = $("#queuePanel");
    if (qp) qp.innerHTML = queuePanel();
    const pp = $("#payPanel");
    if (pp) pp.innerHTML = payPanel();
    if (window.matchMedia("(max-width: 900px)").matches) pp?.scrollIntoView({ behavior: "smooth", block: "start" });
    $<HTMLElement>(state.payMethod === "CASH" ? "#tendered" : '[data-action="take-payment"]')?.focus({ preventScroll: true });
  },
  "pay-method": (el) => {
    const v = el.dataset.value ?? "";
    if (!isSaleMethod(v) || v === state.payMethod) return;
    state.payMethod = v;
    state.errors = {};
    const pp = $("#payPanel");
    if (pp) pp.innerHTML = payPanel();
    $<HTMLElement>(`[data-action="pay-method"][data-value="${v}"]`)?.focus();
  },
  "quick-cash": (el) => {
    state.tendered = el.dataset.value ?? "";
    const input = $<HTMLInputElement>("#tendered");
    if (input) input.value = state.tendered;
    onPayInput("tendered", state.tendered);
    $<HTMLElement>('[data-action="take-payment"]')?.focus();
  },
  "take-payment": () => pay(),
  "void-ticket": (el) => {
    const no = el.dataset.value ?? "";
    const removed = removeRecord("SALE", no);
    if (!removed) return;
    rerender();
    toast(t("Ticket {x} voided by {name}", { x: no, name: user().name }), () => { restoreRecord(removed); rerender(); });
  },
};
