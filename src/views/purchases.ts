/* Inventory / COGS purchases: what was bought for stock, in the five
   COGS categories. Search the catalog, quantity × unit cost with a
   two-way total, vendor and payment source. Kept separate from sales. */

import type { COGSCategory, FieldErrors, InventoryItem, PurchaseRecord } from "../types";
import { registerText, t, tk, tkAll } from "../i18n";
import { localDay, money, normalize, num, parseAmount, plain, round2, stamp, today } from "../format";
import { COGS_COLOR, COGS_IDS, EXPENSE_METHODS, UNIT_CODES, isCogs, isExpenseMethod } from "../catalog";
import { newId } from "../seed";
import {
  canDelete, db, inventory, inventoryItem, lastCost, recordPurchase, removeRecord, restoreRecord, state, stampUser, user, vendors,
} from "../store";
import { $, esc, highlight, icon } from "../ui/dom";
import { attachCombobox, type ComboOption } from "../ui/combobox";
import { byline, clearErrors, errText, invalid, methodGrid, metricsBar, payName, setPressed, showErrors } from "../ui/shared";
import { toast } from "../ui/toast";
import { rerender, type ActionMap } from "../ui/app";

interface Draft {
  query: string;
  itemId: string | null;
  category: COGSCategory | "";
  quantity: string;
  unit: string;
  unitCost: string;
  total: string;
  lastEdited: "cost" | "total";
  vendor: string;
  date: string;
  method: PurchaseRecord["paymentMethod"];
  note: string;
}

const fresh = (keep: Partial<Draft> = {}): Draft => ({
  query: "", itemId: null, category: "", quantity: "", unit: "kg", unitCost: "", total: "", lastEdited: "cost",
  vendor: keep.vendor ?? "", date: keep.date ?? today(), method: keep.method ?? "CASH", note: "",
});

let d: Draft = fresh();

/* ---------- search ---------- */

