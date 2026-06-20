/**
 * ExoPredict PRO — Importer Tests (Step 2)
 * Node.js standalone runner — no test framework required.
 *
 * Tests cover:
 * I01 - parseEuroCents: Greek format, null, zero, leading zeros
 * I02 - asAfm: leading zero padding, string preservation
 * I03 - Income dedup: same ΑΦΜ+year as Σύζυγος + Συνοφειλέτης → one record
 * I04 - Income null amount → stored as null, not 0
 * I05 - Asset dedup: same property code × 2 owners → 1 property, 2 ownerships
 * I06 - Asset value type: CREDITOR_COLLATERAL_VALUE, never MARKET_VALUE_ESTIMATE
 * I07 - Collateral dedup: same code × 2 rows → 1 link
 * I08 - Collateral coveredDebtIds: empty on import (filled by PDF parser)
 * I09 - DebtSummary: totals row skipped, per-creditor records only
 * I10 - normalizeCreditorKey: known ΑΦΜ → stable key, unknown → UNKNOWN_CREDITOR_xxxx
 * I11 - parseGreekDate: DD/MM/YYYY → ISO, null for bad input
 * I12 - Financial asset: product code always string, null balance ≠ 0
 */

import { parseEuroCents, asAfm, normalizeCreditorKey, parseGreekDate } from
  "../../../src/domain/exopredict/importers/utils";
import { importIncomeRows } from
  "../../../src/domain/exopredict/importers/incomeImporter";
import { importAssetRows } from
  "../../../src/domain/exopredict/importers/assetImporter";
import { importCollateralRows } from
  "../../../src/domain/exopredict/importers/collateralImporter";
import { importDebtSummaryRows } from
  "../../../src/domain/exopredict/importers/debtSummaryImporter";
import { importFinancialAssetRows } from
  "../../../src/domain/exopredict/importers/financialAssetImporter";
import type { RawIncomeRow } from "../../../src/domain/exopredict/importers/rawTypes";
import type { PersonId } from "../../../src/domain/exopredict/types/primitives";
import { makePersonId } from "../../../src/domain/exopredict/types/primitives";

const NOW = "2024-01-01T00:00:00Z";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.error(`  ✗ FAIL: ${name}`); failed++; }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ── Shared person map ────────────────────────────────────────────────────────
const personMap = new Map<string, PersonId>([
  ["020909350", makePersonId("P-APPLICANT")],
  ["041551914", makePersonId("P-CODEBT")],
]);

// ─── I01: parseEuroCents ─────────────────────────────────────────────────────
group("I01 — parseEuroCents: Greek format", () => {
  assert(parseEuroCents("€ 130.000,00") === 13000000, "130.000,00 → 13000000 cents");
  assert(parseEuroCents("€ 0,00") === 0, "0,00 → 0 (explicit zero)");
  assert(parseEuroCents("€ 11.414,39") === 1141439, "11.414,39 → 1141439");
  assert(parseEuroCents(null) === null, "null → null (not 0)");
  assert(parseEuroCents("") === null, "empty string → null");
  assert(parseEuroCents("€ 8,14") === 814, "8,14 → 814 cents");
  assert(parseEuroCents("€ 23,44") === 2344, "23,44 → 2344 cents");
  assert(parseEuroCents("abc") === null, "non-numeric → null");
});

// ─── I02: asAfm ──────────────────────────────────────────────────────────────
group("I02 — asAfm: leading zero preservation", () => {
  assert(asAfm("020909350") === "020909350", "9-digit ΑΦΜ preserved as-is");
  assert(asAfm("41551914") === "041551914", "8-digit padded to 9 with leading zero");
  assert(asAfm(20909350) === "020909350", "numeric cast to string and padded");
  assert(asAfm(null) === null, "null → null");
  assert(asAfm("") === null, "empty → null");
  assert(asAfm("099755919") === "099755919", "leading zeros from doValue ΑΦΜ preserved");
});

