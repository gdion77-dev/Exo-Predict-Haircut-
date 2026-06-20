/**
 * ExoPredict PRO — Income Importer
 * Step 2: XLS Import Layer
 *
 * Handles both INCOME_EXPORT (incomeXls) and INCOME_HISTORY_EXPORT (incomeHistoryXls).
 * Both have identical column structure: sheet incomeDataTable / incomeHistoryDataTable.
 *
 * CONFIRMED COLUMNS (from inspection):
 *   [0] Α.Φ.Μ.
 *   [1] Τύπος Μέλους
 *   [2] Φορολογικό Έτος
 *   [3] Ετήσιο Ατομικό Εισόδημα
 *
 * DEDUP RULE: Same ΑΦΜ+year can appear as both "Σύζυγος" and "Συνοφειλέτης".
 * We keep one record per (ΑΦΜ, year) pair — preferring "Συνοφειλέτης" role.
 *
 * PRIVACY: ΑΦΜ is stored only in privateIdentity (not in training projection).
 */

import type { RawIncomeRow } from "./rawTypes";
import type { IncomeRecord } from "../types/incomeAndAssets";
import type { SourceReference } from "../types/source";
import type { PersonId } from "../types/primitives";
import {
  parseEuroCents,
  asAfm,
  parseTaxYear,
  parseMemberType,
} from "./utils";
import {
  makeImportResult,
  rowIssue,
  type ImportResult,
  type ImportRowIssue,
} from "./importResult";

export type IncomeSourceType = "INCOME_EXPORT" | "INCOME_HISTORY_EXPORT";

/**
 * Import income records from a parsed array of raw rows.
 *
 * @param rows      Raw rows read from XLS (header row excluded).
 * @param personAfmToId  Map of ΑΦΜ string → PersonId (built by caller from persons list).
 * @param sourceType  Which export this came from.
 * @param filename  Original filename for traceability.
 * @param importedAt ISO timestamp.
 */
export function importIncomeRows(
  rows: RawIncomeRow[],
  personAfmToId: ReadonlyMap<string, PersonId>,
  sourceType: IncomeSourceType,
  filename: string,
  importedAt: string,
): ImportResult<IncomeRecord> {
  const records: IncomeRecord[] = [];
  const issues: ImportRowIssue[] = [];

  // Dedup key: afm + taxYear — keep first occurrence per role priority
  const seen = new Map<string, string>(); // key → role already stored

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2; // 1-based, +1 for header

    // Skip entirely null rows (trailing empty rows from XLS)
    const allNull = Object.values(row).every((v) => v === null || v === undefined || v === "");
    if (allNull) {
      issues.push(rowIssue(rowNum, "SKIPPED", "EMPTY_ROW", "Row is empty — skipped."));
      continue;
    }

    const afm = asAfm(row["Α.Φ.Μ."]);
    if (!afm) {
      issues.push(rowIssue(rowNum, "WARNING", "MISSING_AFM", "Row has no ΑΦΜ — skipped.", row["Α.Φ.Μ."]));
      continue;
    }

    const taxYear = parseTaxYear(row["Φορολογικό Έτος"]);
    if (taxYear === null) {
      issues.push(rowIssue(rowNum, "WARNING", "INVALID_TAX_YEAR", "Invalid or missing tax year.", row["Φορολογικό Έτος"]));
    }

    const memberType = String(row["Τύπος Μέλους"] ?? "").trim();
    const role = parseMemberType(memberType);

    // Dedup: same AFM+year, different role label (Σύζυγος vs Συνοφειλέτης)
    const dedupKey = `${afm}::${taxYear ?? "null"}`;
    if (seen.has(dedupKey)) {
      issues.push(rowIssue(rowNum, "SKIPPED", "DUPLICATE_AFM_YEAR",
        `Duplicate ΑΦΜ+year combination (${memberType}) — keeping first record.`, dedupKey));
      continue;
    }
    seen.set(dedupKey, memberType);

    const annualCents = parseEuroCents(row["Ετήσιο Ατομικό Εισόδημα"]);
    if (annualCents === null) {
      issues.push(rowIssue(rowNum, "WARNING", "NULL_INCOME_AMOUNT",
        "Income amount is null/unparseable — stored as null (not 0).", row["Ετήσιο Ατομικό Εισόδημα"]));
    }

    const personId = personAfmToId.get(afm);
    if (!personId) {
      issues.push(rowIssue(rowNum, "WARNING", "UNKNOWN_PERSON_AFM",
        "ΑΦΜ not found in persons map — using placeholder PersonId.", afm));
    }

    const sourceRef: SourceReference = {
      sourceType,
      originalFilename: filename,
      sheetName: sourceType === "INCOME_EXPORT" ? "incomeDataTable" : "incomeHistoryDataTable",
      rowReference: String(rowNum),
      pageReference: null,
      importedAt,
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    };

    const record: IncomeRecord = {
      recordId: `INC-${afm.slice(-4)}-${taxYear ?? "UNKN"}-${i}`,
      personId: (personId ?? `PERSON-AFM-${afm.slice(-4)}`) as PersonId,
      category: "UNKNOWN", // source does not provide category breakdown
      periodicity: "ANNUAL", // confirmed: column is "Ετήσιο Ατομικό Εισόδημα"
      netAmountCents: annualCents,
      grossAmountCents: null, // source does not provide gross
      taxYear,
      asOfDate: taxYear ? `${taxYear}-12-31` : null,
      sourceRef,
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    };

    records.push(record);
  }

  return makeImportResult(records, issues, rows.length, filename);
}
