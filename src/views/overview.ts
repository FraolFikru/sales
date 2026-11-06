/* Overview: metrics bar, attention banner, cost ratios, trend chart,
   spend by category and the filterable transactions table. */

import type { ChartMode, LedgerEntry, MainCategory, StatusFilter, TxKindFilter } from "../types";
import { t, tk, weekdayName } from "../i18n";
import { addDays, fmtDay, fmtTime, localDay, money, num, parseDay, pct, relDay, today } from "../format";
import { MAIN_CATEGORIES, isMainCategory } from "../catalog";
import { isOverdue, itemById, itemLabel, ledger, ledgerEntries, metrics, payables, rangeFor, spendByCategory, state, taxPosition, tenant } from "../store";
import { $, $$, esc, icon } from "../ui/dom";
import { metricsBar, payName, periodSeg, seg, statusTag } from "../ui/shared";
import type { ActionMap } from "../ui/app";
import { navigate, rerender } from "../ui/app";

/** Benchmarks differ by business: a shop reselling goods has a far higher cost of goods than a kitchen. */
const TARGETS = { RESTAURANT: { cogs: 35, labor: 30 }, RETAIL: { cogs: 75, labor: 15 } } as const;

export function renderOverview(): string {
  const r = rangeFor(state.period);
  const m = metrics(r.start, r.end);
  const overdue = payables().filter(isOverdue);
  const overdueAmt = overdue.reduce((s, e) => s + e.totalAmount, 0);
  const tax = taxPosition();
  const { cogs: COGS_TARGET, labor: LABOR_TARGET } = TARGETS[tenant().type];
  const laborPct = m.totalRevenue ? (m.labor / m.totalRevenue) * 100 : 0;
  const cogsPct = m.totalRevenue ? (m.cogs / m.totalRevenue) * 100 : 0;
  const spend = spendByCategory(r.start, r.end);
  const spendTotal = spend.reduce((s, x) => s + x.amount, 0);

  const ratio = (label: string, value: number, target: number, hint: string): string => {
    const high = value > target;
    return `<div class="ratio ${high ? "high" : ""}">
      <div class="ratio-top"><span>${label}</span><span class="tag ${high ? "overdue" : "paid"}">${high ? t("Above target") : t("On target")}</span></div>
      <strong>${pct(value)}</strong>
      <div class="ratio-track" aria-hidden="true"><i style="width:${Math.min(100, value)}%"></i><b style="left:${target}%"></b></div>
      <small>${hint}</small>
    </div>`;
  };

  return `
    <div class="page-head"><div><h1>${t("Overview")}</h1><p>${r.days === 1 ? fmtDay(r.end) : `${fmtDay(r.start)} – ${fmtDay(r.end)}`} · ${esc(tenant().name)}</p></div>${periodSeg()}</div>
    ${metricsBar()}
    ${overdue.length ? `
    <div class="attention" role="status">${icon("alert")}
      <p><strong>${t("{n} payments overdue", { n: overdue.length })}</strong> · ${t("{x} owed past the due date. Pay these first.", { x: money(overdueAmt, 0) })}</p>
      <a class="btn small" href="#reconcile">${t("Review payables")} ${icon("arrow")}</a>
    </div>` : ""}

    <section class="ratios" aria-label="${t("Cost ratios")}">
      ${ratio(tenant().type === "RETAIL" ? t("Cost of goods sold") : t("Food & inventory cost"), cogsPct, COGS_TARGET, t("{x} · target ≤ {y}%", { x: money(m.cogs, 0), y: COGS_TARGET }))}
      ${ratio(t("Labor-to-sales ratio"), laborPct, LABOR_TARGET, t("{x} · target ≤ {y}%", { x: money(m.labor, 0), y: LABOR_TARGET }))}
      <div class="ratio">
        <div class="ratio-top"><span>${t("Waste & shrinkage")}</span></div>
        <strong>${money(m.waste, 0)}</strong>
        <small>${m.totalRevenue ? t("{x} of revenue", { x: pct((m.waste / m.totalRevenue) * 100) }) : "—"}</small>
      </div>
      <div class="ratio">
        <div class="ratio-top"><span>${t("VAT payable this month")}</span>${icon("shield")}</div>
        <strong>${money(tax.vatPayable, 0)}</strong>
        <small>${t("Output {x} − input {y}", { x: money(tax.vatOutput, 0), y: money(tax.vatInput, 0) })}</small>
      </div>
    </section>

    <div class="two-col wide-left">
      <section class="card" aria-labelledby="chartTitle">
        <div class="card-head">
          <div><h2 id="chartTitle">${t("Sales vs expenses")}</h2><p>${state.chart === "daily" ? t("Last 14 days") : t("Last 8 weeks")} · ${t("excl. VAT")}</p></div>
          <div class="head-tools">
            <div class="legend" aria-hidden="true"><span><i class="sw-sale"></i>${t("Sales")}</span><span><i class="sw-exp"></i>${t("Expenses")}</span></div>
            ${seg("chart", state.chart, [["daily", t("Daily")], ["weekly", t("Weekly")]], t("Chart range"), "small")}
          </div>
        </div>
        <div class="chart-wrap" id="chartWrap"><svg id="chart" role="img"></svg><div class="tip" id="tip" hidden></div></div>
      </section>
      <section class="card" aria-labelledby="spendTitle">
        <div class="card-head"><div><h2 id="spendTitle">${t("Spend by category")}</h2><p>${t("{x} total, excl. VAT", { x: money(spendTotal, 0) })}</p></div></div>
        ${spend.length ? `<div class="bar-list">${spend.map((s) => `
          <button type="button" class="bar-row" data-action="filter-cat" data-value="${s.id}" title="${t("Show these transactions")}">
            <span><i class="dot" style="background:${MAIN_CATEGORIES.find((c) => c.id === s.id)?.color}"></i>${esc(tk(`catShort.${s.id}`))}</span>
            <span class="num">${money(s.amount, 0)}</span>
            <span class="bar-track"><i style="width:${(s.amount / spendTotal) * 100}%;background:${MAIN_CATEGORIES.find((c) => c.id === s.id)?.color}"></i></span>
          </button>`).join("")}</div>` : `<div class="empty"><strong>${t("No expenses in this period")}</strong></div>`}
      </section>
    </div>

    <section class="card" aria-labelledby="txTitle">
      <div class="card-head"><div><h2 id="txTitle">${t("Recent transactions")}</h2><p>${t("Sales and expenses, newest first")}</p></div></div>
      <div class="table-tools">
        <label class="search">${icon("search")}<span class="sr">${t("Search transactions")}</span>
          <input id="txSearch" type="search" autocomplete="off" placeholder="${t("Search item, vendor, customer, receipt no.")}" value="${esc(state.filter.query)}" data-bind="filter.query"></label>
        ${seg("f-kind", state.filter.kind, [["ALL", t("All")], ["SALE", t("Sales")], ["EXPENSE", t("Expenses")]], t("Type"), "small")}
        ${seg("f-status", state.filter.status, [["ALL", t("Any status")], ["PAID", t("Paid")], ["PENDING", t("Pending")]], t("Status"), "small")}
        <label class="select-sm"><span class="sr">${t("Category")}</span>
          <select id="fCategory" data-action-change="f-category" class="input">
            <option value="ALL">${t("All categories")}</option>
            ${MAIN_CATEGORIES.map((c) => `<option value="${c.id}" ${state.filter.category === c.id ? "selected" : ""}>${esc(tk(`catShort.${c.id}`))}</option>`).join("")}
          </select></label>
      </div>
      ${state.filter.missingReceipt ? `<p class="filter-chip">${t("Showing sales without a fiscal receipt number")} <button type="button" class="link-btn" data-action="clear-filters">${icon("x")} ${t("Clear")}</button></p>` : ""}
      <div id="txTable"></div>
    </section>`;
}

