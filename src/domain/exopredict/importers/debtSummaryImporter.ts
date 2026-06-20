/**
 * ExoPredict PRO — Debt Summary Importer
 * Step 2: XLS Import Layer
 *
 * Source: DEBTS_SUMMARY_EXPORT (debtsSymmaryXls)
 * Sheet: debtSummary
 *
 * CONFIRMED COLUMNS (from inspection):
 *   [0]  ΑΦΜ Πιστωτή / Διαχειριστή
 *   [1]  Επωνυμία Πιστωτή / Διαχειριστή
 *   [2]  Ιδιοκτήτης
 *   [3]  Συνολικό ποσό υπαγόμενων οφειλών
 *   [4]  Ποσό βασικής οφειλής
 *   [5]  Ποσό τόκων υπερημερίας
 *   [6]  Προσαυξήσεις
 *   [7]  Πρόστιμο δημοσίου
 *   [8]  Ποσοστό οφειλών
 *   [9]  Συνολικό ποσό μη υπαγόμενων οφειλών
 *   [10] Συνολικό ποσό οφειλών ρυθμισμένων με Εξωδ/κό Μηχανισμό
 *
 * IMPORTANT LIMITATION:
 * This export provides PER-CREDITOR aggregates only.
 * Individual debt records (per contract number / per loan) come from the PDF.
 * We produce one CreditorSummary per row — NOT individual Debt domain objects.
 *
 * The last row ("Σύνολα:") is a total row — skipped.
 */

import type { RawDebtSummaryRow } from "./rawTypes";
import type { SourceReference } from "../types/source";
import {
  parseEuroCents,
  asAfm,
  asIdentifierString,
  normalizeCreditorKey,
  parsePercentageString,
} from "./utils";
import {
  makeImportResult,
  rowIssue,
  type ImportResult,
  type ImportRowIssue,
} from "./importResult";

/**
 * Per-creditor debt summary — NOT a full Debt domain object.
 * Individual debts require per-contract data from the PDF.
 */
export interface CreditorDebtSummary {
  readonly creditorAfm: string | null;
  readonly creditorKey: string;
  readonly creditorLabel: string | null;
  readonly claimantLabel: string | null;
  /** Total regulated (υπαγόμενων) debt in euro cents */
  readonly regulatedTotalCents: number | null;
  /** Principal (βασική οφειλή) in euro cents */
  readonly principalCents: number | null;
  /** Overdue interest (τόκοι υπερημερίας) in euro cents */
  readonly overdueInterestCents: number | null;
  /** Surcharges (προσαυξήσεις) — public creditors only */
  readonly surchargesCents: number | null;
  /** Fines (πρόστιμο) — public creditors only */
  readonly finesCents: number | null;
  /** % share of total debt */
  readonly debtPercentage: number | null;
  /** Non-regulated (μη υπαγόμενων) debt in euro cents */
  readonly nonRegulatedTotalCents: number | null;
  /** Already restructured debt in euro cents */
  readonly alreadyRestructuredCents: number | null;
  readonly sourceRef: SourceReference;
}

export function importDebtSummaryRows(
  rows: RawDebtSummaryRow[],
  filename: string,
  importedAt: string,
): ImportResult<CreditorDebtSummary> {
  const records: CreditorDebtSummary[] = [];
  const issues: ImportRowIssue[] = [];

  const sourceRefBase: Omit<SourceReference, "rowReference"> = {
    sourceType: "DEBTS_SUMMARY_EXPORT",
    originalFilename: filename,
    sheetName: "debtSummary",
    pageReference: null,
    importedAt,
    verificationStatus: "VERIFIED_AGAINST_SOURCE",
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2;

    const allNull = Object.values(row).every((v) => v === null || v === undefined || v === "");
    if (allNull) {
      issues.push(rowIssue(rowNum, "SKIPPED", "EMPTY_ROW", "Empty row skipped."));
      continue;
    }

    // Skip the totals row (Επωνυμία = "Σύνολα:")
    const label = String(row["Επωνυμία Πιστωτή / Διαχειριστή"] ?? "").trim();
    if (label === "Σύνολα:") {
      issues.push(rowIssue(rowNum, "SKIPPED", "TOTALS_ROW", "Totals row skipped."));
      continue;
    }

    const creditorAfm = asAfm(row["ΑΦΜ Πιστωτή / Διαχειριστή"]);
    if (!creditorAfm) {
      issues.push(rowIssue(rowNum, "WARNING", "MISSING_CREDITOR_AFM",
        "No creditor ΑΦΜ — row skipped.", row["ΑΦΜ Πιστωτή / Διαχειριστή"]));
      continue;
    }

    const regulatedTotal = parseEuroCents(row["Συνολικό ποσό υπαγόμενων οφειλών"]);
    const principal = parseEuroCents(row["Ποσό βασικής οφειλής"]);
    const overdueInterest = parseEuroCents(row["Ποσό τόκων υπερημερίας"]);
    const surcharges = parseEuroCents(row["Προσαυξήσεις"]);
    const fines = parseEuroCents(row["Πρόστιμο δημοσίου"]);
    const nonRegulated = parseEuroCents(row["Συνολικό ποσό μη υπαγόμενων οφειλών"]);
    const alreadyRestructured = parseEuroCents(row["Συνολικό ποσό οφειλών ρυθμισμένων με Εξωδ/κό Μηχανισμό"]);
    const debtPct = parsePercentageString(row["Ποσοστό οφειλών"]);

    if (regulatedTotal === null) {
      issues.push(rowIssue(rowNum, "WARNING", "NULL_REGULATED_TOTAL",
        "Regulated total is null — stored as null, not 0.",
        row["Συνολικό ποσό υπαγόμενων οφειλών"]));
    }

    const record: CreditorDebtSummary = {
      creditorAfm,
      creditorKey: normalizeCreditorKey(creditorAfm),
      creditorLabel: label || null,
      claimantLabel: asIdentifierString(row["Ιδιοκτήτης"]),
      regulatedTotalCents: regulatedTotal,
      principalCents: principal,
      overdueInterestCents: overdueInterest,
      surchargesCents: surcharges,
      finesCents: fines,
      debtPercentage: debtPct,
      nonRegulatedTotalCents: nonRegulated,
      alreadyRestructuredCents: alreadyRestructured,
      sourceRef: { ...sourceRefBase, rowReference: String(rowNum) },
    };

    records.push(record);
  }

  return makeImportResult(records, issues, rows.length, filename);
}
