/* Expense & purchase entry: smart search, Category → Sub-category → Item
   cascade, quantity/unit/price with a two-way total, VAT and withholding,
   six payment sources. */

import type { CatalogItem, ExpenseRecord, FieldErrors, MainCategory, PaymentMethod } from "../types";
import { registerText, t, tk } from "../i18n";
import { fmtTime, localDay, money, num, parseAmount, plain, relDay, round2, stamp, today } from "../format";
import { MAIN_CATEGORIES, PAYMENT_METHODS, isMainCategory, isPaymentMethod } from "../catalog";
import { VAT_RATE, vatFromGross, withholdingFor, WITHHOLDING } from "../tax";
import { newId } from "../seed";
import {
  addExpense, balances, catalog, drafts, itemById, itemLabel, itemsOf, lastPurchaseOf, ledger, newExpenseDraft,
  removeRecord, restoreRecord, state, subsOf, tenant, units,
} from "../store";
import { rankCatalog, rankVendors } from "../search";
import { $, esc, highlight, icon } from "../ui/dom";
import { attachCombobox, type ComboOption } from "../ui/combobox";
import { clearErrors, errText, invalid, metricsBar, payName, periodSeg, seg, setPressed, showErrors, statusTag } from "../ui/shared";
import { toast } from "../ui/toast";
import { rerender, type ActionMap } from "../ui/app";
import { openCatalog } from "../ui/catalogDrawer";

const d = (): typeof drafts.expense => drafts.expense;
const selectedItem = (): CatalogItem | undefined => (d().itemId ? itemById(d().itemId as string) : undefined);
const isAdjustment = (): boolean => selectedItem()?.kind === "ADJUSTMENT";

/* ---------- option builders ---------- */

const categoryOptions = (sel: string): string =>
  `<option value="">${t("Choose…")}</option>` +
  MAIN_CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(tk(`cat.${c.id}`))}</option>`).join("");

const subOptions = (main: MainCategory | "", sel: string): string =>
  main
    ? `<option value="">${t("Choose…")}</option>` + subsOf(main).map((s) => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${esc(tk(`sub.${s.id}`))}</option>`).join("")
    : `<option value="">${t("Pick a category first")}</option>`;

const itemOptions = (sub: string, sel: string | null): string =>
  sub
    ? `<option value="">${t("Choose or type above…")}</option>` + itemsOf(sub).map((i) => `<option value="${i.id}" ${i.id === sel ? "selected" : ""}>${esc(tk(i.nameKey))}</option>`).join("")
    : `<option value="">${t("Pick a sub-category first")}</option>`;

const unitOptions = (sel: string): string =>
  units().map((u) => `<option value="${esc(u.code)}" ${u.code === sel ? "selected" : ""}>${esc(tk(`unit.${u.code}`))}</option>`).join("");

/* ---------- render ---------- */