/* ---------- table ---------- */

function entryRow(e: LedgerEntry): string {
  if (e.kind === "SALE") {
    const s = e.record;
    const day = localDay(s.timestamp);
    return `<tr>
      <td class="c-date">${relDay(day)}<small>${fmtTime(s.timestamp)}</small></td>
      <td class="c-desc"><strong>${esc(tk(`channel.${s.channelId}`))}</strong><small>${s.customer ? esc(s.customer) : s.fiscalReceiptNo ? esc(s.fiscalReceiptNo) : `<span class="warn-text">${t("No fiscal receipt no.")}</span>`}</small></td>
      <td class="c-cat"><span class="tag sale plain">${t("Sale")}</span></td>
      <td class="c-pay">${s.paymentMethod ? esc(payName(s.paymentMethod)) : t("On credit")}</td>
      <td class="c-amt num in">+${money(s.totalAmount)}</td>
      <td class="c-status">${statusTag(s)}</td>
      <td class="c-act">${s.status === "PENDING" ? `<button type="button" class="btn small" data-action="go-pay" data-id="${s.id}">${t("Mark received")}</button>` : ""}</td>
    </tr>`;
  }
  const x = e.record;
  const day = localDay(x.timestamp);
  const adj = itemById(x.itemId)?.kind === "ADJUSTMENT";
  return `<tr>
    <td class="c-date">${relDay(day)}<small>${fmtTime(x.timestamp)}</small></td>
    <td class="c-desc"><strong>${esc(itemLabel(x))}</strong><small>${num(x.quantity)} ${esc(tk(`unit.${x.unit}`))} × ${money(x.unitPrice)}${x.vendor ? ` · ${esc(x.vendor)}` : ""}</small></td>
    <td class="c-cat"><i class="dot" style="background:${MAIN_CATEGORIES.find((c) => c.id === x.category)?.color}"></i>${esc(tk(`catShort.${x.category}`))}<small>${esc(tk(`sub.${x.subCategory}`))}</small></td>
    <td class="c-pay">${adj ? "—" : x.paymentMethod ? esc(payName(x.paymentMethod)) : x.dueDate ? t("Due {d}", { d: fmtDay(x.dueDate) }) : "—"}</td>
    <td class="c-amt num">−${money(x.totalAmount)}</td>
    <td class="c-status">${statusTag(x, adj)}</td>
    <td class="c-act">${x.status === "PENDING" ? `<button type="button" class="btn small" data-action="go-pay" data-id="${x.id}">${t("Mark paid")}</button>` : ""}</td>
  </tr>`;
}

