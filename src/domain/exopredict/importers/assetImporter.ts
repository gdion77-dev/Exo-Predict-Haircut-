/**
 * ExoPredict PRO — Asset Importer
 * Step 2: XLS Import Layer
 *
 * Source: ASSET_EXPORT (assetXls) — Sheet: applicationAssetDataTable
 *
 * CONFIRMED COLUMNS (from inspection):
 *   [0]  ΑΦΜ Πιστωτή / Διαχειριστή
 *   [1]  Επωνυμία Πιστωτή / Διαχειριστή
 *   [2]  Ιδιοκτήτης
 *   [3]  ΑΦΜ Οφειλέτη
 *   [4]  Κωδικός Περιουσιακού Στοιχείου   ← FK key linking to collateralXls
 *   [5]  Κατηγορία Περιουσιακού Στοιχείου
 *   [6]  Εκτιμώμενη Αξία Περιουσιακού Στοιχείου  ← CREDITOR_COLLATERAL_VALUE (not market value)
 *   [7]  Ένδειξη Ακινήτου
 *   [8]  Διεύθυνση   ← PII — stored only in property areaLabel (stripped)
 *   [9]  Περιοχή
 *   [10] ΤΚ
 *   [11] Νομός
 *   [12] Κωδικός Αντιστοίχισης Περιουσιακού Στοιχείου
 *
 * DEDUP RULE: Same "Κωδικός Περιουσιακού Στοιχείου" appears once per
 * co-owner (ΑΦΜ Οφειλέτη). We create ONE Property record per unique code,
 * and one PropertyOwnership per (code, ΑΦΜ) pair.
 *
 * PRIVACY: Full address is NOT stored. Only Νομός (prefecture) as areaLabel.
 *
 * CRITICAL: "Εκτιμώμενη Αξία" = CREDITOR_COLLATERAL_VALUE, never MARKET_VALUE_ESTIMATE.
 */

import type { RawAssetRow } from "./rawTypes";
import type { Property, PropertyOwnership, PropertyValueEvidence } from "../types/property";
import type { SourceReference } from "../types/source";
import type { PropertyId, OwnershipId, PersonId } from "../types/primitives";
import { makePropertyId, makeOwnershipId } from "../types/primitives";
import { parseEuroCents, asAfm, asIdentifierString } from "./utils";
import {
  makeImportResult,
  rowIssue,
  type ImportResult,
  type ImportRowIssue,
} from "./importResult";

export interface AssetImportResult {
  readonly properties: readonly Property[];
  readonly ownerships: readonly PropertyOwnership[];
  readonly valueEvidences: readonly PropertyValueEvidence[];
  readonly issues: readonly ImportRowIssue[];
  readonly totalRowsRead: number;
  readonly sourceFilename: string;
  readonly importedAt: string;
}

/**
 * Import property, ownership, and CREDITOR_COLLATERAL_VALUE evidence
 * from a parsed array of raw asset rows.
 *
 * @param rows           Raw rows (header excluded).
 * @param personAfmToId  ΑΦΜ → PersonId map.
 * @param filename       Original filename.
 * @param importedAt     ISO timestamp.
 */
