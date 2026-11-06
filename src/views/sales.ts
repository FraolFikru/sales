/* Sales (pure): build a ticket from menu items, adjust quantity or the
   final selling price, choose how the customer paid, complete the sale.
   Nothing here touches inventory purchases. */

import type { FieldErrors, SaleRecord } from "../types";
import { t, tk } from "../i18n";
import { localDay, money, normalize, parseAmount, today } from "../format";
import { MENU, SALE_METHODS, SECTION_IDS, isSaleMethod } from "../catalog";
import { canDelete, db, recordSale, removeRecord, restoreRecord, state, stampUser, takeTicketNo, user } from "../store";
import { $, esc, icon } from "../ui/dom";
import { byline, errText, metricsBar, payName, seg, showErrors } from "../ui/shared";
import { toast } from "../ui/toast";
import { rerender, type ActionMap } from "../ui/app";

const menuItem = (id: string) => MENU.find((m) => m.id === id);

function menuGrid(): string {
  const q = normalize(state.menuQuery);
  const items = MENU.filter((m) => (state.menuSection === "ALL" || m.section === state.menuSection) &&
    (!q || normalize(tk(m.nameKey)).includes(q) || normalize(m.id).includes(q)));
  return items.length
    ? items.map((m) => {
        const inTicket = state.ticket.find((l) => l.menuItemId === m.id);
        return `<button type="button" class="menu-tile" data-action="add-item" data-value="${m.id}" aria-label="${t("Add {x}", { x: tk(m.nameKey) })}">
          <strong>${esc(tk(m.nameKey))}</strong>
          <span class="num">${money(m.price)}</span>
          ${inTicket ? `<span class="tile-qty" aria-label="${t("{n} on ticket", { n: inTicket.quantity })}">${inTicket.quantity}</span>` : ""}
        </button>`;
      }).join("")
    : `<p class="empty"><strong>${t("No menu items match")}</strong></p>`;
}

function ticketPanel(): string {
  const lines = state.ticket;
  const total = lines.reduce((s, l) => s + l.quantity * l.finalUnitPrice, 0);
  const e: FieldErrors = state.errors;
  return `
    <div class="card-head"><div><h2 id="ticketTitle">${t("Current ticket")}</h2><p>${t("Cashier: {name}", { name: esc(user().name) })}</p></div>
      ${lines.length ? `<button type="button" class="btn small ghost" data-action="clear-ticket">${icon("x")} ${t("Clear")}</button>` : ""}</div>
    ${lines.length ? `<ul class="ticket-lines">${lines.map((l, i) => {
      const m = menuItem(l.menuItemId);
      const discounted = m && l.finalUnitPrice !== m.price;
      return `<li class="ticket-line">
        <div class="tl-name"><strong>${esc(m ? tk(m.nameKey) : l.menuItemId)}</strong>
          <small>${discounted ? `<s>${money(m?.price ?? 0)}</s> ` : ""}${t("{x} each", { x: money(l.finalUnitPrice) })}</small></div>
        <div class="stepper" role="group" aria-label="${t("Quantity")}">
          <button type="button" class="btn icon-btn small" data-action="qty-dec" data-value="${i}" aria-label="${t("Remove one")}">${icon("minus")}</button>
          <output aria-live="polite">${l.quantity}</output>
          <button type="button" class="btn icon-btn small" data-action="qty-inc" data-value="${i}" aria-label="${t("Add one")}">${icon("plus")}</button>
        </div>
        <label class="price-edit"><span class="sr">${t("Final price per item")}</span>
          <span class="affix"><span>ETB</span><input class="input num-in" inputmode="decimal" value="${l.finalUnitPrice}" data-line-price="${i}" aria-label="${t("Final price per item")}"></span></label>
        <span class="num tl-total">${money(l.quantity * l.finalUnitPrice)}</span>
      </li>`;
    }).join("")}</ul>` : `<div class="empty"><strong>${t("Ticket is empty")}</strong>${t("Tap menu items to add them.")}</div>`}
    ${errText(e, "ticket")}
    <div class="field"><span class="label" id="payLbl">${t("Payment method")}</span>
      <div class="pay-grid five" role="group" aria-labelledby="payLbl">${SALE_METHODS.map((m) =>
        `<button type="button" class="pay-opt" data-action="ticket-method" data-value="${m}" aria-pressed="${state.ticketMethod === m}"><strong>${esc(payName(m))}</strong></button>`).join("")}</div></div>
    <div class="total-bar">
      <div><span class="label">${t("Total to collect")}</span><output id="ticketTotal" aria-live="polite">${money(total, 2)}</output></div>
      <button type="button" class="btn primary big" data-action="complete-sale" ${lines.length ? "" : "disabled"}>${icon("check")} ${t("Complete sale")}</button>
    </div>`;
}

