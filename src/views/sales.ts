/* Sales — the waiter's screen. Pick a table, add dishes, send the order
   to the cashier. Waiters never take payment and cannot change prices;
   the order only becomes a sale when the cashier is paid. */

import type { OpenOrder, SaleRecord } from "../types";
import { t, tk } from "../i18n";
import { localDay, money, normalize, today } from "../format";
import { MENU, SECTION_IDS, TABLES } from "../catalog";
import { canDelete, cancelOrder, db, orderTotal, reopenOrder, sendOrder, state, user } from "../store";
import { $, esc, icon } from "../ui/dom";
import { byline, errText, payName, seg, showErrors } from "../ui/shared";
import { toast } from "../ui/toast";
import { rerender, type ActionMap } from "../ui/app";

const menuItem = (id: string) => MENU.find((m) => m.id === id);

export const tableName = (table: string): string => (table === "TA" ? t("Takeaway") : t("Table {n}", { n: table }));

export const waitedMin = (iso: string): number => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));

export const lineSummary = (lines: readonly { menuItemId: string; quantity: number }[]): string =>
  lines.map((l) => `${l.quantity}× ${tk(menuItem(l.menuItemId)?.nameKey ?? l.menuItemId)}`).join(", ");

const draftTotal = (): number => state.order.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

function menuGrid(): string {
  const q = normalize(state.menuQuery);
  const items = MENU.filter((m) => (state.menuSection === "ALL" || m.section === state.menuSection) &&
    (!q || normalize(tk(m.nameKey)).includes(q) || normalize(m.id).includes(q)));
  return items.length
    ? items.map((m) => {
        const inOrder = state.order.find((l) => l.menuItemId === m.id);
        return `<button type="button" class="menu-tile" data-action="add-item" data-value="${m.id}" aria-label="${t("Add {x}", { x: tk(m.nameKey) })}">
          <strong>${esc(tk(m.nameKey))}</strong>
          <span class="num">${money(m.price)}</span>
          ${inOrder ? `<span class="tile-qty" aria-label="${t("{n} on order", { n: inOrder.quantity })}">${inOrder.quantity}</span>` : ""}
        </button>`;
      }).join("")
    : `<p class="empty"><strong>${t("No menu items match")}</strong></p>`;
}

function orderPanel(): string {
  const lines = state.order;
  return `
    <div class="card-head"><div><h2 id="orderTitle">${t("New order")}</h2><p>${t("Waiter: {name}", { name: esc(user().name) })}</p></div>
      ${lines.length ? `<button type="button" class="btn small ghost" data-action="clear-order">${icon("x")} ${t("Clear")}</button>` : ""}</div>
    <div class="field"><span class="label" id="tableLbl">${t("Table")}</span>
      <div class="table-grid" role="group" aria-labelledby="tableLbl">${TABLES.map((tb) =>
        `<button type="button" class="table-opt${tb === "TA" ? " ta" : ""}" data-action="order-table" data-value="${tb}" aria-pressed="${state.orderTable === tb}"
          aria-label="${esc(tableName(tb))}">${tb === "TA" ? t("Takeaway") : tb}</button>`).join("")}</div>
      ${errText(state.errors, "table")}</div>
    ${lines.length ? `<ul class="ticket-lines">${lines.map((l, i) => {
      const m = menuItem(l.menuItemId);
      return `<li class="ticket-line no-price">
        <div class="tl-name"><strong>${esc(m ? tk(m.nameKey) : l.menuItemId)}</strong><small>${t("{x} each", { x: money(l.unitPrice) })}</small></div>
        <div class="stepper" role="group" aria-label="${t("Quantity")}">
          <button type="button" class="btn icon-btn small" data-action="qty-dec" data-value="${i}" aria-label="${t("Remove one")}">${icon("minus")}</button>
          <output aria-live="polite">${l.quantity}</output>
          <button type="button" class="btn icon-btn small" data-action="qty-inc" data-value="${i}" aria-label="${t("Add one")}">${icon("plus")}</button>
        </div>
        <span class="num tl-total">${money(l.quantity * l.unitPrice)}</span>
      </li>`;
    }).join("")}</ul>` : `<div class="empty"><strong>${t("Order is empty")}</strong>${t("Tap menu items to add them.")}</div>`}
    ${errText(state.errors, "order")}
    <div class="field"><label for="orderNote">${t("Note for kitchen / cashier")} <span class="meta">${t("(optional)")}</span></label>
      <input id="orderNote" class="input" autocomplete="off" maxlength="120" value="${esc(state.orderNote)}" data-bind="order.note" placeholder="${t("e.g. no chilli, pack separately")}"></div>
    <div class="total-bar">
      <div><span class="label">${t("Order total")}</span><output id="orderTotal" aria-live="polite">${money(draftTotal(), 2)}</output>
        <span class="paid-at">${t("Paid at the cashier")}</span></div>
      <button type="button" class="btn primary big" data-action="send-order" ${lines.length ? "" : "disabled"}>${t("Send to cashier")} ${icon("arrow")}</button>
    </div>`;
}