export function importAssetRows(
  rows: RawAssetRow[],
  personAfmToId: ReadonlyMap<string, PersonId>,
  filename: string,
  importedAt: string,
): AssetImportResult {
  const issues: ImportRowIssue[] = [];

  // Deduplicate by asset code — one Property per unique code
  const propertyByCode = new Map<string, Property>();
  const ownershipByCodeAfm = new Map<string, PropertyOwnership>();
  const valueEvidenceByCode = new Map<string, PropertyValueEvidence>();

  const sourceRef: SourceReference = {
    sourceType: "ASSET_EXPORT",
    originalFilename: filename,
    sheetName: "applicationAssetDataTable",
    rowReference: null,
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

    const assetCode = asIdentifierString(row["Κωδικός Περιουσιακού Στοιχείου"]);
    if (!assetCode) {
      issues.push(rowIssue(rowNum, "WARNING", "MISSING_ASSET_CODE",
        "Row has no Κωδικός Περιουσιακού Στοιχείου — skipped.", row["Κωδικός Περιουσιακού Στοιχείου"]));
      continue;
    }

    const ownerAfm = asAfm(row["ΑΦΜ Οφειλέτη"]);
    if (!ownerAfm) {
      issues.push(rowIssue(rowNum, "WARNING", "MISSING_OWNER_AFM",
        "Row has no ΑΦΜ Οφειλέτη — ownership skipped.", row["ΑΦΜ Οφειλέτη"]));
    }

    const propertyId: PropertyId = makePropertyId(`PROP-${assetCode}`);

    // ── Property (deduplicated by code) ──────────────────────────────────────
    if (!propertyByCode.has(assetCode)) {
      // areaLabel: use Νομός only — non-identifying at prefecture level
      const nomos = asIdentifierString(row["Νομός"]);
      const periochi = asIdentifierString(row["Περιοχή"]);
      const areaLabel = [periochi, nomos].filter(Boolean).join(", ") || null;

      const property: Property = {
        propertyId,
        propertyType: "UNKNOWN", // source does not confirm subtype
        kaek: null,              // KAEK not present in this export
        areaLabel,
        sourceRef: { ...sourceRef, rowReference: String(rowNum) },
        verificationStatus: "VERIFIED_AGAINST_SOURCE",
      };
      propertyByCode.set(assetCode, property);

      // ── CREDITOR_COLLATERAL_VALUE evidence ──────────────────────────────────
      const valueCents = parseEuroCents(row["Εκτιμώμενη Αξία Περιουσιακού Στοιχείου"]);
      if (valueCents === null) {
        issues.push(rowIssue(rowNum, "WARNING", "NULL_COLLATERAL_VALUE",
          "Creditor collateral value is null — stored as null, NOT 0.",
          row["Εκτιμώμενη Αξία Περιουσιακού Στοιχείου"]));
      }

      const valueEvidence: PropertyValueEvidence = {
        propertyId,
        // CRITICAL: This is CREDITOR_COLLATERAL_VALUE — never MARKET_VALUE_ESTIMATE
        valueType: "CREDITOR_COLLATERAL_VALUE",
        amountCents: valueCents,
        range: null,
        currency: "EUR",
        asOfDate: null, // not provided in this export
        methodDescription: "Εκτιμώμενη αξία περιουσιακού στοιχείου (ASSET_EXPORT)",
        confidence: "MEDIUM",
        sourceRef: { ...sourceRef, rowReference: String(rowNum) },
        verificationStatus: "VERIFIED_AGAINST_SOURCE",
      };
      valueEvidenceByCode.set(assetCode, valueEvidence);
    } else {
      issues.push(rowIssue(rowNum, "SKIPPED", "DUPLICATE_ASSET_CODE",
        `Asset code ${assetCode} already registered — adding ownership only.`, assetCode));
    }

    // ── PropertyOwnership ─────────────────────────────────────────────────────
    if (ownerAfm) {
      const ownershipKey = `${assetCode}::${ownerAfm}`;
      if (!ownershipByCodeAfm.has(ownershipKey)) {
        const personId = personAfmToId.get(ownerAfm);
        if (!personId) {
          issues.push(rowIssue(rowNum, "WARNING", "UNKNOWN_OWNER_AFM",
            `ΑΦΜ Οφειλέτη ${ownerAfm.slice(-4)}**** not in persons map.`, ownerAfm.slice(-4)));
        }

        const ownershipId: OwnershipId = makeOwnershipId(`OWN-${assetCode}-${ownerAfm.slice(-4)}`);
        const ownership: PropertyOwnership = {
          ownershipId,
          propertyId,
          personId: (personId ?? `PERSON-${ownerAfm.slice(-4)}`) as PersonId,
          // Source does not specify percentage — null (unknown)
          ownershipPercentage: null,
          sourceRef: { ...sourceRef, rowReference: String(rowNum) },
        };
        ownershipByCodeAfm.set(ownershipKey, ownership);
      } else {
        issues.push(rowIssue(rowNum, "SKIPPED", "DUPLICATE_OWNERSHIP",
          `Ownership (${assetCode}, ΑΦΜ****${ownerAfm.slice(-4)}) already registered.`));
      }
    }
  }

  return {
    properties: Array.from(propertyByCode.values()),
    ownerships: Array.from(ownershipByCodeAfm.values()),
    valueEvidences: Array.from(valueEvidenceByCode.values()),
    issues,
    totalRowsRead: rows.length,
    sourceFilename: filename,
    importedAt,
  };
}
