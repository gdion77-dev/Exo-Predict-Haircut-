/**
 * ExoPredict PRO — Collateral Importer
 * Step 2: XLS Import Layer
 *
 * Source: COLLATERAL_EXPORT (collateralXls)
 * Sheet: applicationCollateralDataTable
 *
 * CONFIRMED COLUMNS (from inspection):
 *   [0]  ΑΦΜ Πιστωτή / Διαχειριστή
 *   [1]  Επωνυμία Πιστωτή / Διαχειριστή
 *   [2]  Ιδιοκτήτης
 *   [3]  Κωδικός Εξασφάλισης          ← always string, may have leading zeros
 *   [4]  Ποσό Εξασφάλισης             ← CREDITOR_COLLATERAL_VALUE
 *   [5]  Κωδικός Περιουσιακού Στοιχείου  ← FK → assetXls (same code)
 *   [6]  Είδος Βάρους
 *   [7]  Σειρά Προσημείωσης           ← lien priority rank
 *
 * DEDUP RULE: Same "Κωδικός Εξασφάλισης" appears twice in this export.
 * We keep one CollateralLink per unique code.
 *
 * NOTE: This export does NOT link collateral to specific debt IDs.
 * The debt link is established by the PDF parser (Step 3).
 * Here we create CollateralLink with empty coveredDebtIds — to be filled later.
 */

import type { RawCollateralRow } from "./rawTypes";
import type { CollateralLink, PropertyValueEvidence } from "../types/property";
import type { SourceReference } from "../types/source";
import type { CollateralId, PropertyId } from "../types/primitives";
import { makeCollateralId, makePropertyId } from "../types/primitives";
import { parseEuroCents, asIdentifierString } from "./utils";
import {
  makeImportResult,
  rowIssue,
  type ImportResult,
  type ImportRowIssue,
} from "./importResult";

export interface CollateralImportResult {
  readonly collateralLinks: readonly CollateralLink[];
  readonly additionalValueEvidences: readonly PropertyValueEvidence[];
  readonly issues: readonly ImportRowIssue[];
  readonly totalRowsRead: number;
  readonly sourceFilename: string;
  readonly importedAt: string;
}

export function importCollateralRows(
  rows: RawCollateralRow[],
  filename: string,
  importedAt: string,
): CollateralImportResult {
  const issues: ImportRowIssue[] = [];
  const linksByCode = new Map<string, CollateralLink>();
  const valueEvidenceByPropertyId = new Map<string, PropertyValueEvidence>();

  const sourceRefBase: Omit<SourceReference, "rowReference"> = {
    sourceType: "COLLATERAL_EXPORT",
    originalFilename: filename,
    sheetName: "applicationCollateralDataTable",
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

    const collateralCode = asIdentifierString(row["Κωδικός Εξασφάλισης"]);
    if (!collateralCode) {
      issues.push(rowIssue(rowNum, "WARNING", "MISSING_COLLATERAL_CODE",
        "No collateral code — row skipped.", row["Κωδικός Εξασφάλισης"]));
      continue;
    }

    // Dedup by collateral code
    if (linksByCode.has(collateralCode)) {
      issues.push(rowIssue(rowNum, "SKIPPED", "DUPLICATE_COLLATERAL_CODE",
        `Collateral code ${collateralCode} already registered — skipped.`, collateralCode));
      continue;
    }

    const assetCode = asIdentifierString(row["Κωδικός Περιουσιακού Στοιχείου"]);
    if (!assetCode) {
      issues.push(rowIssue(rowNum, "WARNING", "MISSING_ASSET_CODE",
        "No asset code on collateral row — link created without propertyId.", row["Κωδικός Περιουσιακού Στοιχείου"]));
    }

    const propertyId: PropertyId = makePropertyId(`PROP-${assetCode ?? "UNKNOWN"}`);
    const collateralId: CollateralId = makeCollateralId(`COL-${collateralCode}`);

    const priorityRaw = row["Σειρά Προσημείωσης"];
    const priority = priorityRaw !== null && priorityRaw !== undefined && priorityRaw !== ""
      ? parseInt(String(priorityRaw), 10)
      : null;

    const link: CollateralLink = {
      collateralId,
      propertyId,
      // coveredDebtIds: empty until PDF parser populates them (Step 3)
      coveredDebtIds: [],
      registrationPriority: isNaN(priority as number) ? null : priority,
      sourceRef: { ...sourceRefBase, rowReference: String(rowNum) },
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    };
    linksByCode.set(collateralCode, link);

    // The collateral export also gives us the creditor's collateral value
    // per-collateral-code — store as additional PropertyValueEvidence
    if (assetCode && !valueEvidenceByPropertyId.has(`${assetCode}::${collateralCode}`)) {
      const amountCents = parseEuroCents(row["Ποσό Εξασφάλισης"]);
      if (amountCents === null) {
        issues.push(rowIssue(rowNum, "WARNING", "NULL_COLLATERAL_AMOUNT",
          "Collateral amount is null — stored as null.", row["Ποσό Εξασφάλισης"]));
      }

      const evidence: PropertyValueEvidence = {
        propertyId,
        // CRITICAL: This is the creditor's collateral amount — NOT market value
        valueType: "CREDITOR_COLLATERAL_VALUE",
        amountCents,
        range: null,
        currency: "EUR",
        asOfDate: null,
        methodDescription: `Ποσό Εξασφάλισης — ${asIdentifierString(row["Είδος Βάρους"]) ?? "Άγνωστο βάρος"} (COLLATERAL_EXPORT)`,
        confidence: "MEDIUM",
        sourceRef: { ...sourceRefBase, rowReference: String(rowNum) },
        verificationStatus: "VERIFIED_AGAINST_SOURCE",
      };
      valueEvidenceByPropertyId.set(`${assetCode}::${collateralCode}`, evidence);
    }
  }

  return {
    collateralLinks: Array.from(linksByCode.values()),
    additionalValueEvidences: Array.from(valueEvidenceByPropertyId.values()),
    issues,
    totalRowsRead: rows.length,
    sourceFilename: filename,
    importedAt,
  };
}