export function renderExpenses(): string {
  const x = d();
  const e = state.errors;
  return `
    <div class="page-head">
      <div><h1>${t("Expenses")}</h1><p>${t("Log what you bought or paid for. Totals update as you type.")}</p></div>
      <div class="head-tools">${periodSeg()}<button type="button" class="btn" data-action="open-catalog" data-tab="items">${icon("tags")} ${t("Items & categories")}</button></div>
    </div>
    ${metricsBar()}
    <div class="split">
      <form class="card form" id="expenseForm" novalidate aria-labelledby="efTitle">
        <h2 id="efTitle" class="sr">${t("New expense")}</h2>

        <fieldset class="form-sec">
          <legend class="sec-title">${t("What was it?")}</legend>
          <div class="field">
            <div class="field-top"><label for="eItem">${t("Item or service")}</label>
              <button type="button" class="link-btn" data-action="open-catalog" data-tab="items" data-prefill="1">${icon("plus")} ${t("New item")}</button></div>
            <div class="combo">
              <input id="eItem" class="input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="eItemList"
                autocomplete="off" placeholder="${t("Type to search, e.g. “on” for Onion")}" value="${esc(x.query)}" data-bind="expense.query" ${invalid(e, "item")}>
              <ul id="eItemList" class="combo-list" role="listbox" aria-label="${t("Suggestions")}" hidden></ul>
            </div>
            <p class="hint" id="itemHint"></p>
            ${errText(e, "item")}
          </div>
          <div class="field"><label for="eCat">${t("Category")}</label>
            <select id="eCat" class="input" data-bind="expense.category" ${invalid(e, "category")}>${categoryOptions(x.category)}</select>${errText(e, "category")}</div>
          <div class="row">
            <div class="field"><label for="eSub">${t("Sub-category")}</label>
              <select id="eSub" class="input" data-bind="expense.subCategory" ${invalid(e, "sub")}>${subOptions(x.category, x.subCategory)}</select>${errText(e, "sub")}</div>
            <div class="field"><label for="eItemSel">${t("Specific item")}</label>
              <select id="eItemSel" class="input" data-bind="expense.itemId">${itemOptions(x.subCategory, x.itemId)}</select></div>
          </div>
        </fieldset>

        <fieldset class="form-sec">
          <legend class="sec-title">${t("Quantity & cost")}</legend>
          <div class="row r4">
            <div class="field"><label for="eQty">${t("Quantity")}</label>
              <input id="eQty" class="input num-in" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(x.quantity)}" data-bind="expense.quantity" ${invalid(e, "qty")}>${errText(e, "qty")}</div>
            <div class="field"><div class="field-top"><label for="eUnit">${t("Unit")}</label>
              <button type="button" class="link-btn" data-action="open-catalog" data-tab="units" aria-label="${t("Add a unit")}">${icon("plus")}</button></div>
              <select id="eUnit" class="input" data-bind="expense.unit">${unitOptions(x.unit)}</select></div>
            <div class="field"><label for="ePrice">${t("Unit price")}</label>
              <div class="affix"><span>ETB</span><input id="ePrice" class="input num-in" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(x.unitPrice)}" data-bind="expense.unitPrice"></div></div>
            <div class="field"><label for="eTotal">${t("Total")}</label>
              <div class="affix"><span>ETB</span><input id="eTotal" class="input num-in" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(x.total)}" data-bind="expense.total" ${invalid(e, "total")}></div>${errText(e, "total")}</div>
          </div>
          <p class="hint" id="priceHint"></p>
          <p class="hint">${t("Type the unit price or the receipt total; the other is calculated.")}</p>
          <div id="taxBlock"></div>
        </fieldset>

        <fieldset class="form-sec" id="paySec">${paySection()}</fieldset>

        <div class="field"><label for="eNote">${t("Note")} <span class="opt-label">${t("(optional)")}</span></label>
          <input id="eNote" class="input" type="text" placeholder="${t("e.g. receipt no., quality issue")}" value="${esc(x.note)}" data-bind="expense.note"></div>

        <div class="total-bar">
          <div><span class="label">${t("Expense total")}</span><output id="eSum" aria-live="polite">${money(parseAmount(x.total) || 0, 2)}</output><small id="eSumNote"></small></div>
          <div class="form-actions">
            <button type="button" class="btn" data-action="save-expense" data-another="1">${t("Save & add another")}</button>
            <button type="submit" class="btn primary">${icon("check")} ${t("Save expense")}</button>
          </div>
        </div>
      </form>
      <aside class="side" aria-label="${t("Today's expenses")}">${expenseSide()}</aside>
    </div>`;
}

