/* =========================================================
   Domain types for Bistro Ledger.
   The first block matches the specification exactly; the rest
   extends it for multi-tenant, tax and reconciliation features.
   ========================================================= */

export type SupportedLanguage = "en" | "am" | "om";

export type MainCategory =
  | "COGS"
  | "LABOR"
  | "FACILITIES"
  | "REVENUE_OPERATIONS"
  | "PRICING_MARGINS"
  | "TAXES_COMPLIANCE"
  | "TECH_INFRASTRUCTURE"
  | "MARKETING_GROWTH";

export type PaymentMethod = "CASH" | "TELEBIRR" | "CBE_BIRR" | "M_PESA" | "CARD" | "PETTY_CASH";

export interface CatalogItem {
  id: string;
  /** translation key, resolved with tk() */
  nameKey: string;
  mainCategory: MainCategory;
  subCategory: string;
  defaultUnit: string;
  /** decides the withholding threshold (goods vs services); adjustments are non-cash */
  kind: SupplyKind;
  defaultPrice: number;
  /** extra search terms, e.g. Amharic transliterations or brand names */
  aliases: readonly string[];
  /** vendor normally charges 15% VAT on this item */
  vatApplicable: boolean;
  /** true when added by the business rather than shipped with the catalog */
  custom?: boolean;
}

export interface ExpenseRecord {
  id: string;
  itemId: string;
  /** translation key of the item name (resolve with tk()); user-added items register their own key */
  itemName: string;
  category: MainCategory;
  subCategory: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
  /**
   * How the expense was settled. `null` while the bill is still unpaid,
   * and for non-cash adjustments such as waste or comps.
   */
  paymentMethod: PaymentMethod | null;
  /** ISO 8601 */
  timestamp: string;

  tenantId: string;
  vendor: string;
  status: SettlementStatus;
  dueDate: string | null; // yyyy-mm-dd
  paidAt: string | null; // ISO 8601
  /** input VAT included in totalAmount */
  vatAmount: number;
  /** income tax withheld from the vendor payment (owed to the Ministry of Revenues) */
  withholdingAmount: number;
  withholdingRate: number;
  note: string;
}

export interface FinancialSummary {
  totalRevenue: number;
  totalExpense: number;
  totalBalance: number;
  profitMargin: number;
}

/* ---------- extensions ---------- */

export type SupplyKind = "GOODS" | "SERVICE" | "ADJUSTMENT";
export type SettlementStatus = "PAID" | "PENDING";
export type ThemeMode = "dark" | "light";
export type ViewId = "overview" | "expenses" | "sales" | "reconcile";
export type PeriodId = "today" | "7d" | "30d";
export type ChartMode = "daily" | "weekly";
export type BusinessType = "RESTAURANT" | "RETAIL";
export type CostGroup = "COGS" | "LABOR" | "OPEX";

export interface LocalizedText {
  en: string;
  am: string;
  om: string;
}

export interface MainCategoryDef {
  id: MainCategory;
  name: LocalizedText;
  shortName: LocalizedText;
  group: CostGroup;
  /** chart / dot colour */
  color: string;
}

export interface SubCategoryDef {
  id: string;
  mainCategory: MainCategory;
  name: LocalizedText;
}

export interface PaymentMethodDef {
  id: PaymentMethod;
  name: LocalizedText;
  hint: LocalizedText;
  /** can customers pay you this way? (petty cash is spend-only) */
  acceptsSales: boolean;
}

export interface UnitDef {
  code: string;
  name: LocalizedText;
}

export interface SalesChannel {
  id: string;
  name: LocalizedText;
  /** usually invoiced to a business customer */
  b2b: boolean;
}

export interface SaleRecord {
  id: string;
  tenantId: string;
  channelId: string;
  /** VAT-inclusive amount the customer paid or owes */
  totalAmount: number;
  /** output VAT included in totalAmount */
  vatAmount: number;
  /** `null` while unpaid (credit sale) */
  paymentMethod: PaymentMethod | null;
  status: SettlementStatus;
  timestamp: string;
  paidAt: string | null;
  customer: string;
  customerTin: string;
  fiscalReceiptNo: string;
  dueDate: string | null;
  reference: string;
}

export interface Tenant {
  id: string;
  name: string;
  type: BusinessType;
  location: string;
  tin: string;
  vatRegistered: boolean;
  /** registered withholding agent: must withhold income tax on qualifying vendor payments */
  withholdingAgent: boolean;
  openingBalances: Readonly<Record<PaymentMethod, number>>;
  /** float left in the cash drawer each morning */
  cashFloat: number;
  salesChannels: readonly string[];
}

export interface RegisterClose {
  id: string;
  tenantId: string;
  date: string; // yyyy-mm-dd
  expected: number;
  counted: number;
  difference: number;
  closedAt: string;
}

export interface TenantLedger {
  expenses: ExpenseRecord[];
  sales: SaleRecord[];
  registerCloses: RegisterClose[];
  vendors: string[];
  customItems: CatalogItem[];
  customSubCategories: SubCategoryDef[];
  customUnits: UnitDef[];
  nextFiscalNo: number;
}

/** Metrics for a date range; extends the spec summary with the figures behind it. */
export interface PeriodMetrics extends FinancialSummary {
  /** VAT-inclusive sales */
  grossSales: number;
  vatOutput: number;
  vatInput: number;
  cogs: number;
  labor: number;
  waste: number;
  netProfit: number;
  unpaidExpense: number;
  receivables: number;
}

export interface TaxPosition {
  vatOutput: number;
  vatInput: number;
  vatPayable: number;
  withholdingToRemit: number;
  salesMissingReceipt: number;
}

export type TxKindFilter = "ALL" | "SALE" | "EXPENSE";
export type StatusFilter = "ALL" | "PAID" | "PENDING";

export interface LedgerFilter {
  kind: TxKindFilter;
  status: StatusFilter;
  category: MainCategory | "ALL";
  query: string;
  /** only sales without a fiscal receipt number */
  missingReceipt: boolean;
}

/** A row in the combined transactions table. */
export type LedgerEntry =
  | { kind: "SALE"; record: SaleRecord }
  | { kind: "EXPENSE"; record: ExpenseRecord };

export interface ExpenseDraft {
  query: string;
  itemId: string | null;
  category: MainCategory | "";
  subCategory: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  total: string;
  lastEdited: "price" | "total";
  vendor: string;
  date: string;
  settle: "PAID" | "LATER";
  paymentMethod: PaymentMethod;
  dueDate: string;
  vatIncluded: boolean;
  vendorHasTin: boolean;
  note: string;
}

export interface SaleDraft {
  channelId: string;
  amount: string;
  date: string;
  settle: "PAID" | "CREDIT";
  paymentMethod: PaymentMethod;
  customer: string;
  customerTin: string;
  dueDate: string;
  fiscalReceiptNo: string;
  reference: string;
}

export type FieldErrors = Partial<Record<string, string>>;
