/* =========================================================
   Master taxonomy: 8 main categories → sub-categories → items.
   Every name is a LocalizedText registered under its key so the
   whole catalog re-renders when the language changes.
   ========================================================= */

import type {
  CatalogItem,
  LocalizedText,
  MainCategory,
  MainCategoryDef,
  PaymentMethod,
  PaymentMethodDef,
  SalesChannel,
  SubCategoryDef,
  SupplyKind,
  UnitDef,
} from "./types";
import { registerText } from "./i18n";

const L = (en: string, am: string, om: string): LocalizedText => ({ en, am, om });

/* ---------- main categories ---------- */

export const MAIN_CATEGORIES: readonly MainCategoryDef[] = [
  { id: "COGS", group: "COGS", color: "#5bd18b",
    name: L("Direct Material & Inventory Costs (COGS)", "ቀጥተኛ የግብዓት እና የክምችት ወጪዎች (COGS)", "Baasii Galtee Kallattii fi Kuusaa (COGS)"),
    shortName: L("Inventory & COGS", "ክምችት እና COGS", "Kuusaa fi COGS") },
  { id: "LABOR", group: "LABOR", color: "#7aa2f7",
    name: L("Labor, Payroll & Sales Compensation", "የሰራተኛ፣ የደመወዝ እና የሽያጭ ክፍያ", "Hojjettoota, Mindaa fi Kaffaltii Gurgurtaa"),
    shortName: L("Labor & Payroll", "ሰራተኛ እና ደመወዝ", "Hojjettoota fi Mindaa") },
  { id: "FACILITIES", group: "OPEX", color: "#4fc6b7",
    name: L("Facility Operations, Hygiene & Cleaning", "የተቋም ስራ፣ ንጽህና እና ጽዳት", "Hojii Dhaabbataa, Qulqullina fi Qulqulleessuu"),
    shortName: L("Facilities", "ተቋም", "Dhaabbata") },
  { id: "REVENUE_OPERATIONS", group: "OPEX", color: "#c9a0f2",
    name: L("Revenue, Cash Flow & Billing Operations", "ገቢ፣ የገንዘብ ፍሰት እና የሂሳብ ስራዎች", "Galii, Sochii Maallaqaa fi Hojii Herregaa"),
    shortName: L("Revenue Ops", "የገቢ ስራዎች", "Hojii Galii") },
  { id: "PRICING_MARGINS", group: "OPEX", color: "#f0857a",
    name: L("Pricing, Margins & Profitability Control", "ዋጋ፣ የትርፍ ህዳግ እና ትርፋማነት ቁጥጥር", "To'annoo Gatii, Bu'aa fi Bu'aa Qabeessummaa"),
    shortName: L("Pricing & Margins", "ዋጋ እና ህዳግ", "Gatii fi Bu'aa") },
  { id: "TAXES_COMPLIANCE", group: "OPEX", color: "#e9a6c8",
    name: L("Taxes, Regulatory & Compliance Fees", "ግብር፣ የቁጥጥር እና የተገዢነት ክፍያዎች", "Gibira, Kaffaltii Seeraa fi Hordoffii"),
    shortName: L("Taxes & Compliance", "ግብር እና ተገዢነት", "Gibira fi Hordoffii") },
  { id: "TECH_INFRASTRUCTURE", group: "OPEX", color: "#8fd3f4",
    name: L("Sales Technology, Software & Infrastructure", "የሽያጭ ቴክኖሎጂ፣ ሶፍትዌር እና መሠረተ ልማት", "Teeknooloojii Gurgurtaa, Sooftiweerii fi Bu'uuraalee"),
    shortName: L("Technology", "ቴክኖሎጂ", "Teeknooloojii") },
  { id: "MARKETING_GROWTH", group: "OPEX", color: "#f2c48d",
    name: L("Marketing, Customer Acquisition & Growth", "ግብይት፣ ደንበኛ ማፍራት እና እድገት", "Gabaa, Maamila Horachuu fi Guddina"),
    shortName: L("Marketing", "ግብይት", "Gabaa") },
];

/* ---------- sub-categories ---------- */

const S = (id: string, mainCategory: MainCategory, name: LocalizedText): SubCategoryDef => ({ id, mainCategory, name });