function paySection(): string {
  const x = d();
  const e: FieldErrors = state.errors;
  if (isAdjustment()) {
    return `<legend class="sec-title">${t("Payment")}</legend>
      <p class="info">${icon("alert")} ${t("Non-cash adjustment: recorded as a cost, no money leaves a payment source.")}</p>
      <div class="field"><label for="eDate">${t("Date")}</label><input id="eDate" class="input" type="date" max="${today()}" value="${esc(x.date)}" data-bind="expense.date"></div>`;
  }
  const bal = balances();
  return `<legend class="sec-title">${t("Vendor & payment")}</legend>
    <div class="row">
      <div class="field"><label for="eVendor">${t("Vendor")} <span class="opt-label">${t("(optional)")}</span></label>
        <div class="combo">
          <input id="eVendor" class="input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="eVendorList"
            autocomplete="off" placeholder="${t("e.g. Merkato Fresh Produce")}" value="${esc(x.vendor)}" data-bind="expense.vendor">
          <ul id="eVendorList" class="combo-list" role="listbox" aria-label="${t("Vendors")}" hidden></ul>
        </div></div>
      <div class="field"><label for="eDate">${t("Date")}</label><input id="eDate" class="input" type="date" max="${today()}" value="${esc(x.date)}" data-bind="expense.date"></div>
    </div>
    <div class="field"><span class="label" id="settleLbl">${t("Settlement")}</span>
      ${seg("e-settle", x.settle, [["PAID", t("Paid now")], ["LATER", t("Pay later (credit)")]], t("Settlement"), "lg")}</div>
    ${x.settle === "PAID" ? `
    <div class="field"><span class="label" id="srcLbl">${t("Payment source")}</span>
      <div class="pay-grid" role="group" aria-labelledby="srcLbl">${PAYMENT_METHODS.map((p) => `
        <button type="button" class="pay-opt" data-action="e-method" data-value="${p.id}" aria-pressed="${x.paymentMethod === p.id}">
          <strong>${esc(tk(`pay.${p.id}`))}</strong><small>${money(bal[p.id], 0)} ${t("available")}</small></button>`).join("")}</div>
      <p class="hint warn" id="balanceHint"></p></div>` : `
    <div class="field"><label for="eDue">${t("Due date")}</label>
      <input id="eDue" class="input" type="date" min="${today()}" value="${esc(x.dueDate)}" data-bind="expense.dueDate" ${invalid(e, "due")}>${errText(e, "due")}
      <p class="hint">${t("It stays under Reconcile → To pay until you mark it paid.")}</p></div>`}`;
}

function expenseSide(): string {
  const now = today();
  const todays = ledger().expenses.filter((x) => localDay(x.timestamp) === now).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const total = todays.reduce((s, x) => s + x.totalAmount, 0);
  const byCat = new Map<MainCategory, number>();
  for (const x of todays) byCat.set(x.category, (byCat.get(x.category) ?? 0) + x.totalAmount);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  return `
    <section class="card">
      <div class="card-head"><div><h2>${t("Spent today")}</h2><p>${t("{n} entries", { n: todays.length })}</p></div></div>
      <div class="sum-total"><span class="meta">${t("Total")}</span><strong>${money(total, 2)}</strong></div>
      ${cats.length ? `<div class="bar-list">${cats.map(([id, v]) => `
        <div class="bar-row static"><span><i class="dot" style="background:${MAIN_CATEGORIES.find((c) => c.id === id)?.color}"></i>${esc(tk(`catShort.${id}`))}</span><span class="num">${money(v, 0)}</span>
          <span class="bar-track"><i style="width:${(v / total) * 100}%;background:${MAIN_CATEGORIES.find((c) => c.id === id)?.color}"></i></span></div>`).join("")}</div>` : ""}
    </section>
    <section class="card">
      <div class="card-head"><h2>${t("Today's entries")}</h2></div>
      ${todays.length ? `<ul class="entry-list">${todays.slice(0, 14).map((x) => `
        <li class="entry"><strong>${esc(itemLabel(x))}</strong><span class="num">${money(x.totalAmount)}</span>
          <div class="entry-meta"><span>${num(x.quantity)} ${esc(tk(`unit.${x.unit}`))} · ${x.paymentMethod ? esc(payName(x.paymentMethod)) : x.vendor ? esc(x.vendor) : t("Non-cash")} · ${fmtTime(x.timestamp)}</span>
            <span class="entry-act">${statusTag(x, itemById(x.itemId)?.kind === "ADJUSTMENT")}
              <button type="button" class="btn ghost small icon-btn" data-action="remove-expense" data-id="${x.id}" aria-label="${t("Remove {x}", { x: itemLabel(x) })}">${icon("trash")}</button></span></div>
        </li>`).join("")}</ul>` : `<div class="empty"><strong>${t("Nothing logged today")}</strong>${t("Saved expenses appear here.")}</div>`}
    </section>`;
}

/* ---------- live calculations ---------- */

