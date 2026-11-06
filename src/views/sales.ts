/* Sales entry: channel, VAT-inclusive amount with live VAT split,
   payment source or credit invoice, fiscal receipt number. */

import type { FieldErrors, PaymentMethod, SaleRecord } from "../types";
import { t, tk } from "../i18n";
import { addDays, fmtTime, localDay, money, parseAmount, round2, stamp, today } from "../format";
import { PAYMENT_METHODS, SALES_CHANNELS, isPaymentMethod } from "../catalog";
import { VAT_RATE, vatFromGross } from "../tax";
import { newId } from "../seed";
import { addSale, drafts, ledger, metrics, newSaleDraft, removeRecord, restoreRecord, state, takeFiscalNo, tenant } from "../store";
import { $, $$, esc, icon } from "../ui/dom";
import { changePct, chip, clearErrors, errText, invalid, metricsBar, payName, periodSeg, seg, setPressed, showErrors, statusTag } from "../ui/shared";
import { toast } from "../ui/toast";
import { rerender, type ActionMap } from "../ui/app";

const d = (): typeof drafts.sale => drafts.sale;

const nextFiscal = (): string => `FS-${String(ledger().nextFiscalNo).padStart(8, "0")}`;

export function renderSales(): string {
  const x = d();
  const e = state.errors;
  if (!x.fiscalReceiptNo) x.fiscalReceiptNo = nextFiscal();
  const channels = SALES_CHANNELS.filter((c) => tenant().salesChannels.includes(c.id));
  if (!channels.some((c) => c.id === x.channelId)) x.channelId = channels[0]?.id ?? "";
  const vatReg = tenant().vatRegistered;

  return `
    <div class="page-head"><div><h1>${t("Sales")}</h1><p>${t("Record money coming in, how it was paid, and its fiscal receipt.")}</p></div>${periodSeg()}</div>
    ${metricsBar()}
    <div class="split">
      <form class="card form" id="saleForm" novalidate aria-labelledby="sfTitle">
        <h2 id="sfTitle" class="sr">${t("New sale")}</h2>
        <fieldset class="form-sec">
          <legend class="sec-title">${t("What was sold?")}</legend>
          <div class="quick-chips" role="group" aria-label="${t("Sales channel")}">${channels.map((c) =>
            `<button type="button" data-action="s-channel" data-value="${c.id}" aria-pressed="${x.channelId === c.id}">${esc(tk(`channel.${c.id}`))}</button>`).join("")}</div>
          <div class="row">
            <div class="field big-amt"><label for="sAmount">${vatReg ? t("Amount incl. VAT") : t("Amount")}</label>
              <div class="affix"><span>ETB</span><input id="sAmount" class="input num-in" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(x.amount)}" data-bind="sale.amount" ${invalid(e, "amount")}></div>
              ${errText(e, "amount")}<p class="hint" id="vatSplit"></p></div>
            <div class="field"><label for="sDate">${t("Date")}</label><input id="sDate" class="input" type="date" max="${today()}" value="${esc(x.date)}" data-bind="sale.date"></div>
          </div>
          <div class="field"><label for="sFiscal">${t("Fiscal receipt no.")}</label>
            <input id="sFiscal" class="input mono" type="text" autocomplete="off" value="${esc(x.fiscalReceiptNo)}" data-bind="sale.fiscalReceiptNo">
            <p class="hint">${t("Copy it from the fiscal printer receipt. The next number is filled in for you.")}</p></div>
        </fieldset>

        <fieldset class="form-sec" id="salePay">${salePay()}</fieldset>

        <div class="total-bar">
          <div><span class="label">${t("Sale total")}</span><output id="sSum" aria-live="polite">${money(parseAmount(x.amount) || 0, 2)}</output></div>
          <div class="form-actions"><button type="submit" class="btn primary">${icon("check")} ${t("Save sale")}</button></div>
        </div>
      </form>
      <aside class="side" aria-label="${t("Today's sales")}">${saleSide()}</aside>
    </div>`;
}

