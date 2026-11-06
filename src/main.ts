/* =========================================================
   Bistro Ledger — entry point.
   Renders the shell, routes between views, and handles all DOM
   events through delegation (data-action / data-bind attributes),
   so views stay plain render functions.
   ========================================================= */

import "./style.css";
import type { ViewId } from "./types";
import { isLanguage, setLanguage, t } from "./i18n";
import { TENANTS } from "./seed";
import { resetDrafts, savePrefs, state } from "./store";
import { $ } from "./ui/dom";
import { wireApp, type ActionMap } from "./ui/app";
import { VIEW_IDS, renderNav, renderShell } from "./ui/shell";
import { runUndo } from "./ui/toast";
import { closeCatalog, handleDrawerSubmit, isDrawerOpen, openCatalog, setKind, switchTab, trapFocus } from "./ui/catalogDrawer";
import { drawChart, mountOverview, overviewActions, renderOverview, renderTable } from "./views/overview";
import { expenseActions, mountExpenses, onExpenseChange, onExpenseCheck, onExpenseInput, renderExpenses, submitExpense, useNewItem } from "./views/expenses";
import { mountSales, onSaleInput, renderSales, salesActions, submitSale } from "./views/sales";
import { onCountedInput, reconcileActions, renderReconcile } from "./views/reconcile";
import { drafts } from "./store";

/* ---------- rendering ---------- */

const VIEWS: Record<ViewId, { render: () => string; mount?: () => void }> = {
  overview: { render: renderOverview, mount: mountOverview },
  expenses: { render: renderExpenses, mount: mountExpenses },
  sales: { render: renderSales, mount: mountSales },
  reconcile: { render: renderReconcile },
};

function render(focusSelector?: string): void {
  const view = $("#view");
  if (!view) return;
  const def = VIEWS[state.view];
  view.innerHTML = def.render();
  def.mount?.();
  renderNav();
  document.title = `${t(state.view === "overview" ? "Overview" : state.view === "expenses" ? "Expenses" : state.view === "sales" ? "Sales" : "Reconcile")} · Bistro Ledger`;
  if (focusSelector) $<HTMLElement>(focusSelector)?.focus();
}

function navigate(view: ViewId, focusSelector?: string): void {
  const changed = state.view !== view;
  state.view = view;
  state.errors = {};
  if (location.hash.slice(1) !== view) history.replaceState(null, "", `#${view}`);
  render(focusSelector);
  if (changed && !focusSelector) window.scrollTo({ top: 0 });
}

wireApp(render, navigate);

function applyTheme(): void {
  document.documentElement.dataset.theme = state.theme;
}

/** Re-render everything (language or tenant changed), keeping focus on the control used. */
function rebuild(focusSelector?: string): void {
  renderShell();
  render(focusSelector);
}

/* ---------- global actions ---------- */

const shellActions: ActionMap = {
  lang: (el) => {
    const v = el.dataset.value;
    if (!isLanguage(v) || v === state.lang) return;
    state.lang = v;
    setLanguage(v);
    savePrefs();
    rebuild(`[data-action="lang"][data-value="${v}"]`);
  },
  theme: () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    savePrefs();
    rebuild("#themeBtn");
  },
  period: (el) => {
    const v = el.dataset.value;
    if (v !== "today" && v !== "7d" && v !== "30d") return;
    state.period = v;
    render(`[data-action="period"][data-value="${v}"]`);
  },
  "quick-expense": () => navigate("expenses", "#eItem"),
  "quick-sale": () => navigate("sales", "#sAmount"),
  "open-catalog": (el) => {
    const tab = el.dataset.tab === "units" ? "units" : el.dataset.tab === "subs" ? "subs" : "items";
    const fromExpense = state.view === "expenses";
    const prefill = el.dataset.prefill && fromExpense && !drafts.expense.itemId ? drafts.expense.query.trim() : "";
    openCatalog(tab, {
      prefill,
      returnFocus: fromExpense ? "#eItem" : null,
      onItemCreated: el.dataset.prefill && fromExpense ? useNewItem : undefined,
    });
  },
  "close-catalog": () => closeCatalog(),
  "catalog-tab": (el) => switchTab(el.dataset.value ?? ""),
  "ci-kind": (el) => setKind(el),
  undo: () => runUndo(),
  "show-missing": () => {
    state.filter = { kind: "SALE", status: "ALL", category: "ALL", query: "", missingReceipt: true };
    state.tableLimit = 12;
    navigate("overview");
    $("#txTitle")?.scrollIntoView({ block: "start" });
  },
};

const ACTIONS: ActionMap = { ...shellActions, ...overviewActions, ...expenseActions, ...salesActions, ...reconcileActions };

/* ---------- event delegation ---------- */

document.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!el) return;
  const fn = ACTIONS[el.dataset.action ?? ""];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

document.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = (e.target as HTMLFormElement).id;
  if (handleDrawerSubmit(id)) return;
  if (id === "expenseForm") submitExpense();
  else if (id === "saleForm") submitSale();
});

document.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  const bind = el.dataset.bind;
  if (!bind || el.tagName === "SELECT") return;
  const [scope, key] = bind.split(".");
  if (scope === "filter") {
    state.filter.query = el.value;
    state.tableLimit = 12;
    renderTable();
  } else if (scope === "expense") onExpenseInput(key, el.value);
  else if (scope === "sale") onSaleInput(key, el.value);
  else if (scope === "ui" && key === "countedCash") onCountedInput(el.value);
});

document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const changeAction = el.dataset.actionChange;
  if (changeAction === "tenant") {
    if (!TENANTS.some((x) => x.id === el.value)) return;
    state.tenantId = el.value;
    state.payingId = null;
    state.countedCash = "";
    state.filter = { kind: "ALL", status: "ALL", category: "ALL", query: "", missingReceipt: false };
    resetDrafts();
    savePrefs();
    rebuild("#tenantSelect");
    return;
  }
  if (changeAction) { ACTIONS[changeAction]?.(el, e); return; }
  const check = el.dataset.bindCheck;
  if (check && el instanceof HTMLInputElement) {
    const [scope, key] = check.split(".");
    if (scope === "expense") onExpenseCheck(key, el.checked);
    return;
  }
  const bind = el.dataset.bind;
  if (!bind) return;
  const [scope, key] = bind.split(".");
  if (scope === "expense") onExpenseChange(key, el.value);
  else if (scope === "sale") onSaleInput(key, el.value);
});

document.addEventListener("keydown", (e) => {
  if (isDrawerOpen()) {
    if (e.key === "Escape") { e.preventDefault(); closeCatalog(); return; }
    if (e.key === "Tab") trapFocus(e);
  }
});

window.addEventListener("hashchange", () => {
  const v = location.hash.slice(1) as ViewId;
  if (VIEW_IDS.includes(v) && v !== state.view) navigate(v);
});

let resizeTimer = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => { if (state.view === "overview") drawChart(); }, 120);
});

/* ---------- boot ---------- */

setLanguage(state.lang);
applyTheme();
const start = location.hash.slice(1) as ViewId;
state.view = VIEW_IDS.includes(start) ? start : "overview";
renderShell();
render();