function recalc(): void {
  const x = d();
  const qty = parseAmount(x.quantity);
  const price = parseAmount(x.unitPrice);
  const total = parseAmount(x.total);
  if (x.lastEdited === "price") {
    x.total = qty > 0 && price >= 0 ? plain(qty * price) : "";
    const el = $<HTMLInputElement>("#eTotal");
    if (el && document.activeElement !== el) el.value = x.total;
  } else if (qty > 0 && total >= 0) {
    x.unitPrice = plain(total / qty);
    const el = $<HTMLInputElement>("#ePrice");
    if (el && document.activeElement !== el) el.value = x.unitPrice;
  }
  $("#ePrice")?.classList.toggle("computed", x.lastEdited === "total");
  $("#eTotal")?.classList.toggle("computed", x.lastEdited === "price");
  const sum = $("#eSum");
  if (sum) sum.textContent = money(parseAmount(x.total) || 0, 2);
  updateHints();
}

function updateHints(): void {
  const x = d();
  const hint = $("#itemHint");
  const ph = $("#priceHint");
  const taxBlock = $("#taxBlock");
  const sumNote = $("#eSumNote");
  if (!hint || !ph || !taxBlock || !sumNote) return;
  const item = selectedItem();
  const total = parseAmount(x.total) || 0;

  if (item) {
    const last = lastPurchaseOf(item.id);
    hint.className = "hint";
    hint.innerHTML = `<span class="crumb">${esc(tk(`catShort.${item.mainCategory}`))} › ${esc(tk(`sub.${item.subCategory}`))}</span>${
      last ? ` · ${t("Last: {q} {u} at {p} {when}", { q: num(last.quantity), u: tk(`unit.${last.unit}`), p: money(last.unitPrice), when: relDay(localDay(last.timestamp)).toLowerCase() })}` : ""}`;
    const price = parseAmount(x.unitPrice);
    const ref = last?.unitPrice ?? item.defaultPrice;
    if (price > 0 && ref > 0 && x.unit === (last?.unit ?? item.defaultUnit)) {
      const diff = ((price - ref) / ref) * 100;
      if (diff >= 10) { ph.className = "hint warn"; ph.innerHTML = `${icon("alert")} ${t("{p}% more than last time ({x}). Check the receipt.", { p: Math.round(diff), x: money(ref) })}`; }
      else if (diff <= -10) { ph.className = "hint good"; ph.textContent = t("{p}% less than last time ({x}).", { p: Math.round(-diff), x: money(ref) }); }
      else ph.textContent = "";
    } else ph.textContent = "";
  } else if (x.query.trim()) {
    hint.className = "hint";
    hint.innerHTML = `<span class="tag pending plain">${t("New item")}</span> ${t("“{x}” will be added to your catalog. Choose its category.", { x: esc(x.query.trim()) })}`;
    ph.textContent = "";
  } else {
    hint.textContent = "";
    ph.textContent = "";
  }

  // VAT and withholding
  const ten = tenant();
  const adj = isAdjustment();
  let html = "";
  if (!adj) {
    const vat = x.vatIncluded ? vatFromGross(total) : 0;
    html += `<label class="check"><input type="checkbox" id="eVat" data-bind-check="expense.vatIncluded" ${x.vatIncluded ? "checked" : ""}>
      <span>${t("Price includes {r}% VAT", { r: VAT_RATE * 100 })}<small>${x.vatIncluded ? t("Input VAT {x} can be claimed back", { x: money(vat, 2) }) : t("Tick when the vendor's receipt shows VAT")}</small></span></label>`;
    const probe = item ?? (x.category ? { kind: "GOODS" as const, mainCategory: x.category as MainCategory } : null);
    if (probe) {
      const w = withholdingFor(probe, total, x.vendorHasTin, ten.withholdingAgent);
      if (w.applies) {
        html += `<div class="wht">
          <p>${icon("shield")} <strong>${t("Withholding tax applies")}</strong> · ${t("{r}% on {kind} of {th} or more", {
            r: Math.round(w.rate * 100), kind: probe.kind === "SERVICE" ? t("services") : t("goods"), th: money(w.threshold, 0) })}</p>
          <p class="meta">${t("Withhold {x} and pay the vendor {y}. Remit the withheld amount to the Ministry of Revenues.", { x: money(w.amount, 2), y: money(total - w.amount, 2) })}</p>
          <label class="check"><input type="checkbox" data-bind-check="expense.vendorHasTin" ${x.vendorHasTin ? "checked" : ""}>
            <span>${t("Vendor gave a TIN and business licence")}<small>${t("Without them the rate is {r}%", { r: WITHHOLDING.noTinRate * 100 })}</small></span></label>
        </div>`;
        sumNote.textContent = t("Pay vendor {x}", { x: money(total - w.amount, 2) });
      } else sumNote.textContent = "";
    } else sumNote.textContent = "";
  } else sumNote.textContent = t("Non-cash");
  taxBlock.innerHTML = html;

  // balance check
  const bh = $("#balanceHint");
  if (bh) {
    const avail = balances()[x.paymentMethod];
    bh.textContent = x.settle === "PAID" && total > avail ? t("Only {x} available in {m}.", { x: money(avail, 0), m: payName(x.paymentMethod) }) : "";
  }
}

