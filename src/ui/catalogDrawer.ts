/* Side drawer (bottom sheet on phones) for adding items, sub-categories
   and units without leaving the expense form. Names can be entered in
   all three languages; missing ones fall back to English. */

import type { CatalogItem, LocalizedText, MainCategory, SupplyKind } from "../types";
import { registerText, t, tk, tkAll } from "../i18n";
import { normalize, parseAmount, round2 } from "../format";
import { MAIN_CATEGORIES, isMainCategory } from "../catalog";
import { newId } from "../seed";
import { catalog, drafts, ledger, state, subsOf, units } from "../store";
import { $, $$, esc, icon } from "./dom";
import { toast } from "./toast";

export type CatalogTab = "items" | "subs" | "units";

interface DrawerState {
  tab: CatalogTab;
  prefill: string;
  returnFocus: string | null;
  onItemCreated: ((item: CatalogItem) => void) | null;
  category: MainCategory | "";
  query: string;
}

let drawer: DrawerState | null = null;

export const isDrawerOpen = (): boolean => drawer !== null;

export function openCatalog(
  tab: CatalogTab,
  opts: { prefill?: string; returnFocus?: string | null; onItemCreated?: (item: CatalogItem) => void } = {},
): void {
  const fromExpense = state.view === "expenses";
  drawer = {
    tab, prefill: opts.prefill ?? "", returnFocus: opts.returnFocus ?? null, onItemCreated: opts.onItemCreated ?? null,
    category: fromExpense ? drafts.expense.category : "", query: "",
  };
  render();
  $<HTMLElement>(tab === "items" ? "#ciName" : tab === "subs" ? "#csName" : "#cuCode")?.focus();
}

export function closeCatalog(): void {
  const back = drawer?.returnFocus;
  drawer = null;
  const root = $("#drawerRoot");
  if (root) root.innerHTML = "";
  document.body.classList.remove("locked");
  if (back) $<HTMLElement>(back)?.focus();
}

const nameFields = (prefix: string, en = ""): string => `
  <div class="field"><label for="${prefix}Name">${t("Name (English)")}</label>
    <input id="${prefix}Name" class="input" value="${esc(en)}" autocomplete="off" aria-describedby="err-${prefix}Name"><p class="err" id="err-${prefix}Name"></p></div>
  <div class="row">
    <div class="field"><label for="${prefix}Am" lang="am">${t("Name in Amharic")} <span class="opt-label">${t("(optional)")}</span></label><input id="${prefix}Am" class="input" lang="am" autocomplete="off"></div>
    <div class="field"><label for="${prefix}Om" lang="om">${t("Name in Afaan Oromoo")} <span class="opt-label">${t("(optional)")}</span></label><input id="${prefix}Om" class="input" lang="om" autocomplete="off"></div>
  </div>`;

const readNames = (prefix: string): LocalizedText => ({
  en: ($<HTMLInputElement>(`#${prefix}Name`)?.value ?? "").trim(),
  am: ($<HTMLInputElement>(`#${prefix}Am`)?.value ?? "").trim(),
  om: ($<HTMLInputElement>(`#${prefix}Om`)?.value ?? "").trim(),
});

function fieldError(id: string, msg: string): boolean {
  const p = $(`#err-${id}`);
  if (p) p.textContent = msg;
  const el = $<HTMLElement>(`#${id}`);
  el?.setAttribute("aria-invalid", msg ? "true" : "false");
  if (msg) el?.focus();
  return Boolean(msg);
}

const categorySelect = (id: string, sel: string): string =>
  `<select id="${id}" class="input" data-drawer-cat aria-describedby="err-${id}"><option value="">${t("Choose…")}</option>${MAIN_CATEGORIES.map((c) =>
    `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(tk(`catShort.${c.id}`))}</option>`).join("")}</select><p class="err" id="err-${id}"></p>`;