// ─── I03: Income dedup ───────────────────────────────────────────────────────
group("I03 — Income dedup: Σύζυγος + Συνοφειλέτης same ΑΦΜ+year", () => {
  const rows: RawIncomeRow[] = [
    { "Α.Φ.Μ.": "041551914", "Τύπος Μέλους": "Συνοφειλέτης", "Φορολογικό Έτος": "2023", "Ετήσιο Ατομικό Εισόδημα": "€ 1.901,83" },
    { "Α.Φ.Μ.": "041551914", "Τύπος Μέλους": "Σύζυγος",      "Φορολογικό Έτος": "2023", "Ετήσιο Ατομικό Εισόδημα": "€ 1.901,83" },
    { "Α.Φ.Μ.": "020909350", "Τύπος Μέλους": "Αιτών",         "Φορολογικό Έτος": "2023", "Ετήσιο Ατομικό Εισόδημα": "€ 11.145,20" },
  ];
  const result = importIncomeRows(rows, personMap, "INCOME_EXPORT", "incomeHistoryXls.xls", NOW);
  assert(result.records.length === 2, "2 records (duplicate skipped)");
  assert(result.skippedRows === 1, "1 row skipped (duplicate)");
  assert(result.issues.some(i => i.code === "DUPLICATE_AFM_YEAR"), "DUPLICATE_AFM_YEAR issue raised");
});

// ─── I04: Income null amount ─────────────────────────────────────────────────
group("I04 — Income: null amount stored as null, not 0", () => {
  const rows: RawIncomeRow[] = [
    { "Α.Φ.Μ.": "020909350", "Τύπος Μέλους": "Αιτών", "Φορολογικό Έτος": "2024", "Ετήσιο Ατομικό Εισόδημα": null },
    { "Α.Φ.Μ.": "041551914", "Τύπος Μέλους": "Σύζυγος", "Φορολογικό Έτος": "2024", "Ετήσιο Ατομικό Εισόδημα": "€ 0,00" },
  ];
  const result = importIncomeRows(rows, personMap, "INCOME_EXPORT", "incomeXls.xls", NOW);
  const nullRecord = result.records.find(r => r.taxYear === 2024 && r.personId === "P-APPLICANT");
  const zeroRecord = result.records.find(r => r.taxYear === 2024 && r.personId === "P-CODEBT");
  assert(nullRecord?.netAmountCents === null, "null raw value → null cents (not 0)");
  assert(zeroRecord?.netAmountCents === 0, "€ 0,00 → 0 cents (explicit zero)");
  assert(result.issues.some(i => i.code === "NULL_INCOME_AMOUNT"), "null amount warning raised");
});

// ─── I05: Asset dedup ────────────────────────────────────────────────────────
group("I05 — Asset: same code × 2 owners → 1 property, 2 ownerships", () => {
  const rows = [
    {
      "ΑΦΜ Πιστωτή / Διαχειριστή": "099755919",
      "Επωνυμία Πιστωτή / Διαχειριστή": "doValue Greece",
      "Ιδιοκτήτης": "XYQ Luxco S.à r.l.",
      "ΑΦΜ Οφειλέτη": "020909350",
      "Κωδικός Περιουσιακού Στοιχείου": "73766",
      "Κατηγορία Περιουσιακού Στοιχείου": "Ακίνητο",
      "Εκτιμώμενη Αξία Περιουσιακού Στοιχείου": "€ 130.000,00",
      "Ένδειξη Ακινήτου": "true",
      "Διεύθυνση": "ΚΑΝΑΠΙΤΣΕΙΚΑ -",
      "Περιοχή": "-",
      "ΤΚ": "83200",
      "Νομός": "ΣΑΜΟΥ",
      "Κωδικός Αντιστοίχισης Περιουσιακού Στοιχείου": "791",
    },
    {
      "ΑΦΜ Πιστωτή / Διαχειριστή": "099755919",
      "Επωνυμία Πιστωτή / Διαχειριστή": "doValue Greece",
      "Ιδιοκτήτης": "XYQ Luxco S.à r.l.",
      "ΑΦΜ Οφειλέτη": "041551914",   // different owner, same asset
      "Κωδικός Περιουσιακού Στοιχείου": "73766",
      "Κατηγορία Περιουσιακού Στοιχείου": "Ακίνητο",
      "Εκτιμώμενη Αξία Περιουσιακού Στοιχείου": "€ 130.000,00",
      "Ένδειξη Ακινήτου": "true",
      "Διεύθυνση": "ΚΑΝΑΠΙΤΣΕΙΚΑ -",
      "Περιοχή": "-",
      "ΤΚ": "83200",
      "Νομός": "ΣΑΜΟΥ",
      "Κωδικός Αντιστοίχισης Περιουσιακού Στοιχείου": null,
    },
  ];
  const result = importAssetRows(rows as Parameters<typeof importAssetRows>[0], personMap, "assetXls.xls", NOW);
  assert(result.properties.length === 1, "1 property record (not 2)");
  assert(result.ownerships.length === 2, "2 ownership records (one per owner)");
  assert(result.valueEvidences.length === 1, "1 value evidence (not duplicated)");
});

