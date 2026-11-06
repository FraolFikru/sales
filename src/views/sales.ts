/* Sales: today's completed customer sales with who recorded each one.
   Nothing here touches inventory purchases. */

import type { SaleRecord } from "../types";
import { t, tk } from "../i18n";
import { localDay, money, today } from "../format";
import { canDelete, db, removeRecord, restoreRecord, user } from "../store";
import { esc, icon } from "../ui/dom";
import { byline, metricsBar, payName } from "../ui/shared";
import { toast } from "../ui/toast";
import { rerender, type ActionMap } from "../ui/app";

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
    <div class="page-head"><div><h1>${t("Sales")}</h1><p>${t("Customer sales only. Stock purchases are tracked under Purchases.")}</p></div></div>
    ${metricsBar()}
    <section class="card" id="salesToday">${salesToday()}</section>`;
}

export const salesActions: ActionMap = {
  "void-ticket": (el) => {
    const no = el.dataset.value ?? "";
    const removed = removeRecord("SALE", no);
    if (!removed) return;
    rerender();
    toast(t("Ticket {x} voided by {name}", { x: no, name: user().name }), () => { restoreRecord(removed); rerender(); });
  },
};