export const SUB_CATEGORIES: readonly SubCategoryDef[] = [
  // 1. COGS
  S("COGS_FOOD", "COGS", L("Raw Ingredients & Food Stock", "ጥሬ የምግብ ግብዓቶች", "Galtee Nyaataa Dheedhii")),
  S("COGS_BEV", "COGS", L("Beverage & Bar Inventory", "የመጠጥ እና የባር ክምችት", "Kuusaa Dhugaatii fi Baarii")),
  S("COGS_PACK", "COGS", L("Packaging & Takeout Disposables", "ማሸጊያ እና የመውሰጃ ዕቃዎች", "Qabiyyee fi Meeshaalee Fudhatamu")),
  S("COGS_CONS", "COGS", L("Kitchen Consumables", "የወጥ ቤት ፍጆታ ዕቃዎች", "Meeshaalee Fayyadama Kushinaa")),
  S("COGS_WASTE", "COGS", L("Waste & Shrinkage", "ብክነት እና ጉድለት", "Badiinsa fi Hir'ina")),
  // 2. Labor
  S("LAB_SALARY", "LABOR", L("Base Salaries & Fixed Wages", "መሰረታዊ ደመወዝ", "Mindaa Bu'uuraa fi Dhaabbataa")),
  S("LAB_HOURLY", "LABOR", L("Hourly Wages & Overtime", "የሰዓት ክፍያ እና ትርፍ ሰዓት", "Kaffaltii Sa'aatii fi Yeroo Dabalataa")),
  S("LAB_COMM", "LABOR", L("Commissions & Quota Payouts", "ኮሚሽን እና የኮታ ክፍያ", "Komishinii fi Kaffaltii Kootaa")),
  S("LAB_SPIFF", "LABOR", L("Spiffs & Short-Term Incentives", "የአጭር ጊዜ ማበረታቻዎች", "Jajjabeessituu Yeroo Gabaabaa")),
  S("LAB_TIPS", "LABOR", L("Tips, Gratuities & Service Charges", "ጉርሻ እና የአገልግሎት ክፍያ", "Tippii fi Kaffaltii Tajaajilaa")),
  S("LAB_DEDUCT", "LABOR", L("Payroll Deductions & Statutory Withholdings", "የደመወዝ ተቀናሾች እና የሕግ ግዴታዎች", "Hir'isa Mindaa fi Gibira Seeraan Qabamu")),
  S("LAB_ADVANCE", "LABOR", L("Draw Accounts & Advances", "ቅድመ ክፍያ እና ብድር", "Kaffaltii Duraa fi Liqaa")),
  S("LAB_CLAWBACK", "LABOR", L("Clawbacks", "የተመላሽ ክፍያዎች", "Deebii Kaffaltii")),
  // 3. Facilities
  S("FAC_CLEAN", "FACILITIES", L("Cleaning & Sanitation Supplies", "የጽዳት እና የንጽህና ዕቃዎች", "Meeshaalee Qulqullinaa")),
  S("FAC_JANITOR", "FACILITIES", L("Janitorial Staff & Contractors", "የጽዳት ሰራተኞች እና ተቋራጮች", "Hojjettoota fi Kontiraaktaroota Qulqullinaa")),
  S("FAC_UTIL", "FACILITIES", L("Utilities", "መገልገያዎች", "Tajaajila Bu'uuraa")),
  S("FAC_WASTEMGMT", "FACILITIES", L("Waste Management & Environmental Fees", "የቆሻሻ አወጋገድ እና የአካባቢ ክፍያዎች", "Bulchiinsa Kosii fi Kaffaltii Naannoo")),
  S("FAC_SMALLWARE", "FACILITIES", L("Smallwares & Equipment Maintenance", "አነስተኛ ዕቃዎች እና የመሳሪያ ጥገና", "Meeshaalee Xixiqqaa fi Suphaa Meeshaa")),
  S("FAC_REPAIR", "FACILITIES", L("Facility Repair & Upkeep", "የተቋም ጥገና", "Suphaa fi Kunuunsa Dhaabbataa")),
  S("FAC_PETTY", "FACILITIES", L("Petty Cash Disbursements", "የጥቃቅን ወጪ ክፍያዎች", "Baasii Maallaqa Xixiqqaa")),
  // 4. Revenue operations (cost side)
  S("REV_FEES", "REVENUE_OPERATIONS", L("Payment Processing & Merchant Fees", "የክፍያ ማስተናገጃ እና የነጋዴ ክፍያዎች", "Kaffaltii Tajaajila Kaffaltii fi Daldalaa")),
  S("REV_REFUND", "REVENUE_OPERATIONS", L("Refunds, Chargebacks & Credit Memos", "ተመላሽ ገንዘብ እና የብድር ማስታወሻዎች", "Maallaqa Deebi'e fi Yaadannoo Liqaa")),
  S("REV_BADDEBT", "REVENUE_OPERATIONS", L("Collections & Bad Debt", "ዕዳ መሰብሰብ እና የማይሰበሰብ ዕዳ", "Sassaaba Liqaa fi Liqaa Hin Deebine")),
  S("REV_REGISTER", "REVENUE_OPERATIONS", L("Register Overages & Shortages", "የካሽ መሳቢያ ትርፍ እና ጉድለት", "Dabalataa fi Hir'ina Saanduqa Callaa")),
  // 5. Pricing & margins
  S("PRC_DISCOUNT", "PRICING_MARGINS", L("Discounts & Promotions", "ቅናሾች እና ማስተዋወቂያዎች", "Hir'isa Gatii fi Beeksisa")),
  S("PRC_COMPS", "PRICING_MARGINS", L("Manager Comps & Staff Meals", "ነጻ ምግቦች እና የሰራተኛ ምግብ", "Nyaata Bilisaa fi Nyaata Hojjettootaa")),
  S("PRC_PRICEBOOK", "PRICING_MARGINS", L("Price Book Updates", "የዋጋ ዝርዝር ማሻሻያ", "Haaromsa Tarree Gatii")),
  S("PRC_AUDIT", "PRICING_MARGINS", L("Theoretical vs Actual Cost Variance", "የታሰበ እና ትክክለኛ ወጪ ልዩነት", "Garaagarummaa Baasii Tilmaamamee fi Dhugaa")),
  // 6. Taxes
  S("TAX_VAT", "TAXES_COMPLIANCE", L("Sales Tax & VAT", "የሽያጭ ታክስ እና ተ.እ.ታ", "Taaksii Gurgurtaa fi VAT")),
  S("TAX_FISCAL", "TAXES_COMPLIANCE", L("Fiscal Compliance & Invoicing", "የፊስካል ተገዢነት እና ደረሰኝ", "Hordoffii Faayinaansii fi Nagahee")),
  S("TAX_LICENSE", "TAXES_COMPLIANCE", L("Business Licenses & Permits", "የንግድ ፈቃዶች", "Hayyama Daldalaa fi Eeyyamoota")),
  // 7. Technology
  S("TECH_SAAS", "TECH_INFRASTRUCTURE", L("Cloud POS & Software Subscriptions", "የክላውድ POS እና የሶፍትዌር ምዝገባዎች", "Galmee POS Duumessaa fi Sooftiweerii")),
  S("TECH_HW", "TECH_INFRASTRUCTURE", L("Hardware Depreciation & Replacement", "የሃርድዌር እርጅና እና ምትክ", "Moofaa'uu fi Bakka Buusuu Haardiweerii")),
  S("TECH_NET", "TECH_INFRASTRUCTURE", L("Network Infrastructure", "የኔትወርክ መሠረተ ልማት", "Bu'uura Neetworkii")),
  // 8. Marketing
  S("MKT_CAC", "MARKETING_GROWTH", L("Customer Acquisition Cost (CAC)", "ደንበኛ የማፍራት ወጪ (CAC)", "Baasii Maamila Horachuu (CAC)")),
  S("MKT_ADS", "MARKETING_GROWTH", L("Advertising & Local Store Marketing", "ማስታወቂያ እና የአካባቢ ግብይት", "Beeksisa fi Gabaa Naannoo")),
  S("MKT_LOYALTY", "MARKETING_GROWTH", L("Loyalty Programs & Rewards", "የታማኝነት ፕሮግራሞች እና ሽልማቶች", "Sagantaa Amanamummaa fi Badhaasa")),
  S("MKT_TE", "MARKETING_GROWTH", L("Client Entertainment & Travel", "የደንበኛ መስተንግዶ እና ጉዞ", "Simannaa Maamilaa fi Imala")),
];