// ─── I06: Asset value type ───────────────────────────────────────────────────
group("I06 — Asset: Εκτιμώμενη Αξία → CREDITOR_COLLATERAL_VALUE only", () => {
  const rows = [{
    "ΑΦΜ Πιστωτή / Διαχειριστή": "099755919",
    "Επωνυμία Πιστωτή / Διαχειριστή": "doValue Greece",
    "Ιδιοκτήτης": "XYQ",
    "ΑΦΜ Οφειλέτη": "020909350",
    "Κωδικός Περιουσιακού Στοιχείου": "99999",
    "Κατηγορία Περιουσιακού Στοιχείου": "Ακίνητο",
    "Εκτιμώμενη Αξία Περιουσιακού Στοιχείου": "€ 128.000,00",
    "Ένδειξη Ακινήτου": "true",
    "Διεύθυνση": "TEST",
    "Περιοχή": "ΤΕΣΤ",
    "ΤΚ": "83200",
    "Νομός": "ΣΑΜΟΥ",
    "Κωδικός Αντιστοίχισης Περιουσιακού Στοιχείου": null,
  }];
  const result = importAssetRows(rows as Parameters<typeof importAssetRows>[0], personMap, "assetXls.xls", NOW);
  const ev = result.valueEvidences[0];
  assert(ev?.valueType === "CREDITOR_COLLATERAL_VALUE", "valueType is CREDITOR_COLLATERAL_VALUE");
  assert(ev?.valueType !== "MARKET_VALUE_ESTIMATE", "NOT MARKET_VALUE_ESTIMATE");
  assert(ev?.amountCents === 12800000, "128.000,00 → 12800000 cents");
});

// ─── I07: Collateral dedup ───────────────────────────────────────────────────
group("I07 — Collateral: duplicate code → 1 link only", () => {
  const rows = [
    { "ΑΦΜ Πιστωτή / Διαχειριστή": "099755919", "Επωνυμία Πιστωτή / Διαχειριστή": "doValue",
      "Ιδιοκτήτης": "XYQ", "Κωδικός Εξασφάλισης": "00280001",
      "Ποσό Εξασφάλισης": "€ 32.575,00", "Κωδικός Περιουσιακού Στοιχείου": "90893",
      "Είδος Βάρους": "Προσημείωση/Υποθήκη", "Σειρά Προσημείωσης": "2" },
    { "ΑΦΜ Πιστωτή / Διαχειριστή": "099755919", "Επωνυμία Πιστωτή / Διαχειριστή": "doValue",
      "Ιδιοκτήτης": "XYQ", "Κωδικός Εξασφάλισης": "00280001", // duplicate
      "Ποσό Εξασφάλισης": "€ 32.575,00", "Κωδικός Περιουσιακού Στοιχείου": "90893",
      "Είδος Βάρους": "Προσημείωση/Υποθήκη", "Σειρά Προσημείωσης": "2" },
    { "ΑΦΜ Πιστωτή / Διαχειριστή": "099755919", "Επωνυμία Πιστωτή / Διαχειριστή": "doValue",
      "Ιδιοκτήτης": "XYQ", "Κωδικός Εξασφάλισης": "00240369",
      "Ποσό Εξασφάλισης": "€ 76.050,00", "Κωδικός Περιουσιακού Στοιχείου": "73766",
      "Είδος Βάρους": "Προσημείωση/Υποθήκη", "Σειρά Προσημείωσης": "1" },
  ];
  const result = importCollateralRows(rows as Parameters<typeof importCollateralRows>[0], "collateralXls.xls", NOW);
  assert(result.collateralLinks.length === 2, "2 unique links (duplicate removed)");
  assert(result.issues.some(i => i.code === "DUPLICATE_COLLATERAL_CODE"), "duplicate issue raised");
});