/** Phone-only bar pinned above the tabs so the order stays visible while tapping the menu. */
function orderPeek(): string {
  const n = state.order.reduce((s, l) => s + l.quantity, 0);
  if (!n) return "";
  return `<div class="ticket-peek" role="status"><span>${t("{n} items", { n })} · <strong>${money(draftTotal(), 2)}</strong></span>
    <button type="button" class="btn small primary" data-action="scroll-order">${t("Review order")} ${icon("arrow")}</button></div>`;
}

/** The waiter's own orders today: still at the cashier, or paid (and to whom). */
function myOrders(): string {
  const me = user();
  const manager = canDelete();
  const open = db.openOrders.filter((o) => manager || o.servedById === me.userId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const now = today();
  const paid = new Map<string, SaleRecord[]>();
  for (const s of db.sales) {
    if (localDay(s.timestamp) !== now || (!manager && s.servedById !== me.userId)) continue;
    const arr = paid.get(s.ticketNo) ?? [];
    arr.push(s);
    paid.set(s.ticketNo, arr);
  }
  const paidList = [...paid.entries()].sort((a, b) => (a[1][0].timestamp < b[1][0].timestamp ? 1 : -1));
  const paidTotal = paidList.reduce((s, [, rows]) => s + rows.reduce((a, r) => a + r.totalAmount, 0), 0);
  const openRow = (o: OpenOrder): string => `
      <li class="entry row-hover">
        <strong>${esc(o.ticketNo)} · ${esc(tableName(o.table))} · ${esc(lineSummary(o.lines))}</strong>
        <span class="num">${money(orderTotal(o))}</span>
        <div class="entry-meta"><span><span class="status-pill wait">${t("At cashier · {n} min", { n: waitedMin(o.createdAt) })}</span>
          ${manager ? ` ${byline(o.servedBy, o.createdAt)}` : ""}</span>
          <button type="button" class="btn ghost small" data-action="cancel-order" data-value="${esc(o.ticketNo)}" aria-label="${t("Cancel order {x}", { x: o.ticketNo })}">${icon("x")} ${t("Cancel")}</button></div>
      </li>`;
  return `
    <div class="card-head"><div><h2>${manager ? t("Orders today") : t("My orders today")}</h2>
      <p>${t("{n} at the cashier", { n: open.length })} · ${t("{n} paid · {x}", { n: paidList.length, x: money(paidTotal, 0) })}</p></div></div>
    ${open.length || paidList.length ? `<ul class="entry-list">
      ${open.map(openRow).join("")}
      ${paidList.slice(0, 12).map(([no, rows]) => `
      <li class="entry row-hover">
        <strong>${esc(no)} · ${esc(tableName(rows[0].table))} · ${esc(rows.map((r) => `${r.quantity}× ${tk(r.itemName)}`).join(", "))}</strong>
        <span class="num">${money(rows.reduce((a, r) => a + r.totalAmount, 0))}</span>
        <div class="entry-meta"><span><span class="status-pill paid">${icon("check")} ${t("Paid · {m}", { m: payName(rows[0].paymentMethod) })}</span>
          ${t("Cashier")}: ${byline(rows[0].loggedBy, rows[0].timestamp)}${manager ? ` · ${t("Waiter")}: ${esc(rows[0].servedBy)}` : ""}</span></div>
      </li>`).join("")}
    </ul>` : `<div class="empty"><strong>${t("No orders yet today")}</strong></div>`}`;
}

export function renderSales(): string {
  return `
    <div class="page-head"><div><h1>${t("Sales · take orders")}</h1>
      <p>${t("Take the order and send it to the cashier. Payment is taken at the cashier, not here.")}</p></div></div>
    <div class="pos-layout">
      <section class="card menu-card" aria-labelledby="menuTitle">
        <div class="card-head"><h2 id="menuTitle">${t("Menu")}</h2>
          <label class="search">${icon("search")}<span class="sr">${t("Search the menu")}</span>
            <input id="menuSearch" type="search" autocomplete="off" placeholder="${t("Search the menu")}" value="${esc(state.menuQuery)}" data-bind="menu.query"></label></div>
        ${seg("menu-section", state.menuSection, [["ALL", t("All")], ...SECTION_IDS.map((s) => [s, tk(`section.${s}`)] as const)], t("Menu section"), "small wrap")}
        <div class="menu-grid" id="menuGrid">${menuGrid()}</div>
      </section>
      <section class="card ticket" aria-labelledby="orderTitle" id="orderPanel">${orderPanel()}</section>
    </div>
    <section class="card" id="myOrders">${myOrders()}</section>
    <div id="ticketPeek">${orderPeek()}</div>`;
}

const refreshOrder = (focus?: string): void => {
  const p = $("#orderPanel");
  if (p) p.innerHTML = orderPanel();
  const g = $("#menuGrid");
  if (g) g.innerHTML = menuGrid();
  const peek = $("#ticketPeek");
  if (peek) peek.innerHTML = orderPeek();
  if (focus) $<HTMLElement>(focus)?.focus();
};

export function onMenuSearch(value: string): void {
  state.menuQuery = value;
  const g = $("#menuGrid");
  if (g) g.innerHTML = menuGrid();
}

export function onOrderInput(key: string, value: string): void {
  if (key === "note") state.orderNote = value;
}

function send(): void {
  if (!state.order.length) return;
  if (!state.orderTable) {
    showErrors({ table: t("Choose a table or Takeaway.") }, ["table"]);
    $<HTMLElement>('[data-action="order-table"]')?.focus();
    return;
  }
  const o = sendOrder(state.orderTable, state.order, state.orderNote.trim());
  state.order = [];
  state.orderTable = "";
  state.orderNote = "";
  state.errors = {};
  rerender("#menuSearch");
  toast(t("Order {no} sent to the cashier · {t} · {x}", { no: o.ticketNo, t: tableName(o.table), x: money(orderTotal(o), 2) }), () => {
    const back = cancelOrder(o.ticketNo);
    if (back) {
      state.order = back.lines.map((l) => ({ ...l }));
      state.orderTable = back.table;
      state.orderNote = back.note;
    }
    rerender();
  });
}

export const salesActions: ActionMap = {
  "menu-section": (el) => { state.menuSection = el.dataset.value ?? "ALL"; rerender(`[data-action="menu-section"][data-value="${state.menuSection}"]`); },
  "add-item": (el) => {
    const m = menuItem(el.dataset.value ?? "");
    if (!m) return;
    const line = state.order.find((l) => l.menuItemId === m.id);
    if (line) line.quantity++;
    else state.order.push({ menuItemId: m.id, quantity: 1, unitPrice: m.price });
    delete state.errors.order;
    refreshOrder(`[data-action="add-item"][data-value="${m.id}"]`);
  },
  "qty-inc": (el) => { const l = state.order[Number(el.dataset.value)]; if (l) { l.quantity++; refreshOrder(`[data-action="qty-inc"][data-value="${el.dataset.value}"]`); } },
  "qty-dec": (el) => {
    const i = Number(el.dataset.value);
    const l = state.order[i];
    if (!l) return;
    l.quantity--;
    if (l.quantity <= 0) state.order.splice(i, 1);
    refreshOrder(state.order[i] ? `[data-action="qty-dec"][data-value="${i}"]` : "#menuSearch");
  },
  "clear-order": () => { state.order = []; state.orderNote = ""; refreshOrder("#menuSearch"); },
  "order-table": (el) => {
    state.orderTable = el.dataset.value ?? "";
    delete state.errors.table;
    refreshOrder(`[data-action="order-table"][data-value="${state.orderTable}"]`);
  },
  "send-order": () => send(),
  "scroll-order": () => {
    $("#orderPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    $<HTMLElement>('[data-action="send-order"]')?.focus({ preventScroll: true });
  },
  "cancel-order": (el) => {
    const no = el.dataset.value ?? "";
    const o = cancelOrder(no);
    if (!o) return;
    rerender();
    toast(t("Order {x} cancelled by {name}", { x: no, name: user().name }), () => { reopenOrder(o); rerender(); });
  },
};