export function renderTable(): void {
  const box = $("#txTable");
  if (!box) return;
  const rows = ledgerEntries(state.filter);
  const shown = rows.slice(0, state.tableLimit);
  if (!rows.length) {
    box.innerHTML = `<div class="empty"><strong>${t("No transactions match")}</strong>${t("Try another search or clear the filters.")}
      <div><button type="button" class="btn small" data-action="clear-filters">${t("Clear filters")}</button></div></div>`;
    return;
  }
  box.innerHTML = `
    <div class="table-scroll"><table class="tx-table">
      <thead><tr><th>${t("Date")}</th><th>${t("Description")}</th><th>${t("Category")}</th><th>${t("Payment")}</th><th class="num">${t("Amount")}</th><th>${t("Status")}</th><th><span class="sr">${t("Actions")}</span></th></tr></thead>
      <tbody>${shown.map(entryRow).join("")}</tbody>
    </table></div>
    <div class="table-foot"><span>${t("Showing {x} of {y}", { x: shown.length, y: rows.length })}</span>
      ${rows.length > shown.length ? `<button type="button" class="btn small" data-action="more">${t("Show more")}</button>` : ""}</div>`;
}

/* ---------- chart ---------- */

interface Point { label: string; sub: string; title: string; sale: number; spend: number; current: boolean }