/* ---------- items ---------- */

const items: CatalogItem[] = [];

function item(
  id: string,
  sub: string,
  unit: string,
  kind: SupplyKind,
  price: number,
  name: LocalizedText,
  opts: { aliases?: string[]; vat?: boolean } = {},
): void {
  const def = SUB_CATEGORIES.find((s) => s.id === sub);
  if (!def) throw new Error(`Unknown sub-category ${sub}`);
  const nameKey = `item.${id}`;
  registerText(nameKey, name);
  items.push({
    id, nameKey, mainCategory: def.mainCategory, subCategory: sub, defaultUnit: unit, kind,
    defaultPrice: price, aliases: opts.aliases ?? [], vatApplicable: opts.vat ?? kind !== "ADJUSTMENT",
  });
}

// 1. COGS — raw ingredients (market produce is usually bought without VAT)
item("onion", "COGS_FOOD", "kg", "GOODS", 45, L("Onion", "ሽንኩርት", "Shunkurtii"), { aliases: ["shinkurt", "red onion"], vat: false });
item("tomato", "COGS_FOOD", "kg", "GOODS", 38, L("Tomato", "ቲማቲም", "Timaatimii"), { aliases: ["timatim"], vat: false });
item("garlic", "COGS_FOOD", "kg", "GOODS", 160, L("Garlic", "ነጭ ሽንኩርት", "Qullubbii Adii"), { aliases: ["nech shinkurt"], vat: false });
item("green-pepper", "COGS_FOOD", "kg", "GOODS", 70, L("Green Pepper", "ቃሪያ", "Barbaree Magariisaa"), { aliases: ["karia", "chili"], vat: false });
item("potato", "COGS_FOOD", "kg", "GOODS", 30, L("Potato", "ድንች", "Dinnicha"), { aliases: ["dinch"], vat: false });
item("beef", "COGS_FOOD", "kg", "GOODS", 650, L("Beef", "የበሬ ሥጋ", "Foon Loonii"), { aliases: ["siga", "kitfo", "meat"] });
item("chicken", "COGS_FOOD", "pcs", "GOODS", 550, L("Chicken", "ዶሮ", "Lukkuu"), { aliases: ["doro"] });
item("eggs", "COGS_FOOD", "pcs", "GOODS", 12, L("Eggs", "እንቁላል", "Hanqaaquu"), { aliases: ["enkulal"], vat: false });
item("kibbeh", "COGS_FOOD", "kg", "GOODS", 900, L("Niter Kibbeh (spiced butter)", "ንጥር ቅቤ", "Dhadhaa Qulqulluu"), { aliases: ["kibe", "butter"] });
item("milk", "COGS_FOOD", "liters", "GOODS", 60, L("Milk", "ወተት", "Aannan"), { aliases: ["wetet"] });
item("teff", "COGS_FOOD", "kg", "GOODS", 145, L("Teff Flour", "የጤፍ ዱቄት", "Daakuu Xaafii"), { aliases: ["teff", "tef"], vat: false });
item("injera", "COGS_FOOD", "pcs", "GOODS", 15, L("Injera", "እንጀራ", "Buddeena"), { aliases: ["enjera"], vat: false });
item("berbere", "COGS_FOOD", "kg", "GOODS", 480, L("Berbere", "በርበሬ", "Barbaree"), { vat: false });
item("oil", "COGS_FOOD", "liters", "GOODS", 210, L("Cooking Oil", "የምግብ ዘይት", "Zayita Nyaataa"), { aliases: ["zeyt", "vegetable oil"] });
item("olive-oil", "COGS_FOOD", "liters", "GOODS", 650, L("Olive Oil", "የወይራ ዘይት", "Zayita Ejersaa"));
// beverages
item("soft-drinks", "COGS_BEV", "crates", "GOODS", 700, L("Soft Drinks", "ለስላሳ መጠጦች", "Dhugaatii Laafaa"), { aliases: ["cola", "sprite", "fanta", "ambo"] });
item("beer", "COGS_BEV", "crates", "GOODS", 1150, L("Beer", "ቢራ", "Biiraa"), { aliases: ["bira"] });
item("coffee", "COGS_BEV", "kg", "GOODS", 520, L("Coffee Beans", "የቡና ፍሬ", "Firii Bunaa"), { aliases: ["buna"] });
item("tea", "COGS_BEV", "kg", "GOODS", 380, L("Tea Leaves", "የሻይ ቅጠል", "Baala Shaayii"), { aliases: ["shai"] });
item("water", "COGS_BEV", "boxes", "GOODS", 240, L("Bottled Water", "የታሸገ ውሃ", "Bishaan Qabame"), { aliases: ["wuha"] });
item("ice", "COGS_BEV", "bags", "GOODS", 80, L("Ice", "በረዶ", "Cabbii"), { vat: false });
item("syrup", "COGS_BEV", "liters", "GOODS", 300, L("Syrups & Mixers", "ሽሮፕ እና ማደባለቂያዎች", "Siiroppii fi Makkaa"));
// packaging
item("takeaway-box", "COGS_PACK", "boxes", "GOODS", 350, L("Takeout Boxes", "የምግብ መውሰጃ ሳጥኖች", "Saanduqa Nyaata Fudhatamu"));
item("cups", "COGS_PACK", "boxes", "GOODS", 420, L("Paper Cups & Lids", "የወረቀት ኩባያ እና ክዳን", "Kubbaayyaa Waraqaa fi Qadaada"));
item("napkins", "COGS_PACK", "boxes", "GOODS", 180, L("Napkins", "የእጅ መጥረጊያ ወረቀት", "Waraqaa Harkaa"), { aliases: ["soft"] });
item("carry-bags", "COGS_PACK", "bags", "GOODS", 150, L("Carry Bags", "መያዣ ፌስታሎች", "Korojoo Baattuu"), { aliases: ["festal"] });
item("straws", "COGS_PACK", "boxes", "GOODS", 120, L("Straws & Cutlery", "መምጠጫ እና ማንኪያ ሹካ", "Ujummoo fi Fal'aana"));
// consumables
item("plastic-wrap", "COGS_CONS", "rolls", "GOODS", 260, L("Plastic Wrap", "የፕላስቲክ መጠቅለያ", "Maraa Pilaastikii"));
item("foil", "COGS_CONS", "rolls", "GOODS", 340, L("Aluminum Foil", "አሉሚኒየም ፎይል", "Fooyilii Aluminiyeemii"));
item("food-sanitizer", "COGS_CONS", "liters", "GOODS", 280, L("Food-safe Sanitizer", "ለምግብ የሚሆን ጸረ-ተህዋስ", "Qulqulleessaa Nyaataaf Mijatu"));
// waste & shrinkage — non-cash adjustments
item("spoilage", "COGS_WASTE", "kg", "ADJUSTMENT", 40, L("Spoiled Produce", "የተበላሸ አትክልት", "Kuduraa Badde"));
item("expired", "COGS_WASTE", "pcs", "ADJUSTMENT", 0, L("Expired Stock", "ጊዜው ያለፈበት ዕቃ", "Meeshaa Yeroon Isaa Darbe"));
item("prep-waste", "COGS_WASTE", "kg", "ADJUSTMENT", 0, L("Prep & Trim Loss", "የዝግጅት ብክነት", "Badiinsa Qophii"));
item("theft", "COGS_WASTE", "pcs", "ADJUSTMENT", 0, L("Theft or Missing Stock", "የተሰረቀ ወይም የጠፋ ዕቃ", "Meeshaa Hatame ykn Bade"));