// ─── I08: Collateral coveredDebtIds empty on import ──────────────────────────
group("I08 — Collateral: coveredDebtIds empty until PDF parser fills them", () => {
  const rows = [{
    "ΑΦΜ Πιστωτή / Διαχειριστή": "099755919", "Επωνυμία Πιστωτή / Διαχειριστή": "doValue",
    "Ιδιοκτήτης": "XYQ", "Κωδικός Εξασφάλισης": "00258789",
    "Ποσό Εξασφάλισης": "€ 159.600,00", "Κωδικός Περιουσιακού Στοιχείου": "90893",
    "Είδος Βάρους": "Προσημείωση/Υποθήκη", "Σειρά Προσημείωσης": "3",
  }];
  const result = importCollateralRows(rows as Parameters<typeof importCollateralRows>[0], "collateralXls.xls", NOW);
  const link = result.collateralLinks[0];
  assert(link !== undefined, "link created");
  assert(Array.isArray(link?.coveredDebtIds), "coveredDebtIds is array");
  assert(link?.coveredDebtIds.length === 0, "coveredDebtIds is empty on import (PDF fills it)");
  assert(link?.registrationPriority === 3, "priority rank 3 parsed correctly");
});

// ─── I09: DebtSummary totals row skipped ─────────────────────────────────────
group("I09 — DebtSummary: totals row skipped, per-creditor records only", () => {
  const rows = [
    { "ΑΦΜ Πιστωτή / Διαχειριστή": "099755919", "Επωνυμία Πιστωτή / Διαχειριστή": "doValue Greece",
      "Ιδιοκτήτης": "XYQ Luxco S.à r.l.", "Συνολικό ποσό υπαγόμενων οφειλών": "€ 280.869,66",
      "Ποσό βασικής οφειλής": "€ 267.882,74", "Ποσό τόκων υπερημερίας": "€ 12.986,92",
      "Προσαυξήσεις": "€ 0,00", "Πρόστιμο δημοσίου": "€ 0,00", "Ποσοστό οφειλών": "99,08%",
      "Συνολικό ποσό μη υπαγόμενων οφειλών": "€ 0,00",
      "Συνολικό ποσό οφειλών ρυθμισμένων με Εξωδ/κό Μηχανισμό": "€ 0,00" },
    { "ΑΦΜ Πιστωτή / Διαχειριστή": null, "Επωνυμία Πιστωτή / Διαχειριστή": "Σύνολα:",
      "Ιδιοκτήτης": null, "Συνολικό ποσό υπαγόμενων οφειλών": "€ 283.478,74",
      "Ποσό βασικής οφειλής": "€ 269.933,10", "Ποσό τόκων υπερημερίας": "€ 12.986,92",
      "Προσαυξήσεις": "€ 58,72", "Πρόστιμο δημοσίου": "€ 500,00", "Ποσοστό οφειλών": "100.00%",
      "Συνολικό ποσό μη υπαγόμενων οφειλών": "€ 90.276,21",
      "Συνολικό ποσό οφειλών ρυθμισμένων με Εξωδ/κό Μηχανισμό": "€ 86.190,10" },
  ];
  const result = importDebtSummaryRows(rows as Parameters<typeof importDebtSummaryRows>[0], "debtsSymmaryXls.xls", NOW);
  assert(result.records.length === 1, "1 creditor record (totals row skipped)");
  assert(result.issues.some(i => i.code === "TOTALS_ROW"), "TOTALS_ROW issue raised");
  assert(result.records[0]?.creditorKey === "DOVALUE_GREECE", "creditorKey normalized correctly");
  assert(result.records[0]?.regulatedTotalCents === 28086966, "€280.869,66 → 28086966 cents");
  assert(result.records[0]?.principalCents === 26788274, "principal parsed correctly");
});

// ─── I10: normalizeCreditorKey ───────────────────────────────────────────────
group("I10 — normalizeCreditorKey: known ΑΦΜ → stable key", () => {
  assert(normalizeCreditorKey("099755919") === "DOVALUE_GREECE", "doValue → DOVALUE_GREECE");
  assert(normalizeCreditorKey("094014201") === "NATIONAL_BANK_GR", "ΕΤΕ → NATIONAL_BANK_GR");
  assert(normalizeCreditorKey("996807331") === "ALPHA_BANK_GR", "Άλφα → ALPHA_BANK_GR");
  assert(normalizeCreditorKey("997072577") === "EFKA_GR", "ΕΦΚΑ → EFKA_GR");
  assert(normalizeCreditorKey("997073525") === "AADE_GR", "ΑΑΔΕ → AADE_GR");
  assert(normalizeCreditorKey("123456789").startsWith("UNKNOWN_CREDITOR_"), "unknown → UNKNOWN_CREDITOR_xxxx");
  assert(!normalizeCreditorKey("123456789").includes("123456789"), "unknown key does NOT contain full ΑΦΜ");
  assert(normalizeCreditorKey(null) === "UNKNOWN_CREDITOR", "null → UNKNOWN_CREDITOR");
});

