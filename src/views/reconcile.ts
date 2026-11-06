/* Reconcile: payables and receivables, balances per payment source,
   end-of-day cash drawer count, and the month's tax position. */

import type { ExpenseRecord, RegisterClose, SaleRecord } from "../types";
import { t, tk } from "../i18n";
import { addDays, daysBetween, fmtDay, localDay, money, moneyNeg, parseAmount, relDay, round2, today } from "../format";
import { PAYMENT_METHODS, isPaymentMethod } from "../catalog";
import { VAT_RATE, WITHHOLDING } from "../tax";
import { newId } from "../seed";
import {
  addRegisterClose, balances, expectedCash, findRecord, isOverdue, itemLabel, ledger, payables, receivables, state, taxPosition, tenant, totalBalance,
} from "../store";
import { $, esc, icon } from "../ui/dom";
import { payName, seg } from "../ui/shared";
import { toast } from "../ui/toast";
import { rerender, type ActionMap } from "../ui/app";

const BILL_SUBS = new Set(["FAC_UTIL", "FAC_WASTEMGMT", "TECH_NET", "TECH_SAAS"]);
const isBill = (e: ExpenseRecord): boolean => e.category === "LABOR" || e.category === "TAXES_COMPLIANCE" || BILL_SUBS.has(e.subCategory);

function dueLabel(r: { dueDate: string | null }): { cls: string; text: string } {
  if (!r.dueDate) return { cls: "pending", text: t("Pending") };
  const n = daysBetween(today(), r.dueDate);
  if (n < 0) return { cls: "overdue", text: t("Overdue {n} d", { n: -n }) };
  if (n === 0) return { cls: "pending", text: t("Due today") };
  return { cls: "pending", text: t("Due in {n} d", { n }) };
}

function confirmBlock(id: string, amount: number, sale: boolean): string {
  const methods = PAYMENT_METHODS.filter((p) => !sale || p.acceptsSales);
  return `<div class="pay-confirm" id="confirm-${id}" role="group" aria-label="${sale ? t("Confirm money received") : t("Confirm payment")}">
    <span class="label">${sale ? t("Received by") : t("Paid from")}</span>
    ${seg("pay-method", state.payMethod, methods.map((p) => [p.id, tk(`pay.${p.id}`)] as const), t("Payment source"), "small wrap")}
    <span class="spacer"></span>
    <button type="button" class="btn small ghost" data-action="pay-cancel">${t("Cancel")}</button>
    <button type="button" class="btn small primary" data-action="pay-confirm" data-id="${id}">${icon("check")} ${t("Confirm {x}", { x: money(amount) })}</button>
  </div>`;
}

function apRow(e: ExpenseRecord): string {
  const due = dueLabel(e);
  const open = state.payingId === e.id;
  const net = e.totalAmount - e.withholdingAmount;
  return `<li class="pay-row" id="row-${e.id}">
    <div class="due"><span class="tag ${due.cls}">${due.text}</span><small>${e.dueDate ? fmtDay(e.dueDate) : ""}</small></div>
    <div class="who"><strong>${esc(itemLabel(e))}</strong><small>${esc(e.vendor || t("No vendor"))} · ${isBill(e) ? t("Bill") : esc(tk(`sub.${e.subCategory}`))}${
      e.withholdingAmount ? ` · ${t("{x} withheld", { x: money(e.withholdingAmount, 0) })}` : ""}</small></div>
    <span class="num">${money(net, 2)}</span>
    <div class="act">${open ? "" : `<button type="button" class="btn small" data-action="pay-start" data-id="${e.id}" aria-controls="confirm-${e.id}" aria-expanded="false">${t("Mark paid")}</button>`}</div>
    ${open ? confirmBlock(e.id, net, false) : ""}
  </li>`;
}