// 2. Labor
item("salary-kitchen", "LAB_SALARY", "month", "SERVICE", 120000, L("Kitchen Staff Salaries", "የወጥ ቤት ሰራተኞች ደመወዝ", "Mindaa Hojjettoota Kushinaa"), { aliases: ["demoz", "payroll"], vat: false });
item("salary-floor", "LAB_SALARY", "month", "SERVICE", 90000, L("Floor & Service Salaries", "የአስተናጋጆች ደመወዝ", "Mindaa Tajaajiltootaa"), { aliases: ["waiters", "payroll"], vat: false });
item("salary-manager", "LAB_SALARY", "month", "SERVICE", 35000, L("Management Salary", "የአስተዳደር ደመወዝ", "Mindaa Bulchiinsaa"), { vat: false });
item("casual-hours", "LAB_HOURLY", "hours", "SERVICE", 60, L("Casual Staff Hours", "የጊዜያዊ ሰራተኛ ሰዓት", "Sa'aatii Hojjettoota Yeroof"), { vat: false });
item("overtime", "LAB_HOURLY", "hours", "SERVICE", 90, L("Overtime Hours", "ትርፍ ሰዓት", "Sa'aatii Dabalataa"), { vat: false });
item("commission", "LAB_COMM", "pcs", "SERVICE", 0, L("Sales Commission", "የሽያጭ ኮሚሽን", "Komishinii Gurgurtaa"), { vat: false });
item("spot-bonus", "LAB_SPIFF", "pcs", "SERVICE", 500, L("Spot Bonus", "ፈጣን ጉርሻ", "Boonasii Battalaa"), { vat: false });
item("tip-pool", "LAB_TIPS", "pcs", "SERVICE", 0, L("Tip Pool Payout", "የጉርሻ ክፍፍል", "Qooddii Tippii"), { vat: false });
item("service-charge", "LAB_TIPS", "pcs", "SERVICE", 0, L("Service Charge Distribution", "የአገልግሎት ክፍያ ክፍፍል", "Qooddii Kaffaltii Tajaajilaa"), { vat: false });
item("pension", "LAB_DEDUCT", "month", "SERVICE", 0, L("Pension Contribution", "የጡረታ መዋጮ", "Gumaacha Soorama"), { vat: false });
item("paye", "LAB_DEDUCT", "month", "SERVICE", 0, L("Employment Income Tax (PAYE)", "የሰራተኛ ገቢ ግብር", "Gibira Galii Hojjetaa"), { vat: false });
item("advance", "LAB_ADVANCE", "pcs", "SERVICE", 0, L("Salary Advance", "የደመወዝ ቅድመ ክፍያ", "Kaffaltii Mindaa Duraa"), { vat: false });
item("clawback", "LAB_CLAWBACK", "pcs", "ADJUSTMENT", 0, L("Commission Clawback", "የኮሚሽን ተመላሽ", "Deebii Komishinii"), { vat: false });

