# Bistro Ledger

Multi-tenant sales & expense management UI for Ethiopian restaurants and shops.
Vite + strict TypeScript, no UI framework, no runtime dependencies.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

## What it does

| Screen | Highlights |
|---|---|
| **Overview** | Live metric cards (Total Revenue, Total Expense, Total Balance, Profit Margin %) with change vs the previous period; cost ratios (COGS %, labor-to-sales %, waste, VAT payable); sales vs expenses chart (daily / weekly); spend by the 8 master categories; filterable transactions table. |
| **Expenses** | Auto-complete across the whole catalog in all three languages (typing `on` → *Onion – Raw Ingredients*, *On-site Ad Signage – Advertising*); Category → Sub-category → Item cascade; quantity, unit, unit price and a two-way total; 15% VAT toggle; automatic withholding-tax check; six payment sources (Cash, Telebirr, CBE Birr, M-Pesa, Corporate Card, Petty Cash) with live balances; pay-later with due date; non-cash adjustments for waste and comps. |
| **Sales** | Sales channels per business, VAT-inclusive amount with live net/VAT split, fiscal receipt number (auto-filled), credit invoices with customer TIN. |
| **Reconcile** | To-pay list (overdue first) and customers-owe-you list with one-step "mark paid"; balances per payment source; end-of-day cash drawer with over/short; month's VAT and withholding position; sales missing a fiscal receipt number. |
| **Items & categories** | Drawer to add items (names in EN / AM / OM, search aliases, goods / service / adjustment), sub-categories and units without leaving the form. |

Language (EN · አማ · OM), theme (dark default, light) and business are switched from the top bar and remembered in the browser.

## Project structure

```
src/
  types.ts          domain types (spec types + extensions)
  catalog.ts        8 main categories, 41 sub-categories, ~95 items, payment sources, units, channels
  i18n.ts           t() for UI text, tk() for catalog names, calendar names
  locales.ts        Amharic + Afaan Oromoo UI strings (keys are the English text)
  tax.ts            VAT 15%, withholding 3% / 30% and thresholds
  format.ts         dates (local yyyy-mm-dd), money (ETB), parsing
  seed.ts           two sample tenants + 10 weeks of generated history
  store.ts          state, drafts, selectors (metrics, balances, tax), mutations
  search.ts         multilingual auto-complete ranking
  ui/               dom helpers, combobox, shell, shared widgets, drawer, toast
  views/            overview, expenses, sales, reconcile
  main.ts           routing + delegated events
  style.css         design tokens and layout
```

Events are delegated: elements declare `data-action="…"` (clicks), `data-bind="scope.key"` (inputs) and
`data-action-change="…"` (selects); each view exports its action map.

## Tax rules (configurable in `src/tax.ts`)

- VAT 15% standard rate.
- Withholding on supplier payments: 3% when a single payment is ETB 20,000+ for goods or ETB 10,000+ for
  services; 30% when the supplier gives no TIN and business licence. Applied only when the tenant is a
  registered withholding agent; never to salaries (PAYE) or tax payments.

These were checked against current published guidance in November 2026. Confirm with the Ministry of
Revenues or your accountant before relying on them for filing.

## Data

Records are kept in memory and regenerate on reload (sample data is relative to today's date).
To persist, replace the `ledgers` map in `store.ts` with an API- or database-backed repository;
everything else reads through the store functions.

## Translations

All UI strings, categories, sub-categories, items, units and payment sources are translated into Amharic and
Afaan Oromoo. Have a native speaker review them before production use. Names that users add can be entered in
all three languages; missing ones fall back to English.
