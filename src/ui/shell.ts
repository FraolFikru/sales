/* App frame: sidebar (desktop), compact top bar, bottom tabs (phones). */

import type { ViewId } from "../types";
import { LANGUAGES, getLanguage, t } from "../i18n";
import { TENANTS } from "../seed";
import { payables, isOverdue, state, tenant } from "../store";
import { $, esc, icon, type IconName } from "./dom";

const NAV: readonly { id: ViewId; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "expenses", label: "Expenses", icon: "receipt" },
  { id: "sales", label: "Sales", icon: "sale" },
  { id: "reconcile", label: "Reconcile", icon: "scale" },
];

export const VIEW_IDS: readonly ViewId[] = NAV.map((n) => n.id);

export function renderShell(): void {
  const app = $("#app");
  if (!app) return;
  app.innerHTML = `
    <aside class="sidebar" aria-label="${t("Main navigation")}">
      <div class="brand"><span class="brand-mark" aria-hidden="true">BL</span><span><strong>Bistro Ledger</strong><small>${t("Sales & expenses")}</small></span></div>
      <nav id="sideNav" aria-label="${t("Sections")}"></nav>
      <div class="side-foot">
        <button type="button" class="nav-link" data-action="open-catalog" data-tab="items">${icon("tags")}<span>${t("Items & categories")}</span></button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <span class="top-brand" aria-hidden="true"><span class="brand-mark">BL</span></span>
        <label class="tenant">
          <span class="sr">${t("Business")}</span>
          ${icon("store")}
          <select id="tenantSelect" data-action-change="tenant">${TENANTS.map((x) =>
            `<option value="${x.id}" ${x.id === state.tenantId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
        </label>
        <span class="tenant-meta">${esc(tenant().location)} · ${t("TIN")} ${esc(tenant().tin)}</span>
        <div class="top-actions">
          <div class="seg lang" role="group" aria-label="${t("Language")}">
            ${LANGUAGES.map((l) => `<button type="button" data-action="lang" data-value="${l.code}" lang="${l.code}" title="${l.name}" aria-pressed="${getLanguage() === l.code}">${l.short}</button>`).join("")}
          </div>
          <button type="button" class="btn icon-btn" id="themeBtn" data-action="theme"
            aria-label="${state.theme === "dark" ? t("Switch to light mode") : t("Switch to dark mode")}">${icon(state.theme === "dark" ? "sun" : "moon")}</button>
          <button type="button" class="btn quick" data-action="quick-sale">${icon("plus")}<span>${t("Sale")}</span></button>
          <button type="button" class="btn primary quick" data-action="quick-expense">${icon("plus")}<span>${t("Expense")}</span></button>
        </div>
      </header>
      <main class="view" id="view" tabindex="-1"></main>
    </div>
    <nav class="bottom-nav" id="bottomNav" aria-label="${t("Sections")}"></nav>
    <div id="drawerRoot"></div>`;
  renderNav();
}

export function renderNav(): void {
  const overdue = payables().filter(isOverdue).length;
  const link = (n: (typeof NAV)[number], cls: string): string =>
    `<a href="#${n.id}" class="${cls}" ${state.view === n.id ? 'aria-current="page"' : ""}>${icon(n.icon)}<span>${t(n.label)}</span>${
      n.id === "reconcile" && overdue ? `<span class="count" aria-label="${t("{n} overdue", { n: overdue })}">${overdue}</span>` : ""}</a>`;
  const side = $("#sideNav");
  const bottom = $("#bottomNav");
  if (side) side.innerHTML = NAV.map((n) => link(n, "nav-link")).join("");
  if (bottom) bottom.innerHTML = NAV.map((n) => link(n, "")).join("");
}