/** Phone-only bar pinned above the tabs so the running total stays visible while tapping the menu. */
function ticketPeek(): string {
  const n = state.ticket.reduce((s, l) => s + l.quantity, 0);
  if (!n) return "";
  const total = state.ticket.reduce((s, l) => s + l.quantity * l.finalUnitPrice, 0);
  return `<div class="ticket-peek" role="status"><span>${t("{n} items", { n })} · <strong>${money(total, 2)}</strong></span>
    <button type="button" class="btn small primary" data-action="scroll-ticket">${t("Review ticket")} ${icon("arrow")}</button></div>`;
}

function salesToday(): string {
  const now = today();
  const tickets = new Map<string, SaleRecord[]>();
  for (const s of db.sales) {
    if (localDay(s.timestamp) !== now) continue;
    const arr = tickets.get(s.ticketNo) ?? [];
    arr.push(s);
    tickets.set(s.ticketNo, arr);
  }
  const list = [...tickets.entries()].sort((a, b) => (a[1][0].timestamp < b[1][0].timestamp ? 1 : -1));
  const total = list.reduce((s, [, rows]) => s + rows.reduce((a, r) => a + r.totalAmount, 0), 0);
  const mine = list.filter(([, rows]) => rows[0].loggedBy === user().name).length;
  return `
    <div class="card-head"><div><h2>${t("Today's tickets")}</h2><p>${t("{n} tickets · {x}", { n: list.length, x: money(total, 0) })} · ${t("{n} by you", { n: mine })}</p></div></div>
    ${list.length ? `<ul class="entry-list">${list.slice(0, 15).map(([no, rows]) => `
      <li class="entry row-hover">
        <strong>${esc(no)} · ${esc(rows.map((r) => `${r.quantity}× ${tk(r.itemName)}`).join(", "))}</strong>
        <span class="num">${money(rows.reduce((a, r) => a + r.totalAmount, 0))}</span>
        <div class="entry-meta"><span>${esc(payName(rows[0].paymentMethod))} · ${byline(rows[0].loggedBy, rows[0].timestamp)}</span>
          ${canDelete() ? `<button type="button" class="btn ghost small icon-btn" data-action="void-ticket" data-value="${esc(no)}" aria-label="${t("Void ticket {x}", { x: no })}">${icon("trash")}</button>` : ""}</div>
      </li>`).join("")}</ul>` : `<div class="empty"><strong>${t("No sales yet today")}</strong></div>`}`;
}

export function renderSales(): string {
  return `
    <div class="page-head"><div><h1>${t("Sales")}</h1><p>${t("Record completed customer sales only. Stock purchases go under Purchases.")}</p></div></div>
    ${metricsBar()}
    <div class="pos-layout">
      <section class="card menu-card" aria-labelledby="menuTitle">
        <div class="card-head"><h2 id="menuTitle">${t("Menu")}</h2>
          <label class="search">${icon("search")}<span class="sr">${t("Search the menu")}</span>
            <input id="menuSearch" type="search" autocomplete="off" placeholder="${t("Search the menu")}" value="${esc(state.menuQuery)}" data-bind="menu.query"></label></div>
        ${seg("menu-section", state.menuSection, [["ALL", t("All")], ...SECTION_IDS.map((s) => [s, tk(`section.${s}`)] as const)], t("Menu section"), "small wrap")}
        <div class="menu-grid" id="menuGrid">${menuGrid()}</div>
      </section>
      <section class="card ticket" aria-labelledby="ticketTitle" id="ticketPanel">${ticketPanel()}</section>
    </div>
    <section class="card" id="salesToday">${salesToday()}</section>
    <div id="ticketPeek">${ticketPeek()}</div>`;
}

const refreshTicket = (focus?: string): void => {
  const p = $("#ticketPanel");
  if (p) p.innerHTML = ticketPanel();
  const g = $("#menuGrid");
  if (g) g.innerHTML = menuGrid();
  const peek = $("#ticketPeek");
  if (peek) peek.innerHTML = ticketPeek();
  if (focus) $<HTMLElement>(focus)?.focus();
};