// 3. Facilities
item("degreaser", "FAC_CLEAN", "liters", "GOODS", 220, L("Floor Degreaser", "የወለል ቅባት ማስለቀቂያ", "Qulqulleessaa Cooma Lafaa"));
item("dish-soap", "FAC_CLEAN", "liters", "GOODS", 120, L("Dishwashing Liquid", "የሳህን ማጠቢያ ሳሙና", "Saamunaa Miciirraa Saahinii"), { aliases: ["samuna"] });
item("mops", "FAC_CLEAN", "pcs", "GOODS", 250, L("Mops & Brooms", "መወልወያ እና መጥረጊያ", "Mooppii fi Haxaa'aa"));
item("trash-liners", "FAC_CLEAN", "rolls", "GOODS", 90, L("Trash Liners", "የቆሻሻ ከረጢቶች", "Korojoo Kosii"));
item("paper-towels", "FAC_CLEAN", "rolls", "GOODS", 70, L("Paper Towels", "የወረቀት ፎጣ", "Fooxaa Waraqaa"));
item("cleaning-contract", "FAC_JANITOR", "month", "SERVICE", 6000, L("Cleaning Contractor", "የጽዳት ተቋራጭ", "Kontiraaktara Qulqullinaa"));
item("electricity", "FAC_UTIL", "month", "SERVICE", 6200, L("Electricity Bill", "የመብራት ክፍያ", "Kaffaltii Ibsaa"), { aliases: ["eeu", "mebrat", "power"] });
item("water-bill", "FAC_UTIL", "month", "SERVICE", 1450, L("Water Bill", "የውሃ ክፍያ", "Kaffaltii Bishaanii"), { aliases: ["aawsa"] });
item("gas", "FAC_UTIL", "pcs", "GOODS", 1900, L("Cooking Gas", "የምግብ ማብሰያ ጋዝ", "Gaazii Nyaata Bilcheessuu"), { aliases: ["butane"] });
item("trash-collection", "FAC_WASTEMGMT", "month", "SERVICE", 600, L("Trash Collection", "የቆሻሻ ማንሳት", "Funaansa Kosii"));
item("grease-trap", "FAC_WASTEMGMT", "job", "SERVICE", 1500, L("Grease Trap Cleaning", "የቅባት ማጥመጃ ጽዳት", "Qulqulleessa Qabduu Coomaa"));
item("knives", "FAC_SMALLWARE", "pcs", "GOODS", 450, L("Kitchen Knives", "የወጥ ቤት ቢላዎች", "Albaasota Kushinaa"));
item("glassware", "FAC_SMALLWARE", "pcs", "GOODS", 80, L("Glassware & Plates", "ብርጭቆ እና ሳህኖች", "Burcuqqoo fi Saahinii"));
item("fridge-repair", "FAC_SMALLWARE", "job", "SERVICE", 2500, L("Fridge Repair", "የማቀዝቀዣ ጥገና", "Suphaa Firijii"));
item("plumbing", "FAC_REPAIR", "job", "SERVICE", 1200, L("Plumbing Repair", "የቧንቧ ጥገና", "Suphaa Ujummoo Bishaanii"));
item("lighting", "FAC_REPAIR", "job", "SERVICE", 800, L("Lighting Repair", "የመብራት ጥገና", "Suphaa Ibsaa"));
item("market-run", "FAC_PETTY", "pcs", "GOODS", 0, L("Emergency Market Run", "አስቸኳይ የገበያ ግዢ", "Bittaa Gabaa Hatattamaa"), { vat: false });