function salePay(): string {
  const x = d();
  const e: FieldErrors = state.errors;
  const head = `<legend class="sec-title">${t("Payment")}</legend>
    <div class="field">${seg("s-settle", x.settle, [["PAID", t("Paid")], ["CREDIT", t("On credit (invoice)")]], t("Settlement"), "lg")}</div>`;
  if (x.settle === "PAID") {
    return `${head}
      <div class="field"><span class="label" id="smLbl">${t("Received by")}</span>
        <div class="pay-grid" role="group" aria-labelledby="smLbl">${PAYMENT_METHODS.filter((p) => p.acceptsSales).map((p) => `
          <button type="button" class="pay-opt" data-action="s-method" data-value="${p.id}" aria-pressed="${x.paymentMethod === p.id}">
            <strong>${esc(tk(`pay.${p.id}`))}</strong><small>${esc(tk(`payHint.${p.id}`))}</small></button>`).join("")}</div></div>
      ${x.paymentMethod !== "CASH" ? `<div class="field"><label for="sRef">${t("Transaction reference")} <span class="opt-label">${t("(optional)")}</span></label>
        <input id="sRef" class="input" type="text" autocomplete="off" placeholder="${t("e.g. Telebirr transaction ID")}" value="${esc(x.reference)}" data-bind="sale.reference"></div>` : ""}`;
  }
  return `${head}
    <div class="row">
      <div class="field"><label for="sCustomer">${t("Customer")}</label>
        <input id="sCustomer" class="input" type="text" placeholder="${t("e.g. Zemen Office Lunch")}" value="${esc(x.customer)}" data-bind="sale.customer" ${invalid(e, "customer")}>${errText(e, "customer")}</div>
      <div class="field"><label for="sTin">${t("Customer TIN")} <span class="opt-label">${t("(optional)")}</span></label>
        <input id="sTin" class="input mono" inputmode="numeric" maxlength="10" placeholder="0000000000" value="${esc(x.customerTin)}" data-bind="sale.customerTin" ${invalid(e, "tin")}>${errText(e, "tin")}</div>
    </div>
    <div class="field"><label for="sDue">${t("Payment due")}</label>
      <input id="sDue" class="input" type="date" min="${today()}" value="${esc(x.dueDate)}" data-bind="sale.dueDate"></div>`;
}

function saleSide(): string {
  const now = today();
  const todays = ledger().sales.filter((s) => localDay(s.timestamp) === now).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const total = todays.reduce((s, x) => s + x.totalAmount, 0);
  const lastWeek = metrics(addDays(now, -7), addDays(now, -7)).grossSales;
  const by = new Map<string, number>();
  for (const s of todays) {
    const k = s.paymentMethod ?? "CREDIT";
    by.set(k, (by.get(k) ?? 0) + s.totalAmount);
  }
  const rows = [...PAYMENT_METHODS.filter((p) => p.acceptsSales).map((p) => [tk(`pay.${p.id}`), by.get(p.id) ?? 0] as const),
    ...(by.get("CREDIT") ? [[t("On credit"), by.get("CREDIT") ?? 0] as const] : [])];
  return `
    <section class="card">
      <div class="card-head"><div><h2>${t("Sales today")}</h2><p>${t("Same day last week {x}", { x: money(lastWeek, 0) })} ${chip(changePct(total, lastWeek), true)}</p></div></div>
      <div class="sum-total"><span class="meta">${t("Total incl. VAT")}</span><strong>${money(total, 2)}</strong></div>
      <div class="bar-list">${rows.map(([l, v]) => `
        <div class="bar-row static"><span>${esc(l)}</span><span class="num">${money(v, 0)}</span><span class="bar-track"><i class="sale" style="width:${total ? (v / total) * 100 : 0}%"></i></span></div>`).join("")}</div>
    </section>
    <section class="card">
      <div class="card-head"><h2>${t("Today's sales")}</h2></div>
      ${todays.length ? `<ul class="entry-list">${todays.slice(0, 14).map((s) => `
        <li class="entry"><strong>${esc(tk(`channel.${s.channelId}`))}</strong><span class="num">${money(s.totalAmount)}</span>
          <div class="entry-meta"><span>${s.paymentMethod ? esc(payName(s.paymentMethod)) : esc(s.customer)} · ${fmtTime(s.timestamp)} · ${s.fiscalReceiptNo ? esc(s.fiscalReceiptNo) : `<span class="warn-text">${t("No receipt no.")}</span>`}</span>
            <span class="entry-act">${statusTag(s)}<button type="button" class="btn ghost small icon-btn" data-action="remove-sale" data-id="${s.id}" aria-label="${t("Remove {x}", { x: tk(`channel.${s.channelId}`) })}">${icon("trash")}</button></span></div></li>`).join("")}</ul>`
        : `<div class="empty"><strong>${t("No sales recorded today")}</strong>${t("Saved sales appear here.")}</div>`}
    </section>`;
}

