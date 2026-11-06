/* =========================================================
   Ethiopian tax rules used by the UI.
   - VAT: 15% standard rate (VAT Proclamation No. 1341/2024).
   - Withholding on domestic purchases: 3% when a single payment is
     ETB 20,000+ for goods or ETB 10,000+ for services; 30% when the
     supplier gives no TIN and business licence. Applies only when the
     business is a registered withholding agent.
   Rates are configuration, not law: confirm with the Ministry of
   Revenues or your accountant before relying on them.
   ========================================================= */

import type { CatalogItem } from "./types";
import { round2 } from "./format";

export const VAT_RATE = 0.15;

export const WITHHOLDING = {
  rate: 0.03,
  noTinRate: 0.3,
  goodsThreshold: 20_000,
  servicesThreshold: 10_000,
} as const;

/** VAT contained in a VAT-inclusive amount. */
export const vatFromGross = (gross: number): number => round2((gross * VAT_RATE) / (1 + VAT_RATE));

export interface WithholdingResult {
  applies: boolean;
  rate: number;
  amount: number;
  threshold: number;
}

/**
 * Withholding on a vendor payment. Salaries (taxed through PAYE), tax
 * payments and non-cash adjustments are never subject to it.
 */
export function withholdingFor(
  item: Pick<CatalogItem, "kind" | "mainCategory">,
  total: number,
  vendorHasTin: boolean,
  isAgent: boolean,
): WithholdingResult {
  const threshold = item.kind === "SERVICE" ? WITHHOLDING.servicesThreshold : WITHHOLDING.goodsThreshold;
  const exempt = item.kind === "ADJUSTMENT" || item.mainCategory === "LABOR" || item.mainCategory === "TAXES_COMPLIANCE";
  if (!isAgent || exempt || total < threshold) return { applies: false, rate: 0, amount: 0, threshold };
  const rate = vendorHasTin ? WITHHOLDING.rate : WITHHOLDING.noTinRate;
  return { applies: true, rate, amount: round2(total * rate), threshold };
}