// 4. Revenue operations
item("fee-telebirr", "REV_FEES", "month", "SERVICE", 0, L("Telebirr Merchant Fees", "የቴሌብር ነጋዴ ክፍያ", "Kaffaltii Daldalaa Telebirr"));
item("fee-cbebirr", "REV_FEES", "month", "SERVICE", 0, L("CBE Birr Fees", "የሲቢኢ ብር ክፍያ", "Kaffaltii CBE Birr"));
item("fee-mpesa", "REV_FEES", "month", "SERVICE", 0, L("M-Pesa Fees", "የኤም-ፔሳ ክፍያ", "Kaffaltii M-Pesa"));
item("fee-card", "REV_FEES", "month", "SERVICE", 0, L("Card Processing Fees", "የካርድ ክፍያ ማስተናገጃ", "Kaffaltii Hojii Kaardii"));
item("refund", "REV_REFUND", "pcs", "ADJUSTMENT", 0, L("Customer Refund", "ለደንበኛ ተመላሽ", "Maallaqa Maamilaaf Deebi'e"), { vat: false });
item("bad-debt", "REV_BADDEBT", "pcs", "ADJUSTMENT", 0, L("Bad Debt Write-off", "የማይሰበሰብ ዕዳ ስረዛ", "Haquu Liqaa Hin Deebine"), { vat: false });
item("register-short", "REV_REGISTER", "pcs", "ADJUSTMENT", 0, L("Cash Register Shortage", "የካሽ መሳቢያ ጉድለት", "Hir'ina Saanduqa Callaa"), { vat: false });

// 5. Pricing & margins
item("promo-discount", "PRC_DISCOUNT", "pcs", "ADJUSTMENT", 0, L("Promotion Discount", "የማስተዋወቂያ ቅናሽ", "Hir'isa Beeksisaa"), { vat: false });
item("happy-hour", "PRC_DISCOUNT", "pcs", "ADJUSTMENT", 0, L("Happy Hour Discount", "የደስታ ሰዓት ቅናሽ", "Hir'isa Sa'aatii Gammachuu"), { vat: false });
item("manager-comp", "PRC_COMPS", "pcs", "ADJUSTMENT", 0, L("Manager Comp", "የአስተዳዳሪ ነጻ ምግብ", "Nyaata Bilisaa Bulchaan Kenne"), { vat: false });
item("staff-meal", "PRC_COMPS", "pcs", "ADJUSTMENT", 90, L("Staff Meal", "የሰራተኛ ምግብ", "Nyaata Hojjettootaa"), { vat: false });
item("menu-reprint", "PRC_PRICEBOOK", "job", "SERVICE", 1800, L("Menu Reprint (price update)", "የምናሌ ዳግም ህትመት (የዋጋ ለውጥ)", "Irra Deebii Maxxansa Menyuu (gatii haaraa)"));
item("count-variance", "PRC_AUDIT", "pcs", "ADJUSTMENT", 0, L("Stock Count Variance", "የክምችት ቆጠራ ልዩነት", "Garaagarummaa Lakkoofsa Kuusaa"), { vat: false });