function series(mode: ChartMode): Point[] {
  const byDay = new Map<string, { sale: number; spend: number }>();
  const l = ledger();
  const bump = (d: string, k: "sale" | "spend", v: number): void => {
    const e = byDay.get(d) ?? { sale: 0, spend: 0 };
    e[k] += v;
    byDay.set(d, e);
  };
  for (const s of l.sales) bump(localDay(s.timestamp), "sale", s.totalAmount - s.vatAmount);
  for (const e of l.expenses) bump(localDay(e.timestamp), "spend", e.totalAmount - e.vatAmount);
  const get = (d: string): { sale: number; spend: number } => byDay.get(d) ?? { sale: 0, spend: 0 };
  const now = today();
  if (mode === "daily") {
    return Array.from({ length: 14 }, (_, i) => {
      const d = addDays(now, i - 13);
      const v = get(d);
      const wd = weekdayName(parseDay(d).getDay());
      return { label: wd, sub: String(parseDay(d).getDate()), title: `${wd}, ${fmtDay(d)}${d === now ? ` · ${t("so far")}` : ""}`, ...v, current: d === now };
    });
  }
  return Array.from({ length: 8 }, (_, i) => {
    const end = addDays(now, -7 * (7 - i));
    const start = addDays(end, -6);
    let sale = 0, spend = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) { const v = get(d); sale += v.sale; spend += v.spend; }
    return { label: fmtDay(start), sub: "", title: `${fmtDay(start)} – ${fmtDay(end)}`, sale, spend, current: i === 7 };
  });
}

const niceMax = (v: number): number => {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
};
const kfmt = (v: number): string => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v));

