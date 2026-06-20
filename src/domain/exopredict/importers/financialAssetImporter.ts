/**
 * ExoPredict PRO — Financial Asset Importer
 * Step 2: XLS Import Layer
 *
 * Source: FINANCIAL_ASSET_EXPORT (financialAssetXls)
 * Sheet: applicationFinancialAssetDataTa
 *
 * CONFIRMED COLUMNS (from inspection):
 *   [0]  ΑΦΜ Πιστωτή / Διαχειριστή
 *   [1]  Επωνυμία Πιστωτή / Διαχειριστή
 *   [2]  ΑΦΜ Δικαιούχου              ← PII — used only for PersonId lookup
 *   [3]  Κωδικός Χρηματοοικονομικού Προϊόντος  ← account code — ALWAYS string
 *   [4]  Είδος Χρηματοοικονομικού Προϊόντος
 *   [5]  Αξία Χρηματοοικονομικού Προϊόντος
 *   [6]  Είδος Κατάθεσης
 *   [7]  Ημερομηνία Αποτίμησης
 *   [8]  Νόμισμα
 *   [9]  Κωδικός Αντιστοίχισης Περιουσιακού Στοιχείου
 *   [10] Υποβλήθηκε/Ακυρώθηκε από:
 *
 * PRIVACY: Account codes and institution ΑΦΜ are NOT stored in training projection.
 * institutionKey is normalized from ΑΦΜ Πιστωτή.
 */

import type { RawFinancialAssetRow } from "./rawTypes";
import type { FinancialAsset } from "../types/incomeAndAssets";
import type { SourceReference } from "../types/source";
import type { PersonId } from "../types/primitives";
import {
  parseEuroCents,
  asAfm,
  asIdentifierString,
  parseGreekDate,
  normalizeCreditorKey,
} from "./utils";
import {
  makeImportResult,
  rowIssue,
  type ImportResult,
  type ImportRowIssue,
} from "./importResult";

function parseFinancialAssetType(raw: unknown): FinancialAsset["assetType"] {
  const s = String(raw ?? "").trim();
  if (s.includes("κατάθεση") || s.includes("Κατάθεση")) return "BANK_DEPOSIT";
  if (s.includes("επένδυση") || s.includes("Επένδυση")) return "INVESTMENT_PORTFOLIO";
  if (s.includes("ασφάλεια") || s.includes("Ασφάλεια")) return "INSURANCE_POLICY_CASH_VALUE";
  return "UNKNOWN";
}

export function importFinancialAssetRows(
  rows: RawFinancialAssetRow[],
  personAfmToId: ReadonlyMap<string, PersonId>,
  filename: string,
  importedAt: string,
): ImportResult<FinancialAsset> {
  const records: FinancialAsset[] = [];
  const issues: ImportRowIssue[] = [];

  const sourceRefBase: Omit<SourceReference, "rowReference"> = {
    sourceType: "FINANCIAL_ASSET_EXPORT",
    originalFilename: filename,
    sheetName: "applicationFinancialAssetDataTa",
    pageReference: null,
    importedAt,
    verificationStatus: "VERIFIED_AGAINST_SOURCE",
  };

  // Dedup: same product code + beneficiary ΑΦΜ
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2;

    const allNull = Object.values(row).every((v) => v === null || v === undefined || v === "");
    if (allNull) {
      issues.push(rowIssue(rowNum, "SKIPPED", "EMPTY_ROW", "Empty row skipped."));
      continue;
    }

    const productCode = asIdentifierString(row["Κωδικός Χρηματοοικονομικού Προϊόντος"]);
    const beneficiaryAfm = asAfm(row["ΑΦΜ Δικαιούχου"]);

    if (!productCode) {
      issues.push(rowIssue(rowNum, "WARNING", "MISSING_PRODUCT_CODE",
        "No product code — row skipped.", row["Κωδικός Χρηματοοικονομικού Προϊόντος"]));
      continue;
    }

    const dedupKey = `${productCode}::${beneficiaryAfm ?? "null"}`;
    if (seen.has(dedupKey)) {
      issues.push(rowIssue(rowNum, "SKIPPED", "DUPLICATE_PRODUCT_AFM",
        "Duplicate product code + beneficiary ΑΦΜ — skipped.", dedupKey));
      continue;
    }
    seen.add(dedupKey);

    const balanceCents = parseEuroCents(row["Αξία Χρηματοοικονομικού Προϊόντος"]);
    if (balanceCents === null) {
      issues.push(rowIssue(rowNum, "WARNING", "NULL_BALANCE",
        "Balance is null — stored as null, not 0.", row["Αξία Χρηματοοικονομικού Προϊόντος"]));
    }

    const personId = beneficiaryAfm ? personAfmToId.get(beneficiaryAfm) : undefined;
    if (beneficiaryAfm && !personId) {
      issues.push(rowIssue(rowNum, "WARNING", "UNKNOWN_BENEFICIARY_AFM",
        `Beneficiary ΑΦΜ ****${(beneficiaryAfm ?? "").slice(-4)} not in persons map.`));
    }

    const creditorAfm = asAfm(row["ΑΦΜ Πιστωτή / Διαχειριστή"]);
    const institutionKey = normalizeCreditorKey(creditorAfm);

    const currency = asIdentifierString(row["Νόμισμα"]) ?? "EUR";
    const asOfDate = parseGreekDate(row["Ημερομηνία Αποτίμησης"]);

    const record: FinancialAsset = {
      assetId: `FIN-${(productCode ?? "UNK").slice(-8)}-${i}`,
      personIds: personId
        ? [personId]
        : beneficiaryAfm
          ? [(`PERSON-${beneficiaryAfm.slice(-4)}`) as PersonId]
          : [],
      assetType: parseFinancialAssetType(row["Είδος Χρηματοοικονομικού Προϊόντος"]),
      balanceCents,
      currency,
      asOfDate,
      institutionKey,
      sourceRef: { ...sourceRefBase, rowReference: String(rowNum) },
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    };

    records.push(record);
  }

  return makeImportResult(records, issues, rows.length, filename);
}