function updateSplit(): void {
  const amount = parseAmount(d().amount) || 0;
  const sum = $("#sSum");
  if (sum) sum.textContent = money(amount, 2);
  const split = $("#vatSplit");
  if (!split) return;
  if (!tenant().vatRegistered || !amount) { split.textContent = ""; return; }
  const vat = vatFromGross(amount);
  split.textContent = t("Net {x} + VAT {r}% {y}", { x: money(amount - vat, 2), r: VAT_RATE * 100, y: money(vat, 2) });
}

export function mountSales(): void {
  updateSplit();
}

export function onSaleInput(key: string, value: string): void {
  const x = d();
  if (key === "amount") { x.amount = value; clearErrors(["amount"]); updateSplit(); }
  else if (key === "customer") { x.customer = value; clearErrors(["customer"]); }
  else if (key === "customerTin") { x.customerTin = value.replace(/\D/g, ""); clearErrors(["tin"]); }
  else if (key === "date") x.date = value;
  else if (key === "dueDate") x.dueDate = value;
  else if (key === "fiscalReceiptNo") x.fiscalReceiptNo = value;
  else if (key === "reference") x.reference = value;
}

function saveSale(): void {
  const x = d();
  const amount = parseAmount(x.amount);
  const errors: FieldErrors = {};
  if (!(amount > 0)) errors.amount = t("Enter an amount above 0.");
  if (x.settle === "CREDIT" && !x.customer.trim()) errors.customer = t("Who owes this money?");
  if (x.settle === "CREDIT" && x.customerTin && x.customerTin.length !== 10) errors.tin = t("A TIN has 10 digits.");
  if (showErrors(errors, ["amount", "customer", "tin"])) return;

  const ten = tenant();
  const usedAuto = x.fiscalReceiptNo.trim() === nextFiscal();
  const fiscalNo = usedAuto ? takeFiscalNo() : x.fiscalReceiptNo.trim();
  const ts = x.date === today() ? new Date().toISOString() : stamp(x.date, 13);
  const paid = x.settle === "PAID";
  const method: PaymentMethod | null = paid ? x.paymentMethod : null;
  const rec: SaleRecord = {
    id: newId("sale"), tenantId: ten.id, channelId: x.channelId, totalAmount: round2(amount),
    vatAmount: ten.vatRegistered ? vatFromGross(amount) : 0, paymentMethod: method, status: paid ? "PAID" : "PENDING",
    timestamp: ts, paidAt: paid ? ts : null, customer: x.customer.trim(), customerTin: x.customerTin,
    fiscalReceiptNo: fiscalNo, dueDate: paid ? null : x.dueDate, reference: x.reference.trim(),
  };
  addSale(rec);
  drafts.sale = newSaleDraft({ channelId: x.channelId, paymentMethod: x.paymentMethod, date: x.date });
  state.errors = {};
  rerender("#sAmount");
  toast(t("Saved {c} · {x} · {m}", { c: tk(`channel.${rec.channelId}`), x: money(rec.totalAmount, 2), m: method ? payName(method) : t("on credit") }), () => {
    removeRecord(rec.id);
    if (usedAuto) ledger().nextFiscalNo--;
    rerender();
  });
}

export const submitSale = saveSale;

export const salesActions: ActionMap = {
  "s-channel": (el) => {
    const ch = SALES_CHANNELS.find((c) => c.id === el.dataset.value);
    if (!ch) return;
    d().channelId = ch.id;
    setPressed(el);
    if (ch.b2b && d().settle === "PAID") { d().settle = "CREDIT"; const p = $("#salePay"); if (p) p.innerHTML = salePay(); }
    $<HTMLElement>("#sAmount")?.focus();
  },
  "s-settle": (el) => {
    d().settle = el.dataset.value === "CREDIT" ? "CREDIT" : "PAID";
    const p = $("#salePay");
    if (p) p.innerHTML = salePay();
    $<HTMLElement>(`[data-action="s-settle"][data-value="${d().settle}"]`)?.focus();
  },
  "s-method": (el) => {
    const v = el.dataset.value ?? "";
    if (!isPaymentMethod(v)) return;
    const hadRef = d().paymentMethod !== "CASH";
    d().paymentMethod = v;
    if (hadRef !== (v !== "CASH")) {
      const p = $("#salePay");
      if (p) p.innerHTML = salePay();
      $$<HTMLElement>(`[data-action="s-method"][data-value="${v}"]`)[0]?.focus();
    } else setPressed(el);
  },
  "remove-sale": (el) => {
    const r = removeRecord(el.dataset.id ?? "");
    if (!r) return;
    rerender();
    toast(t("Removed {x}", { x: "channelId" in r ? tk(`channel.${r.channelId}`) : "" }), () => { restoreRecord(r); rerender(); });
  },
};