function arRow(s: SaleRecord): string {
  const due = dueLabel(s);
  const open = state.payingId === s.id;
  return `<li class="pay-row" id="row-${s.id}">
    <div class="due"><span class="tag ${due.cls}">${due.text}</span><small>${s.dueDate ? fmtDay(s.dueDate) : ""}</small></div>
    <div class="who"><strong>${esc(s.customer || tk(`channel.${s.channelId}`))}</strong><small>${esc(tk(`channel.${s.channelId}`))} · ${esc(s.fiscalReceiptNo)}${s.customerTin ? ` · ${t("TIN")} ${esc(s.customerTin)}` : ""}</small></div>
    <span class="num">${money(s.totalAmount, 2)}</span>
    <div class="act">${open ? "" : `<button type="button" class="btn small" data-action="pay-start" data-id="${s.id}" aria-controls="confirm-${s.id}" aria-expanded="false">${t("Mark received")}</button>`}</div>
    ${open ? confirmBlock(s.id, s.totalAmount, true) : ""}
  </li>`;
}

export function renderReconcile(): string {
  const ap = payables();
  const ar = receivables();
  const overdue = ap.filter(isOverdue);
  const vendorsOwed = ap.filter((e) => !isBill(e)).reduce((s, e) => s + e.totalAmount - e.withholdingAmount, 0);
  const billsDue = ap.filter(isBill).reduce((s, e) => s + e.totalAmount, 0);
  const owedToYou = ar.reduce((s, x) => s + x.totalAmount, 0);
  const bal = balances();
  const now = today();
  const start = addDays(now, -29);
  const flows = Object.fromEntries(PAYMENT_METHODS.map((p) => [p.id, { in: 0, out: 0 }])) as Record<string, { in: number; out: number }>;
  for (const s of ledger().sales) if (s.status === "PAID" && s.paymentMethod && s.paidAt && localDay(s.paidAt) >= start) flows[s.paymentMethod].in += s.totalAmount;
  for (const e of ledger().expenses) if (e.status === "PAID" && e.paymentMethod && e.paidAt && localDay(e.paidAt) >= start) flows[e.paymentMethod].out += e.totalAmount - e.withholdingAmount;
  const cash = expectedCash(now);
  const counted = parseAmount(state.countedCash);
  const diff = Number.isFinite(counted) ? round2(counted - cash.expected) : null;
  const tax = taxPosition();
  const closes = ledger().registerCloses.slice(0, 5);
  const closedToday = ledger().registerCloses.some((c) => c.date === now);

  return `
    <div class="page-head"><div><h1>${t("Reconcile")}</h1><p>${t("What you owe, what you're owed, where the money is, and what goes to the tax office.")}</p></div></div>

    <section class="mini-kpis" aria-label="${t("Summary")}">
      <div class="card"><span class="label">${t("Owed to vendors")}</span><strong>${money(vendorsOwed, 0)}</strong><small>${t("{n} open purchases", { n: ap.filter((e) => !isBill(e)).length })}</small></div>
      <div class="card"><span class="label">${t("Bills, payroll & taxes due")}</span><strong>${money(billsDue, 0)}</strong><small>${t("{n} open bills", { n: ap.filter(isBill).length })}</small></div>
      <div class="card ${overdue.length ? "alert" : ""}"><span class="label">${t("Overdue")}</span><strong>${money(overdue.reduce((s, e) => s + e.totalAmount, 0), 0)}</strong><small>${overdue.length ? t("{n} past due · pay these first", { n: overdue.length }) : t("Nothing overdue")}</small></div>
      <div class="card"><span class="label">${t("Customers owe you")}</span><strong>${money(owedToYou, 0)}</strong><small>${t("{n} open invoices", { n: ar.length })}</small></div>
    </section>

    <section class="card" aria-labelledby="apTitle">
      <div class="card-head"><div><h2 id="apTitle">${t("To pay")}</h2><p>${t("Sorted by due date, overdue first")}</p></div></div>
      ${ap.length ? `<ul class="pay-list">${ap.map(apRow).join("")}</ul>` : `<div class="empty"><strong>${t("All paid up")}</strong>${t("Purchases on credit appear here.")}</div>`}
    </section>

    <div class="two-col">
      <section class="card" aria-labelledby="arTitle">
        <div class="card-head"><div><h2 id="arTitle">${t("Customers owe you")}</h2><p>${t("Credit sales and B2B invoices")}</p></div></div>
        ${ar.length ? `<ul class="pay-list">${ar.map(arRow).join("")}</ul>` : `<div class="empty"><strong>${t("Nothing outstanding")}</strong>${t("Sales saved as “On credit” appear here.")}</div>`}
      </section>

      <section class="card" aria-labelledby="balTitle">
        <div class="card-head"><div><h2 id="balTitle">${t("Balances by payment source")}</h2><p>${t("Total balance {x} · money moved in the last 30 days", { x: moneyNeg(totalBalance(), 0) })}</p></div></div>
        <div class="table-scroll"><table class="recon">
          <thead><tr><th>${t("Source")}</th><th class="num">${t("In")}</th><th class="num">${t("Out")}</th><th class="num">${t("Balance")}</th></tr></thead>
          <tbody>${PAYMENT_METHODS.map((p) => `<tr><td>${esc(tk(`pay.${p.id}`))}<small>${esc(tk(`payHint.${p.id}`))}</small></td>
            <td class="num">${money(flows[p.id].in, 0)}</td><td class="num">${money(flows[p.id].out, 0)}</td>
            <td class="num ${bal[p.id] < 0 ? "neg" : ""}"><strong>${moneyNeg(bal[p.id], 0)}</strong></td></tr>`).join("")}</tbody>
        </table></div>
        <p class="meta">${t("Check each line against your cash count, POS report and Telebirr / CBE Birr / M-Pesa statements. A gap means something was not logged.")}</p>
      </section>
    </div>

    <div class="two-col">
      <section class="card" aria-labelledby="regTitle">
        <div class="card-head"><div><h2 id="regTitle">${icon("drawer")} ${t("End-of-day cash drawer")}</h2><p>${fmtDay(now)}${closedToday ? ` · ${t("closed")}` : ""}</p></div></div>
        <dl class="calc">
          <div><dt>${t("Opening float")}</dt><dd class="num">${money(cash.float)}</dd></div>
          <div><dt>${t("+ Cash sales")}</dt><dd class="num">${money(cash.cashIn)}</dd></div>
          <div><dt>${t("− Cash paid out")}</dt><dd class="num">${money(cash.cashOut)}</dd></div>
          <div class="total"><dt>${t("Expected in drawer")}</dt><dd class="num">${moneyNeg(cash.expected)}</dd></div>
        </dl>
        <div class="row">
          <div class="field"><label for="countedCash">${t("Counted cash")}</label>
            <div class="affix"><span>ETB</span><input id="countedCash" class="input num-in" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(state.countedCash)}" data-bind="ui.countedCash"></div></div>
          <div class="field"><span class="label">${t("Over / short")}</span><output id="overShort" class="over-short ${diff === null ? "" : diff === 0 ? "pos" : "neg"}">${
            diff === null ? "—" : diff === 0 ? t("Balanced") : `${diff > 0 ? t("Over") : t("Short")} ${money(Math.abs(diff), 2)}`}</output></div>
        </div>
        <div class="form-actions"><button type="button" class="btn primary" data-action="close-register">${icon("check")} ${t("Close register")}</button></div>
        ${closes.length ? `<ul class="entry-list">${closes.map((c) => `<li class="entry"><strong>${relDay(c.date)}</strong><span class="num ${c.difference === 0 ? "pos" : "neg"}">${
          c.difference === 0 ? t("Balanced") : `${c.difference > 0 ? "+" : "−"}${money(Math.abs(c.difference), 2)}`}</span>
          <div class="entry-meta"><span>${t("Expected {x} · counted {y}", { x: money(c.expected, 2), y: money(c.counted, 2) })}</span></div></li>`).join("")}</ul>` : ""}
      </section>

      <section class="card" aria-labelledby="taxTitle">
        <div class="card-head"><div><h2 id="taxTitle">${icon("shield")} ${t("Tax & compliance")}</h2><p>${t("This month · {name} · TIN {tin}", { name: tenant().name, tin: tenant().tin })}</p></div></div>
        <dl class="calc">
          <div><dt>${t("Output VAT on sales ({r}%)", { r: VAT_RATE * 100 })}</dt><dd class="num">${money(tax.vatOutput, 2)}</dd></div>
          <div><dt>${t("− Input VAT on purchases")}</dt><dd class="num">${money(tax.vatInput, 2)}</dd></div>
          <div class="total"><dt>${t("VAT payable")}</dt><dd class="num">${moneyNeg(tax.vatPayable, 2)}</dd></div>
          <div><dt>${t("Withholding tax to remit")}</dt><dd class="num">${money(tax.withholdingToRemit, 2)}</dd></div>
        </dl>
        ${tax.salesMissingReceipt ? `<p class="info warn">${icon("alert")} ${t("{n} sales in the last 7 days have no fiscal receipt number.", { n: tax.salesMissingReceipt })}
          <button type="button" class="link-btn" data-action="show-missing">${t("Find them")}</button></p>` : `<p class="info ok">${icon("check")} ${t("Every sale this week has a fiscal receipt number.")}</p>`}
        <p class="meta">${tenant().withholdingAgent
          ? t("Withholding: {r}% on goods ≥ {g} and services ≥ {s} per payment; {n}% if the vendor has no TIN.", { r: WITHHOLDING.rate * 100, g: money(WITHHOLDING.goodsThreshold, 0), s: money(WITHHOLDING.servicesThreshold, 0), n: WITHHOLDING.noTinRate * 100 })
          : t("This business is not set up as a withholding agent.")} ${t("Confirm rates with your accountant before filing.")}</p>
      </section>
    </div>`;
}