// ─── I11: parseGreekDate ─────────────────────────────────────────────────────
group("I11 — parseGreekDate: DD/MM/YYYY → ISO", () => {
  assert(parseGreekDate("30/09/2025") === "2025-09-30", "30/09/2025 → 2025-09-30");
  assert(parseGreekDate("18/10/2025") === "2025-10-18", "18/10/2025 → 2025-10-18");
  assert(parseGreekDate("2025-09-30") === "2025-09-30", "ISO passthrough");
  assert(parseGreekDate(null) === null, "null → null");
  assert(parseGreekDate("") === null, "empty → null");
  assert(parseGreekDate("not-a-date") === null, "garbage → null");
});

// ─── I12: Financial asset null balance ───────────────────────────────────────
group("I12 — FinancialAsset: null balance ≠ 0, product code always string", () => {
  const rows = [
    { "ΑΦΜ Πιστωτή / Διαχειριστή": "996807331", "Επωνυμία Πιστωτή / Διαχειριστή": "ΑΛΦΑ ΤΡΑΠΕΖΑ Α.Ε.",
      "ΑΦΜ Δικαιούχου": "020909350", "Κωδικός Χρηματοοικονομικού Προϊόντος": "606002101022380",
      "Είδος Χρηματοοικονομικού Προϊόντος": "Τραπεζικές καταθέσεις",
      "Αξία Χρηματοοικονομικού Προϊόντος": "€ 0,00",
      "Είδος Κατάθεσης": "Όψεως", "Ημερομηνία Αποτίμησης": "30/09/2025",
      "Νόμισμα": "EUR", "Κωδικός Αντιστοίχισης Περιουσιακού Στοιχείου": null,
      "Υποβλήθηκε/Ακυρώθηκε από:": null },
    { "ΑΦΜ Πιστωτή / Διαχειριστή": "996807331", "Επωνυμία Πιστωτή / Διαχειριστή": "ΑΛΦΑ ΤΡΑΠΕΖΑ Α.Ε.",
      "ΑΦΜ Δικαιούχου": "041551914", "Κωδικός Χρηματοοικονομικού Προϊόντος": "606002101018285",
      "Είδος Χρηματοοικονομικού Προϊόντος": "Τραπεζικές καταθέσεις",
      "Αξία Χρηματοοικονομικού Προϊόντος": null, // null — not zero
      "Είδος Κατάθεσης": "Όψεως", "Ημερομηνία Αποτίμησης": "30/09/2025",
      "Νόμισμα": "EUR", "Κωδικός Αντιστοίχισης Περιουσιακού Στοιχείου": null,
      "Υποβλήθηκε/Ακυρώθηκε από:": null },
  ];
  const result = importFinancialAssetRows(
    rows as Parameters<typeof importFinancialAssetRows>[0], personMap, "financialAssetXls.xls", NOW);
  assert(result.records.length === 2, "2 records imported");
  const zeroRec = result.records.find(r => r.personIds[0] === "P-APPLICANT");
  const nullRec = result.records.find(r => r.personIds[0] === "P-CODEBT");
  assert(zeroRec?.balanceCents === 0, "€ 0,00 → 0 cents (explicit zero)");
  assert(nullRec?.balanceCents === null, "null raw → null cents (not 0)");
  assert(typeof zeroRec?.institutionKey === "string", "institutionKey is string");
  assert(zeroRec?.institutionKey === "ALPHA_BANK_GR", "institutionKey normalized");
  assert(zeroRec?.asOfDate === "2025-09-30", "date parsed correctly");
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Tests: ${passed + failed} total | ${passed} passed | ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  throw new Error("TESTS FAILED");
} else {
  console.log(`\nAll importer tests PASSED ✓`);
}