// 6. Taxes & compliance
item("vat-remit", "TAX_VAT", "month", "SERVICE", 0, L("VAT Remittance", "የተ.እ.ታ ገቢ ማድረግ", "Galchii VAT"), { aliases: ["mor", "revenue"], vat: false });
item("wht-remit", "TAX_VAT", "month", "SERVICE", 0, L("Withholding Tax Remittance", "የተቀናሽ ግብር ገቢ ማድረግ", "Galchii Gibira Qabamee"), { vat: false });
item("fiscal-paper", "TAX_FISCAL", "rolls", "GOODS", 60, L("Fiscal Printer Paper", "የፊስካል ማሽን ወረቀት", "Waraqaa Maashina Fiskaalaa"));
item("fiscal-service", "TAX_FISCAL", "job", "SERVICE", 1500, L("Fiscal Device Service", "የፊስካል ማሽን አገልግሎት", "Tajaajila Maashina Fiskaalaa"));
item("trade-license", "TAX_LICENSE", "job", "SERVICE", 3500, L("Trade License Renewal", "የንግድ ፈቃድ እድሳት", "Haaromsa Hayyama Daldalaa"), { vat: false });
item("health-permit", "TAX_LICENSE", "job", "SERVICE", 1200, L("Health Permit", "የጤና ፈቃድ", "Hayyama Fayyaa"), { vat: false });

// 7. Technology
item("cloud-pos", "TECH_SAAS", "month", "SERVICE", 2500, L("Cloud POS Subscription", "የክላውድ POS ምዝገባ", "Galmee POS Duumessaa"));
item("inventory-app", "TECH_SAAS", "month", "SERVICE", 1200, L("Inventory Software", "የክምችት ሶፍትዌር", "Sooftiweerii Kuusaa"));
item("pos-terminal", "TECH_HW", "pcs", "GOODS", 18000, L("POS Terminal", "POS ተርሚናል", "Terminaala POS"));
item("receipt-printer", "TECH_HW", "pcs", "GOODS", 9500, L("Receipt Printer", "የደረሰኝ ማተሚያ", "Maxxansaa Nagahee"));
item("scanner", "TECH_HW", "pcs", "GOODS", 4200, L("Barcode Scanner", "ባርኮድ ስካነር", "Iskaanara Baarkoodii"));
item("internet", "TECH_NET", "month", "SERVICE", 1999, L("Internet (ISP)", "ኢንተርኔት", "Interneetii"), { aliases: ["ethio telecom", "safaricom", "wifi"] });
item("hosting", "TECH_NET", "month", "SERVICE", 900, L("Cloud Hosting", "የክላውድ ሆስቲንግ", "Hoostingii Duumessaa"));

// 8. Marketing
item("social-ads", "MKT_ADS", "month", "SERVICE", 4000, L("Social Media Ads", "የማኅበራዊ ሚዲያ ማስታወቂያ", "Beeksisa Miidiyaa Hawaasaa"), { aliases: ["facebook", "instagram", "tiktok", "telegram"] });
item("onsite-ad", "MKT_ADS", "pcs", "GOODS", 2500, L("On-site Ad Signage", "በቦታው ላይ ያለ ማስታወቂያ", "Beeksisa Iddoo Irratti"), { aliases: ["sign", "banner"] });
item("flyers", "MKT_ADS", "pcs", "GOODS", 3, L("Flyers & Banners", "በራሪ ወረቀቶች እና ባነሮች", "Waraqaa Raabsamu fi Baanaroota"));
item("sponsorship", "MKT_ADS", "job", "SERVICE", 8000, L("Event Sponsorship", "የዝግጅት ስፖንሰርሺፕ", "Deeggarsa Sagantaa"));
item("influencer", "MKT_CAC", "job", "SERVICE", 6000, L("Influencer Campaign", "የኢንፍሉዌንሰር ዘመቻ", "Duula Influwensarii"));
item("loyalty-reward", "MKT_LOYALTY", "pcs", "ADJUSTMENT", 0, L("Loyalty Reward Redeemed", "የታማኝነት ሽልማት", "Badhaasa Amanamummaa Fayyadame"), { vat: false });
item("client-dinner", "MKT_TE", "pcs", "SERVICE", 2200, L("Client Dinner", "የደንበኛ እራት", "Irbaata Maamilaa"));
item("business-travel", "MKT_TE", "pcs", "SERVICE", 3500, L("Business Travel", "የስራ ጉዞ", "Imala Hojii"), { aliases: ["transport", "ride"] });

export const BASE_ITEMS: readonly CatalogItem[] = items;

/* ---------- payment sources ---------- */