function rank(query: string): { item: InventoryItem; start: number }[] {
  const q = normalize(query);
  if (!q) return [];
  const out: { item: InventoryItem; score: number; start: number }[] = [];
  for (const item of inventory()) {
    let best = -1;
    let start = -1;
    for (const text of [...tkAll(item.nameKey), ...item.aliases]) {
      const n = normalize(text);
      const i = n.indexOf(q);
      const score = n.startsWith(q) ? 100 : i >= 0 && /[\s(-]/.test(n[i - 1] ?? "") ? 90 : i >= 0 ? 70 : q.length <= 3 && n[0] === q[0] ? 20 : -1;
      if (score > best) { best = score; start = text === tk(item.nameKey) ? i : -1; }
    }
    if (best > 0) out.push({ item, score: best, start });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}

function source(query: string): { heading: string; options: ComboOption<InventoryItem | string>[] } {
  const q = query.trim();
  const ranked = q ? rank(q) : [];
  const options: ComboOption<InventoryItem | string>[] = ranked.map(({ item, start }) => {
    const name = tk(item.nameKey);
    const cost = lastCost(item.id) ?? item.unitCost;
    return {
      value: item,
      html: `<span class="opt-main"><span class="opt-name">${start >= 0 ? highlight(name, start, q.length) : esc(name)} <span class="opt-sep">–</span> <span class="opt-sub">${esc(tk(item.groupKey))}</span></span>
        <span class="opt-crumb"><i class="dot" style="background:${COGS_COLOR[item.category]}"></i>${esc(tk(`cogs.${item.category}`))}</span></span>
        <span class="opt-side"><span class="mono">${money(cost)}/${esc(tk(`unit.${item.unit}`))}</span></span>`,
    };
  });
  if (q && !inventory().some((i) => normalize(tk(i.nameKey)) === normalize(q))) {
    options.push({ value: q, variant: "create", html: `${icon("plus")}<span>${t("Add “{x}” as a new stock item", { x: esc(q) })}</span>` });
  }
  return { heading: ranked.length ? t("Stock items") : "", options };
}

/* ---------- render ---------- */

export function renderPurchases(): string {
  const e: FieldErrors = state.errors;
  const item = d.itemId ? inventoryItem(d.itemId) : undefined;
  return `
    <div class="page-head"><div><h1>${t("Inventory purchases")}</h1><p>${t("Stock bought for the kitchen and bar (cost of goods). Sales are recorded separately.")}</p></div></div>
    ${metricsBar()}
    <div class="split">
      <form class="card form" id="purchaseForm" novalidate aria-labelledby="pfTitle">
        <h2 id="pfTitle" class="sec-title">${t("New purchase")}</h2>
        <div class="field">
          <label for="pItem">${t("Stock item")}</label>
          <div class="combo">
            <input id="pItem" class="input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="pItemList"
              autocomplete="off" placeholder="${t("Type to search, e.g. “on” for Onion")}" value="${esc(d.query)}" data-bind="purchase.query" ${invalid(e, "item")}>
            <ul id="pItemList" class="combo-list" role="listbox" aria-label="${t("Suggestions")}" hidden></ul>
          </div>
          <p class="hint" id="pHint">${item ? `${esc(tk(`cogs.${item.category}`))} › ${esc(tk(item.groupKey))}` : ""}</p>
          ${errText(e, "item")}
        </div>
        <div class="field"><label for="pCat">${t("COGS category")}</label>
          <select id="pCat" class="input" data-bind="purchase.category" ${invalid(e, "category")}>
            <option value="">${t("Choose…")}</option>
            ${COGS_IDS.map((c) => `<option value="${c}" ${d.category === c ? "selected" : ""}>${esc(tk(`cogs.${c}`))}</option>`).join("")}
          </select>${errText(e, "category")}</div>
        <div class="row r4">
          <div class="field"><label for="pQty">${t("Quantity")}</label>
            <input id="pQty" class="input num-in" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(d.quantity)}" data-bind="purchase.quantity" ${invalid(e, "qty")}>${errText(e, "qty")}</div>
          <div class="field"><label for="pUnit">${t("Unit")}</label>
            <select id="pUnit" class="input" data-bind="purchase.unit">${UNIT_CODES.map((u) => `<option value="${u}" ${u === d.unit ? "selected" : ""}>${esc(tk(`unit.${u}`))}</option>`).join("")}</select></div>
          <div class="field"><label for="pCost">${t("Unit cost")}</label>
            <div class="affix"><span>ETB</span><input id="pCost" class="input num-in" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(d.unitCost)}" data-bind="purchase.unitCost"></div></div>
          <div class="field"><label for="pTotal">${t("Total cost")}</label>
            <div class="affix"><span>ETB</span><input id="pTotal" class="input num-in" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(d.total)}" data-bind="purchase.total" ${invalid(e, "total")}></div>${errText(e, "total")}</div>
        </div>
        <p class="hint">${t("Type the unit cost or the receipt total; the other is calculated.")}</p>
        <div class="row">
          <div class="field"><label for="pVendor">${t("Vendor")} <span class="opt-label">${t("(optional)")}</span></label>
            <input id="pVendor" class="input" list="vendorList" autocomplete="off" placeholder="${t("e.g. Merkato Fresh Produce")}" value="${esc(d.vendor)}" data-bind="purchase.vendor">
            <datalist id="vendorList">${vendors().map((v) => `<option value="${esc(v)}">`).join("")}</datalist></div>
          <div class="field"><label for="pDate">${t("Date")}</label><input id="pDate" class="input" type="date" max="${today()}" value="${esc(d.date)}" data-bind="purchase.date"></div>
        </div>
        <div class="field"><span class="label" id="pMethodLbl">${t("Paid with")}</span>${methodGrid("p-method", d.method, EXPENSE_METHODS, "pMethodLbl")}</div>
        <div class="field"><label for="pNote">${t("Note")} <span class="opt-label">${t("(optional)")}</span></label>
          <input id="pNote" class="input" type="text" placeholder="${t("e.g. receipt no., quality issue")}" value="${esc(d.note)}" data-bind="purchase.note"></div>
        <div class="total-bar">
          <div><span class="label">${t("Purchase total")}</span><output id="pSum" aria-live="polite">${money(parseAmount(d.total) || 0, 2)}</output>
            <small class="stamp">${icon("user")} ${t("Will be logged by {name}", { name: esc(user().name) })}</small></div>
          <div class="form-actions">
            <button type="button" class="btn" data-action="save-purchase" data-another="1">${t("Save & add another")}</button>
            <button type="submit" class="btn primary">${icon("check")} ${t("Save purchase")}</button>
          </div>
        </div>
      </form>
      <aside class="side">${purchaseSide()}</aside>
    </div>`;
}

function purchaseSide(): string {
  const now = today();
  const rows = db.purchases.filter((p) => localDay(p.timestamp) === now).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const total = rows.reduce((s, p) => s + p.totalCost, 0);
  const byCat = new Map<COGSCategory, number>();
  for (const p of rows) byCat.set(p.category, (byCat.get(p.category) ?? 0) + p.totalCost);
  return `
    <section class="card">
      <div class="card-head"><div><h2>${t("Bought today")}</h2><p>${t("{n} entries", { n: rows.length })}</p></div></div>
      <div class="sum-total"><span class="meta">${t("Total")}</span><strong>${money(total, 2)}</strong></div>
      <div class="bar-list">${COGS_IDS.filter((c) => byCat.get(c)).map((c) => `
        <div class="bar-row static"><span><i class="dot" style="background:${COGS_COLOR[c]}"></i>${esc(tk(`cogs.${c}`))}</span><span class="num">${money(byCat.get(c) ?? 0, 0)}</span>
          <span class="bar-track"><i style="width:${((byCat.get(c) ?? 0) / total) * 100}%;background:${COGS_COLOR[c]}"></i></span></div>`).join("")}</div>
    </section>
    <section class="card">
      <div class="card-head"><h2>${t("Today's entries")}</h2></div>
      ${rows.length ? `<ul class="entry-list">${rows.slice(0, 15).map((p) => `
        <li class="entry row-hover"><strong>${esc(tk(p.itemName))}</strong><span class="num">${money(p.totalCost)}</span>
          <div class="entry-meta"><span>${num(p.quantity)} ${esc(tk(`unit.${p.unit}`))} × ${money(p.unitCost)} · ${esc(payName(p.paymentMethod))}${p.vendor ? ` · ${esc(p.vendor)}` : ""}</span>
            ${canDelete() ? `<button type="button" class="btn ghost small icon-btn" data-action="delete-purchase" data-value="${p.id}" aria-label="${t("Delete {x}", { x: tk(p.itemName) })}">${icon("trash")}</button>` : ""}</div>
          <div class="entry-meta">${byline(p.loggedBy, p.timestamp)}</div>
        </li>`).join("")}</ul>` : `<div class="empty"><strong>${t("Nothing bought today")}</strong></div>`}
    </section>`;
}

/* ---------- live behaviour ---------- */

function recalc(): void {
  const q = parseAmount(d.quantity), c = parseAmount(d.unitCost), tot = parseAmount(d.total);
  if (d.lastEdited === "cost") {
    d.total = q > 0 && c >= 0 ? plain(q * c) : "";
    const el = $<HTMLInputElement>("#pTotal");
    if (el && document.activeElement !== el) el.value = d.total;
  } else if (q > 0 && tot >= 0) {
    d.unitCost = plain(tot / q);
    const el = $<HTMLInputElement>("#pCost");
    if (el && document.activeElement !== el) el.value = d.unitCost;
  }
  const sum = $("#pSum");
  if (sum) sum.textContent = money(parseAmount(d.total) || 0, 2);
}

function pick(item: InventoryItem): void {
  d.itemId = item.id;
  d.query = tk(item.nameKey);
  d.category = item.category;
  d.unit = item.unit;
  d.unitCost = plain(lastCost(item.id) ?? item.unitCost);
  d.lastEdited = "cost";
  const last = db.purchases.filter((p) => p.itemId === item.id).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
  if (!d.vendor && last?.vendor) d.vendor = last.vendor;
  clearErrors(["item", "category"]);
  rerender("#pQty");
}

/** Creates a stock item from the typed name, filed under the chosen category. */
function createItem(name: string, category: COGSCategory): InventoryItem {
  const id = newId("inv");
  const nameKey = `inv.${id}`;
  registerText(nameKey, { en: name, am: "", om: "" });
  const item: InventoryItem = { id, nameKey, category, groupKey: `cogs.${category}`, unit: d.unit, unitCost: round2(parseAmount(d.unitCost) || 0), aliases: [], custom: true };
  db.customInventory.push(item);
  return item;
}

export function mountPurchases(): void {
  const input = $<HTMLInputElement>("#pItem");
  const list = $<HTMLUListElement>("#pItemList");
  if (input && list) {
    attachCombobox(input, list, source, (o) => {
      if (typeof o.value === "string") {
        d.query = o.value;
        d.itemId = null;
        input.value = o.value;
        const hint = $("#pHint");
        if (hint) hint.innerHTML = `<span class="tag pending plain">${t("New item")}</span> ${t("Choose its COGS category below.")}`;
        $<HTMLElement>("#pCat")?.focus();
      } else pick(o.value);
    });
  }
  recalc();
}

export function onPurchaseInput(key: string, value: string): void {
  if (key === "query") { d.query = value; if (d.itemId && tk(inventoryItem(d.itemId)?.nameKey ?? "") !== value) d.itemId = null; clearErrors(["item"]); }
  else if (key === "quantity") { d.quantity = value; clearErrors(["qty"]); recalc(); }
  else if (key === "unitCost") { d.unitCost = value; d.lastEdited = "cost"; clearErrors(["total"]); recalc(); }
  else if (key === "total") { d.total = value; d.lastEdited = "total"; clearErrors(["total"]); recalc(); }
  else if (key === "vendor") d.vendor = value;
  else if (key === "date") d.date = value;
  else if (key === "note") d.note = value;
  else if (key === "category") { d.category = isCogs(value) ? value : ""; clearErrors(["category"]); }
  else if (key === "unit") d.unit = value;
}

function save(another: boolean): void {
  const name = d.query.trim();
  const q = parseAmount(d.quantity), tot = parseAmount(d.total);
  const errors: FieldErrors = {};
  if (!name) errors.item = t("Choose or type the stock item.");
  if (!d.category) errors.category = t("Choose a COGS category.");
  if (!(q > 0)) errors.qty = t("Enter a quantity above 0.");
  if (!(tot > 0)) errors.total = t("Enter a unit cost or the total.");
  if (showErrors(errors, ["item", "category", "qty", "total"])) return;

  let item = d.itemId ? inventoryItem(d.itemId) : inventory().find((i) => normalize(tk(i.nameKey)) === normalize(name));
  const created = !item;
  if (!item) item = createItem(name, d.category as COGSCategory);
  const ts = d.date === today() ? new Date().toISOString() : stamp(d.date, 12);
  const { loggedBy, userId } = stampUser();
  const rec: PurchaseRecord = {
    id: newId("pur"), category: d.category as COGSCategory, itemName: item.nameKey, quantity: q, unit: d.unit,
    unitCost: round2(tot / q), totalCost: round2(tot), loggedBy, timestamp: ts,
    itemId: item.id, vendor: d.vendor.trim(), paymentMethod: d.method, userId, note: d.note.trim(),
  };
  recordPurchase(rec);
  item.unitCost = rec.unitCost;
  d = another ? fresh({ vendor: d.vendor, date: d.date, method: d.method }) : fresh();
  state.errors = {};
  rerender("#pItem");
  toast(t("Saved {item} · {q} {u} · {x} · by {name}", { item: tk(item.nameKey), q: num(q), u: tk(`unit.${rec.unit}`), x: money(rec.totalCost, 2), name: loggedBy }) +
    (created ? ` · ${t("new item added")}` : ""), () => {
    removeRecord("PURCHASE", rec.id);
    if (created) db.customInventory = db.customInventory.filter((i) => i !== item);
    rerender();
  });
}

export const submitPurchase = (): void => save(false);

export const purchaseActions: ActionMap = {
  "save-purchase": (el) => save(Boolean(el.dataset.another)),
  "p-method": (el) => { const v = el.dataset.value ?? ""; if (isExpenseMethod(v)) { d.method = v; setPressed(el); } },
  "delete-purchase": (el) => {
    const removed = removeRecord("PURCHASE", el.dataset.value ?? "");
    if (!removed) return;
    rerender();
    toast(t("Deleted by {name}", { name: user().name }), () => { restoreRecord(removed); rerender(); });
  },
};
