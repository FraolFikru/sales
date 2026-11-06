/* =========================================================
   Catalog auto-complete ranking.
   Matches the item name in every language plus aliases, so staff
   can type "on", "shink" or "ሽን" and land on Onion.
   Tiers: prefix > word prefix > contains > fuzzy > same first letter.
   ========================================================= */

import type { CatalogItem } from "./types";
import { normalize } from "./format";
import { getLanguage, tkAll, tkText } from "./i18n";
import { catalog, ledger, usageCount } from "./store";

export interface MatchHit {
  score: number;
  /** text that matched (shown when it is not the visible name) */
  matched: string;
  /** start index inside `matched`, -1 for fuzzy matches */
  start: number;
}

export interface RankedItem {
  item: CatalogItem;
  hit: MatchHit | null;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isSubsequence = (q: string, s: string): boolean => {
  let i = 0;
  for (const c of s) if (c === q[i]) i++;
  return i === q.length;
};

export function matchText(text: string, q: string): MatchHit | null {
  const n = normalize(text);
  if (!n || !q) return null;
  if (n.startsWith(q)) return { score: 100, matched: text, start: 0 };
  const word = new RegExp(`(^|[\\s\\-/(&])${escapeRe(q)}`).exec(n);
  if (word) return { score: 90, matched: text, start: word.index + word[1].length };
  const i = n.indexOf(q);
  if (i >= 0) return { score: 70, matched: text, start: i };
  if (q.length >= 3 && isSubsequence(q, n.replace(/\s/g, ""))) return { score: 40, matched: text, start: -1 };
  if (q.length <= 3 && n[0] === q[0]) return { score: 20, matched: text, start: -1 };
  return null;
}

export function rankCatalog(query: string, limit = 8): RankedItem[] {
  const q = normalize(query);
  if (!q) return recentItems(6);
  const out: (RankedItem & { score: number })[] = [];
  for (const item of catalog()) {
    let best: MatchHit | null = null;
    const names = tkText(item.nameKey);
    const lang = getLanguage();
    // names in the current language and English rank above the other language; aliases count fully
    const candidates: [string, number][] = names
      ? [[names[lang], 0], [names.en, 0], ...(["en", "am", "om"] as const).filter((l) => l !== lang && l !== "en").map((l) => [names[l], -15] as [string, number])]
      : tkAll(item.nameKey).map((n) => [n, 0] as [string, number]);
    for (const a of item.aliases) candidates.push([a, 0]);
    for (const [text, penalty] of candidates) {
      if (!text) continue;
      const m = matchText(text, q);
      if (m && (!best || m.score + penalty > best.score)) best = { ...m, score: m.score + penalty };
    }
    if (best) out.push({ item, hit: best, score: best.score + Math.min(usageCount(item.id), 10) / 2 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Most recently purchased distinct items, shown before the user types. */
export function recentItems(limit: number): RankedItem[] {
  const seen = new Set<string>();
  const out: RankedItem[] = [];
  const sorted = [...ledger().expenses].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  for (const e of sorted) {
    if (seen.has(e.itemId)) continue;
    seen.add(e.itemId);
    const item = catalog().find((i) => i.id === e.itemId);
    if (item && item.kind !== "ADJUSTMENT") out.push({ item, hit: null });
    if (out.length === limit) break;
  }
  return out;
}

export function rankVendors(query: string, limit = 6): { name: string; hit: MatchHit | null; uses: number }[] {
  const q = normalize(query);
  const uses = new Map<string, number>();
  for (const e of ledger().expenses) if (e.vendor) uses.set(e.vendor, (uses.get(e.vendor) ?? 0) + 1);
  return ledger()
    .vendors.map((name) => ({ name, hit: q ? matchText(name, q) : null, uses: uses.get(name) ?? 0 }))
    .filter((v) => !q || v.hit)
    .sort((a, b) => (b.hit?.score ?? 0) - (a.hit?.score ?? 0) || b.uses - a.uses)
    .slice(0, limit);
}