export function onMenuSearch(value: string): void {
  state.menuQuery = value;
  const g = $("#menuGrid");
  if (g) g.innerHTML = menuGrid();
}

export function onLinePrice(index: number, value: string): void {
  const line = state.ticket[index];
  const v = parseAmount(value);
  if (!line || !(v >= 0)) return;
  line.finalUnitPrice = v;
  const total = state.ticket.reduce((s, l) => s + l.quantity * l.finalUnitPrice, 0);
  const out = $("#ticketTotal");
  if (out) out.textContent = money(total, 2);
  const row = document.querySelector(`[data-line-price="${index}"]`)?.closest(".ticket-line");
  const cell = row?.querySelector(".tl-total");
  if (cell) cell.textContent = money(line.quantity * line.finalUnitPrice);
}

function completeSale(): void {
  if (!state.ticket.length) return;
  if (state.ticket.some((l) => !(l.finalUnitPrice > 0))) {
    showErrors({ ticket: t("Every line needs a price above 0.") }, ["ticket"]);
    return;
  }
  const no = takeTicketNo();
  const ts = new Date().toISOString();
  const { loggedBy } = stampUser();
  const lines: SaleRecord[] = state.ticket.map((l, i) => {
    const m = menuItem(l.menuItemId);
    return {
      id: `${no}-${i + 1}`, ticketNo: no, menuItemId: l.menuItemId, itemName: m?.nameKey ?? l.menuItemId, quantity: l.quantity,
      listPrice: m?.price ?? l.finalUnitPrice, finalUnitPrice: l.finalUnitPrice, totalAmount: l.quantity * l.finalUnitPrice,
      paymentMethod: state.ticketMethod, loggedBy, timestamp: ts,
    };
  });
  recordSale(lines);
  state.ticket = [];
  state.errors = {};
  rerender("#menuSearch");
  const total = lines.reduce((s, l) => s + l.totalAmount, 0);
  toast(t("Sale {no} saved · {x} · {m} · by {name}", { no, x: money(total, 2), m: payName(lines[0].paymentMethod), name: loggedBy }), () => {
    removeRecord("SALE", no);
    rerender();
  });
}

export const salesActions: ActionMap = {
  "menu-section": (el) => { state.menuSection = el.dataset.value ?? "ALL"; rerender(`[data-action="menu-section"][data-value="${state.menuSection}"]`); },
  "add-item": (el) => {
    const m = menuItem(el.dataset.value ?? "");
    if (!m) return;
    const line = state.ticket.find((l) => l.menuItemId === m.id);
    if (line) line.quantity++;
    else state.ticket.push({ menuItemId: m.id, quantity: 1, finalUnitPrice: m.price });
    state.errors = {};
    refreshTicket(`[data-action="add-item"][data-value="${m.id}"]`);
  },
  "qty-inc": (el) => { const l = state.ticket[Number(el.dataset.value)]; if (l) { l.quantity++; refreshTicket(`[data-action="qty-inc"][data-value="${el.dataset.value}"]`); } },
  "qty-dec": (el) => {
    const i = Number(el.dataset.value);
    const l = state.ticket[i];
    if (!l) return;
    l.quantity--;
    if (l.quantity <= 0) state.ticket.splice(i, 1);
    refreshTicket(state.ticket[i] ? `[data-action="qty-dec"][data-value="${i}"]` : "#menuSearch");
  },
  "clear-ticket": () => { state.ticket = []; refreshTicket("#menuSearch"); },
  "ticket-method": (el) => {
    const v = el.dataset.value ?? "";
    if (!isSaleMethod(v)) return;
    state.ticketMethod = v;
    el.parentElement?.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === el)));
  },
  "complete-sale": () => completeSale(),
  "scroll-ticket": () => {
    $("#ticketPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    $<HTMLElement>('[data-action="complete-sale"]')?.focus({ preventScroll: true });
  },
  "void-ticket": (el) => {
    const no = el.dataset.value ?? "";
    const removed = removeRecord("SALE", no);
    if (!removed) return;
    rerender();
    toast(t("Ticket {x} voided by {name}", { x: no, name: user().name }), () => { restoreRecord(removed); rerender(); });
  },
};