/* ---------- picking ---------- */

function applyItem(item: CatalogItem): void {
  const x = d();
  const last = lastPurchaseOf(item.id);
  Object.assign(x, {
    itemId: item.id, query: tk(item.nameKey), category: item.mainCategory, subCategory: item.subCategory, unit: item.defaultUnit,
    unitPrice: plain(last?.unitPrice ?? item.defaultPrice) || "", lastEdited: "price",
    vatIncluded: tenant().vatRegistered && item.vatApplicable, vendorHasTin: true,
  });
  if (!x.vendor && last?.vendor) x.vendor = last.vendor;
  if (x.unitPrice === "0") x.unitPrice = "";
  clearErrors(["item", "category", "sub"]);
}

function syncFormFromDraft(focus: string): void {
  const x = d();
  const set = (sel: string, v: string): void => { const el = $<HTMLInputElement>(sel); if (el) el.value = v; };
  set("#eItem", x.query);
  const cat = $("#eCat"); if (cat) cat.innerHTML = categoryOptions(x.category);
  const sub = $("#eSub"); if (sub) sub.innerHTML = subOptions(x.category, x.subCategory);
  const sel = $("#eItemSel"); if (sel) sel.innerHTML = itemOptions(x.subCategory, x.itemId);
  const unit = $("#eUnit"); if (unit) unit.innerHTML = unitOptions(x.unit);
  set("#ePrice", x.unitPrice);
  const pay = $("#paySec"); if (pay) pay.innerHTML = paySection();
  mountVendorCombo();
  recalc();
  $<HTMLElement>(focus)?.focus();
}

export function pickItem(item: CatalogItem): void {
  applyItem(item);
  syncFormFromDraft("#eQty");
}

function itemSource(query: string): { heading: string; options: ComboOption<CatalogItem | string>[] } {
  const q = query.trim();
  const ranked = rankCatalog(q);
  const options: ComboOption<CatalogItem | string>[] = ranked.map(({ item, hit }) => {
    const name = tk(item.nameKey);
    const showMatched = hit && hit.matched !== name;
    const last = lastPurchaseOf(item.id);
    const price = last?.unitPrice ?? item.defaultPrice;
    return {
      value: item,
      html: `<span class="opt-main">
          <span class="opt-name">${showMatched || !hit ? esc(name) : highlight(name, hit.start, q.length)} <span class="opt-sep">–</span> <span class="opt-sub">${esc(tk(`sub.${item.subCategory}`))}</span></span>
          ${showMatched && hit ? `<span class="opt-alias">“${highlight(hit.matched, hit.start, q.length)}”</span>` : ""}
          <span class="opt-crumb"><i class="dot" style="background:${MAIN_CATEGORIES.find((c) => c.id === item.mainCategory)?.color}"></i>${esc(tk(`catShort.${item.mainCategory}`))}</span>
        </span>
        <span class="opt-side">${price ? `<span class="mono">${money(price)}/${esc(tk(`unit.${item.defaultUnit}`))}</span>` : ""}<span>${
          item.kind === "ADJUSTMENT" ? t("Non-cash") : last ? t("Used {when}", { when: relDay(localDay(last.timestamp)).toLowerCase() }) : t("Catalog")}</span></span>`,
    };
  });
  if (q && !catalog().some((i) => tk(i.nameKey).toLowerCase() === q.toLowerCase())) {
    options.push({ value: q, variant: "create", html: `${icon("plus")}<span>${t("Add “{x}” as a new item", { x: esc(q) })}</span>` });
  }
  return { heading: q ? (ranked.length ? t("Matching items") : "") : ranked.length ? t("Recently used") : "", options };
}