const subSelect = (main: MainCategory | "", sel = ""): string =>
  main ? `<option value="">${t("Choose…")}</option>${subsOf(main).map((s) => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${esc(tk(`sub.${s.id}`))}</option>`).join("")}`
    : `<option value="">${t("Pick a category first")}</option>`;

function itemList(): string {
  const q = normalize(drawer?.query ?? "");
  const list = catalog().filter((i) => !q || tkAll(i.nameKey).some((n) => normalize(n).includes(q)) || i.aliases.some((a) => normalize(a).includes(q)));
  return list.slice(0, 80).map((i) => `<li><span><strong>${esc(tk(i.nameKey))}</strong>${i.custom ? ` <span class="tag plain">${t("Custom")}</span>` : ""}
    <small>${esc(tk(`catShort.${i.mainCategory}`))} › ${esc(tk(`sub.${i.subCategory}`))}</small></span><span class="meta">${esc(tk(`unit.${i.defaultUnit}`))}</span></li>`).join("") || `<li class="meta">${t("No items match.")}</li>`;
}

function render(): void {
  const root = $("#drawerRoot");
  if (!root || !drawer) return;
  document.body.classList.add("locked");
  const dr = drawer;
  const tab = (k: CatalogTab, label: string): string =>
    `<button type="button" role="tab" id="ctab-${k}" aria-selected="${dr.tab === k}" aria-pressed="${dr.tab === k}" aria-controls="cpanel" data-action="catalog-tab" data-value="${k}">${label}</button>`;

  let body = "";
  if (dr.tab === "items") {
    const unit = state.view === "expenses" ? drafts.expense.unit : "kg";
    body = `
      <form id="itemForm" novalidate>
        <h3>${t("Add an item or service")}</h3>
        ${nameFields("ci", dr.prefill)}
        <div class="field"><label for="ciAlias">${t("Other search words")} <span class="opt-label">${t("(optional, comma separated)")}</span></label>
          <input id="ciAlias" class="input" autocomplete="off" placeholder="${t("e.g. brand names, local spellings")}"></div>
        <div class="row">
          <div class="field"><label for="ciCat">${t("Category")}</label>${categorySelect("ciCat", dr.category)}</div>
          <div class="field"><label for="ciSub">${t("Sub-category")}</label><select id="ciSub" class="input" aria-describedby="err-ciSub">${subSelect(dr.category, state.view === "expenses" ? drafts.expense.subCategory : "")}</select><p class="err" id="err-ciSub"></p></div>
        </div>
        <div class="row">
          <div class="field"><label for="ciUnit">${t("Default unit")}</label><select id="ciUnit" class="input">${units().map((u) => `<option value="${esc(u.code)}" ${u.code === unit ? "selected" : ""}>${esc(tk(`unit.${u.code}`))}</option>`).join("")}</select></div>
          <div class="field"><label for="ciPrice">${t("Usual price (ETB)")}</label><input id="ciPrice" class="input num-in" inputmode="decimal" placeholder="0.00"></div>
        </div>
        <div class="field"><span class="label" id="ciKindLbl">${t("Type")}</span>
          <div class="seg small wrap" role="radiogroup" aria-labelledby="ciKindLbl" id="ciKind">
            ${([["GOODS", t("Goods")], ["SERVICE", t("Service")], ["ADJUSTMENT", t("Non-cash adjustment")]] as const).map(([k, l], i) =>
              `<button type="button" role="radio" data-action="ci-kind" data-value="${k}" aria-checked="${i === 0}" aria-pressed="${i === 0}">${l}</button>`).join("")}
          </div><p class="hint">${t("Goods and services have different withholding thresholds. Adjustments (waste, comps) move no money.")}</p></div>
        <label class="check"><input type="checkbox" id="ciVat" checked><span>${t("Vendors usually charge VAT on it")}</span></label>
        <button class="btn primary" type="submit">${icon("plus")} ${dr.onItemCreated ? t("Add and use it") : t("Add item")}</button>
      </form>
      <div>
        <label class="search">${icon("search")}<span class="sr">${t("Search the catalog")}</span><input id="catalogSearch" type="search" placeholder="${t("Search {n} items", { n: catalog().length })}" value="${esc(dr.query)}"></label>
        <ul class="item-list" id="catalogList">${itemList()}</ul>
      </div>`;
  } else if (dr.tab === "subs") {
    body = `
      <form id="subForm" novalidate>
        <h3>${t("Add a sub-category")}</h3>
        <div class="field"><label for="csCat">${t("Under category")}</label>${categorySelect("csCat", dr.category)}</div>
        ${nameFields("cs")}
        <button class="btn primary" type="submit">${icon("plus")} ${t("Add sub-category")}</button>
      </form>
      <ul class="tree" aria-label="${t("Category hierarchy")}">${MAIN_CATEGORIES.map((c, i) => `
        <li><strong><i class="dot" style="background:${c.color}"></i>${i + 1}. ${esc(tk(`cat.${c.id}`))}</strong>
          <ul>${subsOf(c.id).map((s) => `<li class="tag plain">${esc(tk(`sub.${s.id}`))}</li>`).join("")}</ul></li>`).join("")}</ul>`;
  } else {
    body = `
      <form id="unitForm" novalidate>
        <h3>${t("Add a unit of measure")}</h3>
        <div class="field"><label for="cuCode">${t("Unit (English)")}</label><input id="cuCode" class="input" autocomplete="off" placeholder="${t("e.g. sacks, trays")}" aria-describedby="err-cuCode"><p class="err" id="err-cuCode"></p></div>
        <div class="row">
          <div class="field"><label for="cuAm" lang="am">${t("Name in Amharic")} <span class="opt-label">${t("(optional)")}</span></label><input id="cuAm" class="input" lang="am"></div>
          <div class="field"><label for="cuOm" lang="om">${t("Name in Afaan Oromoo")} <span class="opt-label">${t("(optional)")}</span></label><input id="cuOm" class="input" lang="om"></div>
        </div>
        <button class="btn primary" type="submit">${icon("plus")} ${t("Add unit")}</button>
      </form>
      <div class="unit-chips">${units().map((u) => `<span class="tag plain">${esc(tk(`unit.${u.code}`))}</span>`).join("")}</div>`;
  }

  root.innerHTML = `
    <div class="scrim" data-action="close-catalog"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle" id="drawer">
      <div class="drawer-head"><h2 id="drawerTitle">${t("Items & categories")}</h2>
        <button type="button" class="btn icon-btn ghost" data-action="close-catalog" aria-label="${t("Close")}">${icon("x")}</button></div>
      <div class="drawer-tabs"><div class="seg small" role="tablist" aria-label="${t("Catalog")}">${tab("items", t("Items"))}${tab("subs", t("Sub-categories"))}${tab("units", t("Units"))}</div></div>
      <div class="drawer-body" role="tabpanel" id="cpanel" aria-labelledby="ctab-${dr.tab}">${body}</div>
    </aside>`;

  $("#catalogSearch")?.addEventListener("input", (e) => {
    if (!drawer) return;
    drawer.query = (e.target as HTMLInputElement).value;
    const list = $("#catalogList");
    if (list) list.innerHTML = itemList();
  });
  $$<HTMLSelectElement>("[data-drawer-cat]").forEach((sel) =>
    sel.addEventListener("change", () => {
      if (!drawer) return;
      drawer.category = isMainCategory(sel.value) ? sel.value : "";
      const sub = $("#ciSub");
      if (sub) sub.innerHTML = subSelect(drawer.category);
    }));
}

/* ---------- submit handlers ---------- */

function selectedKind(): SupplyKind {
  const on = $<HTMLElement>('#ciKind [aria-checked="true"]');
  const v = on?.dataset.value;
  return v === "SERVICE" || v === "ADJUSTMENT" ? v : "GOODS";
}

function submitItem(): void {
  if (!drawer) return;
  const names = readNames("ci");
  const cat = $<HTMLSelectElement>("#ciCat")?.value ?? "";
  const sub = $<HTMLSelectElement>("#ciSub")?.value ?? "";
  ["ciName", "ciCat", "ciSub"].forEach((id) => fieldError(id, ""));
  if (!names.en) return void fieldError("ciName", t("Enter the item name in English."));
  if (catalog().some((i) => normalize(tkAll(i.nameKey)[0]) === normalize(names.en))) return void fieldError("ciName", t("That item already exists. Search for it instead."));
  if (!isMainCategory(cat)) return void fieldError("ciCat", t("Choose a category."));
  if (!sub) return void fieldError("ciSub", t("Choose a sub-category."));
  const key = `custom.${newId("item")}`;
  registerText(key, names);
  const price = parseAmount($<HTMLInputElement>("#ciPrice")?.value ?? "");
  const kind = selectedKind();
  const item: CatalogItem = {
    id: key, nameKey: key, mainCategory: cat, subCategory: sub, defaultUnit: $<HTMLSelectElement>("#ciUnit")?.value ?? "pcs", kind,
    defaultPrice: price > 0 ? round2(price) : 0,
    aliases: ($<HTMLInputElement>("#ciAlias")?.value ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    vatApplicable: kind !== "ADJUSTMENT" && Boolean($<HTMLInputElement>("#ciVat")?.checked), custom: true,
  };
  ledger().customItems.push(item);
  const cb = drawer.onItemCreated;
  if (cb) {
    closeCatalog();
    cb(item);
    return;
  }
  drawer.prefill = "";
  drawer.category = cat;
  render();
  $<HTMLElement>("#ciName")?.focus();
  toast(t("Added {x} to {y}", { x: tk(key), y: tk(`sub.${sub}`) }), () => {
    ledger().customItems = ledger().customItems.filter((i) => i !== item);
    if (drawer) render();
  });
}

function submitSub(): void {
  if (!drawer) return;
  const cat = $<HTMLSelectElement>("#csCat")?.value ?? "";
  const names = readNames("cs");
  ["csCat", "csName"].forEach((id) => fieldError(id, ""));
  if (!isMainCategory(cat)) return void fieldError("csCat", t("Choose a category."));
  if (!names.en) return void fieldError("csName", t("Enter a name in English."));
  if (subsOf(cat).some((s) => normalize(tkAll(`sub.${s.id}`)[0]) === normalize(names.en))) return void fieldError("csName", t("That sub-category already exists."));
  const id = `CUSTOM_${newId("sub")}`;
  registerText(`sub.${id}`, names);
  ledger().customSubCategories.push({ id, mainCategory: cat, name: names });
  drawer.category = cat;
  render();
  $<HTMLElement>("#csName")?.focus();
  toast(t("Added {x} under {y}", { x: tk(`sub.${id}`), y: tk(`catShort.${cat}`) }));
}

function submitUnit(): void {
  if (!drawer) return;
  const code = ($<HTMLInputElement>("#cuCode")?.value ?? "").trim().toLowerCase();
  fieldError("cuCode", "");
  if (!code) return void fieldError("cuCode", t("Enter a unit, e.g. sacks."));
  if (units().some((u) => u.code === code)) return void fieldError("cuCode", t("That unit already exists."));
  const name: LocalizedText = { en: code, am: ($<HTMLInputElement>("#cuAm")?.value ?? "").trim(), om: ($<HTMLInputElement>("#cuOm")?.value ?? "").trim() };
  registerText(`unit.${code}`, name);
  ledger().customUnits.push({ code, name });
  if (state.view === "expenses") drafts.expense.unit = code;
  render();
  $<HTMLElement>("#cuCode")?.focus();
  toast(t("Added unit {x}", { x: tk(`unit.${code}`) }));
}

/** Returns true when the submit belonged to the drawer. */
export function handleDrawerSubmit(formId: string): boolean {
  if (formId === "itemForm") submitItem();
  else if (formId === "subForm") submitSub();
  else if (formId === "unitForm") submitUnit();
  else return false;
  return true;
}

export function switchTab(tab: string): void {
  if (!drawer || (tab !== "items" && tab !== "subs" && tab !== "units")) return;
  drawer.tab = tab;
  render();
  $<HTMLElement>(`#ctab-${tab}`)?.focus();
}

export function setKind(el: HTMLElement): void {
  el.parentElement?.querySelectorAll("button").forEach((b) => {
    b.setAttribute("aria-checked", String(b === el));
    b.setAttribute("aria-pressed", String(b === el));
  });
  const vat = $<HTMLInputElement>("#ciVat");
  if (vat && el.dataset.value === "ADJUSTMENT") vat.checked = false;
}

/** Keep keyboard focus inside the open drawer. */
export function trapFocus(e: KeyboardEvent): void {
  const box = $("#drawer");
  if (!box) return;
  const f = $$<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])", box).filter((x) => !(x as HTMLButtonElement).disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