export function drawChart(): void {
  const wrap = $("#chartWrap");
  const svg = $<SVGSVGElement>("#chart");
  const tip = $("#tip");
  if (!wrap || !svg || !tip) return;
  const pts = series(state.chart);
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  const pad = { t: 10, r: 4, b: pts[0].sub ? 38 : 24, l: 44 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(...pts.flatMap((p) => [p.sale, p.spend])) * 1.08);
  const y = (v: number): number => pad.t + ih - (v / max) * ih;
  const slot = iw / pts.length;
  const bw = Math.max(3, Math.min(14, slot * 0.3));
  const narrow = W < 460;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("aria-label", t("Sales {x} and expenses {y} in this chart", {
    x: money(pts.reduce((s, p) => s + p.sale, 0), 0), y: money(pts.reduce((s, p) => s + p.spend, 0), 0) }));

  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    const yy = y(v);
    g += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"${i ? ' stroke-dasharray="3 4"' : ""}/>`;
    g += `<text class="axis" x="${pad.l - 8}" y="${yy + 4}" text-anchor="end">${kfmt(v)}</text>`;
  }
  pts.forEach((p, i) => {
    const cx = pad.l + slot * i + slot / 2;
    g += `<rect class="hit" data-i="${i}" tabindex="0" aria-label="${esc(p.title)}: ${t("Sales")} ${money(p.sale, 0)}, ${t("Expenses")} ${money(p.spend, 0)}" x="${pad.l + slot * i + 1}" y="${pad.t}" width="${Math.max(0, slot - 2)}" height="${ih}" rx="6"/>`;
    g += `<rect class="b-sale" x="${cx - bw - 1}" y="${y(p.sale)}" width="${bw}" height="${Math.max(0, pad.t + ih - y(p.sale))}" rx="2" pointer-events="none"/>`;
    g += `<rect class="b-exp" x="${cx + 1}" y="${y(p.spend)}" width="${bw}" height="${Math.max(0, pad.t + ih - y(p.spend))}" rx="2" pointer-events="none"/>`;
    if (!narrow || i % 2 === (pts.length - 1) % 2) {
      g += `<text class="axis${p.current ? " cur" : ""}" x="${cx}" y="${H - (p.sub ? 21 : 7)}" text-anchor="middle">${esc(p.label)}</text>`;
      if (p.sub) g += `<text class="axis${p.current ? " cur" : ""}" x="${cx}" y="${H - 6}" text-anchor="middle">${esc(p.sub)}</text>`;
    }
  });
  svg.innerHTML = g;

  const show = (i: number, el: SVGRectElement): void => {
    const p = pts[i];
    const net = p.sale - p.spend;
    tip.innerHTML = `<strong>${esc(p.title)}</strong>
      <div><span>${t("Sales")}</span><b>${money(p.sale, 0)}</b></div>
      <div><span>${t("Expenses")}</span><b>${money(p.spend, 0)}</b></div>
      <div><span>${t("Net")}</span><b class="${net >= 0 ? "pos" : "neg"}">${net < 0 ? "−" : ""}${money(net, 0)}</b></div>`;
    tip.hidden = false;
    const cx = pad.l + slot * i + slot / 2;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, cx + 14 + tw > W ? cx - tw - 14 : cx + 14)}px`;
    tip.style.top = `${Math.max(0, Math.min(y(Math.max(p.sale, p.spend)) - 16, H - tip.offsetHeight - pad.b))}px`;
    $$<SVGRectElement>(".hit", svg).forEach((h) => h.classList.toggle("on", h === el));
  };
  const hide = (): void => {
    tip.hidden = true;
    $$<SVGRectElement>(".hit", svg).forEach((h) => h.classList.remove("on"));
  };
  $$<SVGRectElement>(".hit", svg).forEach((h) => {
    const i = Number(h.dataset.i);
    h.addEventListener("pointerenter", () => show(i, h));
    h.addEventListener("focus", () => show(i, h));
    h.addEventListener("blur", hide);
  });
  svg.addEventListener("pointerleave", hide);
}

export function mountOverview(): void {
  renderTable();
  drawChart();
}

/* ---------- actions ---------- */

const syncSeg = (action: string, value: string): void =>
  $$(`[data-action="${action}"]`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));

export const overviewActions: ActionMap = {
  chart: (el) => { state.chart = el.dataset.value === "weekly" ? "weekly" : "daily"; rerender(`[data-action="chart"][data-value="${state.chart}"]`); },
  "f-kind": (el) => { state.filter.kind = (el.dataset.value ?? "ALL") as TxKindFilter; state.tableLimit = 12; syncSeg("f-kind", state.filter.kind); renderTable(); },
  "f-status": (el) => { state.filter.status = (el.dataset.value ?? "ALL") as StatusFilter; state.tableLimit = 12; syncSeg("f-status", state.filter.status); renderTable(); },
  "f-category": (el) => {
    const v = (el as HTMLSelectElement).value;
    state.filter.category = isMainCategory(v) ? v : "ALL";
    if (state.filter.category !== "ALL") { state.filter.kind = "EXPENSE"; syncSeg("f-kind", "EXPENSE"); }
    state.tableLimit = 12;
    renderTable();
  },
  "filter-cat": (el) => {
    const v = el.dataset.value ?? "";
    if (!isMainCategory(v)) return;
    state.filter = { ...state.filter, kind: "EXPENSE", category: v as MainCategory, missingReceipt: false };
    state.tableLimit = 12;
    rerender("#txSearch");
    $("#txTitle")?.scrollIntoView({ behavior: "smooth", block: "start" });
  },
  "clear-filters": () => { state.filter = { kind: "ALL", status: "ALL", category: "ALL", query: "", missingReceipt: false }; state.tableLimit = 12; rerender("#txSearch"); },
  more: () => { state.tableLimit += 12; renderTable(); },
  "go-pay": (el) => {
    state.payingId = el.dataset.id ?? null;
    state.payMethod = "CASH";
    navigate("reconcile", `#row-${el.dataset.id} [data-action="pay-confirm"]`);
  },
};