function mountVendorCombo(): void {
  const input = $<HTMLInputElement>("#eVendor");
  const list = $<HTMLUListElement>("#eVendorList");
  if (!input || !list) return;
  attachCombobox<string>(input, list, (q) => {
    const res = rankVendors(q);
    return {
      heading: q.trim() ? "" : t("Frequent vendors"),
      options: res.map((v) => ({
        value: v.name,
        html: `<span class="opt-main"><span class="opt-name">${v.hit ? highlight(v.name, v.hit.start, q.trim().length) : esc(v.name)}</span></span><span class="opt-side"><span>${t("{n} purchases", { n: v.uses })}</span></span>`,
      })),
    };
  }, (o) => {
    d().vendor = o.value;
    input.value = o.value;
    $<HTMLElement>("#eDate")?.focus();
  });
}

export function mountExpenses(): void {
  const input = $<HTMLInputElement>("#eItem");
  const list = $<HTMLUListElement>("#eItemList");
  if (input && list) {
    attachCombobox(input, list, itemSource, (o) => {
      if (typeof o.value === "string") openCatalog("items", { prefill: o.value, returnFocus: "#eItem", onItemCreated: useNewItem });
      else pickItem(o.value);
    });
  }
  mountVendorCombo();
  recalc();
}

/* ---------- binding hooks (called from main's input/change handlers) ---------- */

export function onExpenseInput(key: string, value: string): void {
  const x = d();
  switch (key) {
    case "query": {
      x.query = value;
      const it = selectedItem();
      if (it && tk(it.nameKey) !== value) x.itemId = null;
      clearErrors(["item"]);
      updateHints();
      break;
    }
    case "quantity": x.quantity = value; clearErrors(["qty"]); recalc(); break;
    case "unitPrice": x.unitPrice = value; x.lastEdited = "price"; clearErrors(["total"]); recalc(); break;
    case "total": x.total = value; x.lastEdited = "total"; clearErrors(["total"]); recalc(); break;
    case "vendor": x.vendor = value; break;
    case "date": x.date = value; break;
    case "dueDate": x.dueDate = value; clearErrors(["due"]); break;
    case "note": x.note = value; break;
    default: break;
  }
}

export function onExpenseChange(key: string, value: string): void {
  const x = d();
  if (key === "category") {
    x.category = isMainCategory(value) ? value : "";
    x.subCategory = "";
    x.itemId = null;
    const sub = $("#eSub"); if (sub) sub.innerHTML = subOptions(x.category, "");
    const sel = $("#eItemSel"); if (sel) sel.innerHTML = itemOptions("", null);
    clearErrors(["category"]);
    updateHints();
  } else if (key === "subCategory") {
    x.subCategory = value;
    x.itemId = null;
    const sel = $("#eItemSel"); if (sel) sel.innerHTML = itemOptions(value, null);
    clearErrors(["sub"]);
    updateHints();
  } else if (key === "itemId") {
    const it = value ? itemById(value) : undefined;
    if (it) { applyItem(it); syncFormFromDraft("#eQty"); }
  } else if (key === "unit") {
    x.unit = value;
    updateHints();
  } else if (key === "date" || key === "dueDate") {
    onExpenseInput(key, value);
  }
}

export function onExpenseCheck(key: string, checked: boolean): void {
  if (key === "vatIncluded") d().vatIncluded = checked;
  if (key === "vendorHasTin") d().vendorHasTin = checked;
  updateHints();
}

/* ---------- save ---------- */