export const reconcileActions: ActionMap = {
  "pay-start": (el) => { state.payingId = el.dataset.id ?? null; state.payMethod = "CASH"; rerender(`#row-${el.dataset.id} [data-action="pay-confirm"]`); },
  "pay-cancel": () => { const id = state.payingId; state.payingId = null; rerender(`#row-${id} [data-action="pay-start"]`); },
  "pay-method": (el) => {
    const v = el.dataset.value ?? "";
    if (!isPaymentMethod(v)) return;
    state.payMethod = v;
    el.parentElement?.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === el)));
  },
  "pay-confirm": (el) => {
    const r = findRecord(el.dataset.id ?? "");
    if (!r) return;
    const prev = { status: r.status, paymentMethod: r.paymentMethod, paidAt: r.paidAt };
    r.status = "PAID";
    r.paymentMethod = state.payMethod;
    r.paidAt = new Date().toISOString();
    state.payingId = null;
    rerender();
    const who = "itemId" in r ? r.vendor || itemLabel(r) : r.customer;
    const amount = "itemId" in r ? r.totalAmount - r.withholdingAmount : r.totalAmount;
    toast(t("{verb} {x} · {who} · {m}", { verb: "itemId" in r ? t("Paid") : t("Received"), x: money(amount, 2), who, m: payName(state.payMethod) }), () => {
      Object.assign(r, prev);
      rerender();
    });
  },
  "close-register": () => {
    const now = today();
    const cash = expectedCash(now);
    const counted = parseAmount(state.countedCash);
    if (!Number.isFinite(counted)) {
      toast(t("Enter the counted cash first."));
      $<HTMLElement>("#countedCash")?.focus();
      return;
    }
    const c: RegisterClose = { id: newId("close"), tenantId: tenant().id, date: now, expected: cash.expected, counted, difference: round2(counted - cash.expected), closedAt: new Date().toISOString() };
    addRegisterClose(c);
    state.countedCash = "";
    rerender();
    toast(c.difference === 0 ? t("Register closed · balanced") : t("Register closed · {x} {d}", { x: c.difference > 0 ? t("over") : t("short"), d: money(Math.abs(c.difference), 2) }), () => {
      ledger().registerCloses = ledger().registerCloses.filter((x) => x !== c);
      rerender();
    });
  },
};

/** live over/short while typing the counted amount */
export function onCountedInput(value: string): void {
  state.countedCash = value;
  const out = $("#overShort");
  if (!out) return;
  const counted = parseAmount(value);
  if (!Number.isFinite(counted)) { out.textContent = "—"; out.className = "over-short"; return; }
  const diff = round2(counted - expectedCash(today()).expected);
  out.textContent = diff === 0 ? t("Balanced") : `${diff > 0 ? t("Over") : t("Short")} ${money(Math.abs(diff), 2)}`;
  out.className = `over-short ${diff === 0 ? "pos" : "neg"}`;
}