export const PAYMENT_METHODS: readonly PaymentMethodDef[] = [
  { id: "CASH", name: L("Cash", "ጥሬ ገንዘብ", "Callaa"), hint: L("Cash drawer", "የካሽ መሳቢያ", "Saanduqa callaa"), acceptsSales: true },
  { id: "TELEBIRR", name: L("Telebirr", "ቴሌብር", "Telebirr"), hint: L("Ethio telecom wallet", "የኢትዮ ቴሌኮም ቦርሳ", "Korojoo Ethio telecom"), acceptsSales: true },
  { id: "CBE_BIRR", name: L("CBE Birr", "ሲቢኢ ብር", "CBE Birr"), hint: L("Commercial Bank wallet", "የንግድ ባንክ ቦርሳ", "Korojoo Baankii Daldalaa"), acceptsSales: true },
  { id: "M_PESA", name: L("M-Pesa", "ኤም-ፔሳ", "M-Pesa"), hint: L("Safaricom wallet", "የሳፋሪኮም ቦርሳ", "Korojoo Safaricom"), acceptsSales: true },
  { id: "CARD", name: L("Corporate Card", "የድርጅት ካርድ", "Kaardii Dhaabbataa"), hint: L("Bank card / POS", "የባንክ ካርድ / POS", "Kaardii baankii / POS"), acceptsSales: true },
  { id: "PETTY_CASH", name: L("Petty Cash", "የጥቃቅን ወጪ ገንዘብ", "Maallaqa Xixiqqaa"), hint: L("Small-spend box", "የአነስተኛ ወጪ ሳጥን", "Saanduqa baasii xixiqqaa"), acceptsSales: false },
];

export const PAYMENT_IDS: readonly PaymentMethod[] = PAYMENT_METHODS.map((p) => p.id);

/* ---------- units ---------- */

export const BASE_UNITS: readonly UnitDef[] = [
  { code: "kg", name: L("kg", "ኪ.ግ", "kg") },
  { code: "g", name: L("g", "ግራም", "giraamii") },
  { code: "liters", name: L("liters", "ሊትር", "litira") },
  { code: "pcs", name: L("pcs", "ፍሬ", "lakk.") },
  { code: "boxes", name: L("boxes", "ሳጥን", "saanduqa") },
  { code: "crates", name: L("crates", "ክሬት", "kireetii") },
  { code: "bags", name: L("bags", "ከረጢት", "korojoo") },
  { code: "rolls", name: L("rolls", "ጥቅል", "maraa") },
  { code: "hours", name: L("hours", "ሰዓት", "sa'aatii") },
  { code: "month", name: L("month", "ወር", "ji'a") },
  { code: "job", name: L("job", "ሥራ", "hojii") },
];

/* ---------- sales channels ---------- */

export const SALES_CHANNELS: readonly SalesChannel[] = [
  { id: "lunch", name: L("Lunch service", "የምሳ አገልግሎት", "Tajaajila Laaqanaa"), b2b: false },
  { id: "dinner", name: L("Dinner service", "የእራት አገልግሎት", "Tajaajila Irbaataa"), b2b: false },
  { id: "coffee", name: L("Coffee & drinks", "ቡና እና መጠጦች", "Buna fi Dhugaatii"), b2b: false },
  { id: "takeaway", name: L("Takeaway & delivery", "መውሰጃ እና ማድረሻ", "Fudhachuu fi Geejjiba"), b2b: false },
  { id: "catering", name: L("Catering invoice", "የምግብ ዝግጅት ደረሰኝ", "Nagahee Qophii Nyaataa"), b2b: true },
  { id: "counter", name: L("Counter sales", "የመደብር ሽያጭ", "Gurgurtaa Kaawuntaraa"), b2b: false },
  { id: "wholesale", name: L("Wholesale order", "የጅምላ ትዕዛዝ", "Ajaja Jumlaa"), b2b: true },
  { id: "delivery", name: L("Home delivery", "የቤት ማድረሻ", "Geejjiba Manaatti"), b2b: false },
];

for (const c of MAIN_CATEGORIES) {
  registerText(`cat.${c.id}`, c.name);
  registerText(`catShort.${c.id}`, c.shortName);
}
for (const s of SUB_CATEGORIES) registerText(`sub.${s.id}`, s.name);
for (const p of PAYMENT_METHODS) {
  registerText(`pay.${p.id}`, p.name);
  registerText(`payHint.${p.id}`, p.hint);
}
for (const u of BASE_UNITS) registerText(`unit.${u.code}`, u.name);
for (const ch of SALES_CHANNELS) registerText(`channel.${ch.id}`, ch.name);

export const mainCategoryDef = (id: MainCategory): MainCategoryDef => {
  const def = MAIN_CATEGORIES.find((c) => c.id === id);
  if (!def) throw new Error(`Unknown category ${id}`);
  return def;
};

export const isMainCategory = (v: string): v is MainCategory => MAIN_CATEGORIES.some((c) => c.id === v);
export const isPaymentMethod = (v: string): v is PaymentMethod => PAYMENT_IDS.includes(v as PaymentMethod);