function saveExpense(another: boolean): void {
  const x = d();
  const name = x.query.trim();
  const qty = parseAmount(x.quantity);
  const total = parseAmount(x.total);
  const errors: FieldErrors = {};
  if (!name) errors.item = t("Enter what you bought or paid for.");
  if (!x.category) errors.category = t("Choose a category.");
  if (!x.subCategory) errors.sub = t("Choose a sub-category.");
  if (!(qty > 0)) errors.qty = t("Enter a quantity above 0.");
  if (!(total > 0)) errors.total = t("Enter a unit price or the total.");
  if (x.settle === "LATER" && !x.dueDate && !isAdjustment()) errors.due = t("Choose a due date.");
  if (showErrors(errors, ["item", "category", "sub", "qty", "total", "due"])) return;

  const l = ledger();
  let item = selectedItem() ?? catalog().find((i) => tk(i.nameKey).toLowerCase() === name.toLowerCase());
  let created: CatalogItem | null = null;
  if (!item) {
    const key = `custom.${newId("item")}`;
    registerText(key, { en: name, am: "", om: "" });
    item = { id: key, nameKey: key, mainCategory: x.category as MainCategory, subCategory: x.subCategory, defaultUnit: x.unit,
      kind: "GOODS", defaultPrice: round2(total / qty), aliases: [], vatApplicable: x.vatIncluded, custom: true };
    l.customItems.push(item);
    created = item;
  }
  const adj = item.kind === "ADJUSTMENT";
  const ten = tenant();
  const w = withholdingFor(item, total, x.vendorHasTin, ten.withholdingAgent);
  const ts = x.date === today() ? new Date().toISOString() : stamp(x.date, 12);
  const paid = adj || x.settle === "PAID";
  const method: PaymentMethod | null = adj || !paid ? null : x.paymentMethod;
  const rec: ExpenseRecord = {
    id: newId("exp"), itemId: item.id, itemName: item.nameKey, category: x.category as MainCategory, subCategory: x.subCategory,
    quantity: qty, unit: x.unit, unitPrice: round2(total / qty), totalAmount: round2(total), paymentMethod: method, timestamp: ts,
    tenantId: ten.id, vendor: adj ? "" : x.vendor.trim(), status: paid ? "PAID" : "PENDING", dueDate: paid ? null : x.dueDate,
    paidAt: paid ? ts : null, vatAmount: !adj && x.vatIncluded ? vatFromGross(total) : 0,
    withholdingAmount: w.amount, withholdingRate: w.rate, note: x.note.trim(),
  };
  const vendorIsNew = Boolean(rec.vendor) && !l.vendors.includes(rec.vendor);
  addExpense(rec);
  drafts.expense = another
    ? newExpenseDraft({ vendor: x.vendor, date: x.date, settle: x.settle, paymentMethod: x.paymentMethod, dueDate: x.dueDate })
    : newExpenseDraft();
  state.errors = {};
  rerender("#eItem");
  toast(
    t("Saved {item} · {q} {u} · {x}", { item: tk(item.nameKey), q: num(qty), u: tk(`unit.${x.unit}`), x: money(rec.totalAmount, 2) }) +
      (rec.withholdingAmount ? ` · ${t("{x} withheld", { x: money(rec.withholdingAmount, 2) })}` : ""),
    () => {
      removeRecord(rec.id);
      if (created) l.customItems = l.customItems.filter((i) => i !== created);
      if (vendorIsNew) l.vendors = l.vendors.filter((v) => v !== rec.vendor);
      rerender();
    },
  );
}

export const expenseActions: ActionMap = {
  "e-settle": (el) => { d().settle = el.dataset.value === "LATER" ? "LATER" : "PAID"; const s = $("#paySec"); if (s) s.innerHTML = paySection(); mountVendorCombo(); updateHints(); $<HTMLElement>(`[data-action="e-settle"][data-value="${d().settle}"]`)?.focus(); },
  "e-method": (el) => { const v = el.dataset.value ?? ""; if (isPaymentMethod(v)) { d().paymentMethod = v; setPressed(el); updateHints(); } },
  "save-expense": (el) => saveExpense(Boolean(el.dataset.another)),
  "remove-expense": (el) => {
    const r = removeRecord(el.dataset.id ?? "");
    if (!r) return;
    rerender();
    toast(t("Removed {x}", { x: "itemName" in r ? tk(r.itemName) : "" }), () => { restoreRecord(r); rerender(); });
  },
};

export const submitExpense = (): void => saveExpense(false);

/** Called by the catalog drawer after a new item is added from this form. */
export function useNewItem(item: CatalogItem): void {
  pickItem(item);
  toast(t("Added {x} to {y}", { x: tk(item.nameKey), y: tk(`sub.${item.subCategory}`) }));
}
