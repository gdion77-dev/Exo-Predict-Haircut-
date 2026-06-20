/**
 * ExoPredict PRO — Pure Domain Validators
 * Step 1: Domain Foundation
 *
 * Rules:
 * - Validators NEVER silently fix data. They return explicit issues.
 * - Three severity levels: BLOCKER, WARNING, INFO.
 * - No UI, no I/O, no side effects.
 */

import type {
  ExtrajudicialCase,
  Debt,
  DebtPartyRole,
  PropertyValueEvidence,
  PropertyOwnership,
  CollateralLink,
  TrainingSafeCaseProjection,
} from "../types";

// ─── Issue types ──────────────────────────────────────────────────────────────

export type IssueSeverity = "BLOCKER" | "WARNING" | "INFO";

export interface ValidationIssue {
  readonly severity: IssueSeverity;
  readonly code: string;
  readonly message: string;
  readonly context: Record<string, string | number | boolean | null>;
}

export interface ValidationResult {
  readonly issues: readonly ValidationIssue[];
  readonly hasBlockers: boolean;
  readonly hasWarnings: boolean;
}

function issue(
  severity: IssueSeverity,
  code: string,
  message: string,
  context: Record<string, string | number | boolean | null> = {}
): ValidationIssue {
  return { severity, code, message, context };
}

// ─── Individual validators ────────────────────────────────────────────────────

/**
 * V01: External identifiers must be strings (leading-zero safe).
 * This validates that no contract number or debt ref was accidentally cast to number.
 */
export function validateIdentifierTypes(debts: readonly Debt[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const d of debts) {
    if (d.contractNumber !== null && typeof d.contractNumber !== "string") {
      issues.push(
        issue("BLOCKER", "V01_CONTRACT_NUMBER_NOT_STRING",
          "Contract number must always be a string to preserve leading zeros.",
          { debtId: d.debtId })
      );
    }
    if (d.debtIdentityRef !== null && typeof d.debtIdentityRef !== "string") {
      issues.push(
        issue("BLOCKER", "V01_DEBT_ID_NOT_STRING",
          "Debt identity reference must always be a string.",
          { debtId: d.debtId })
      );
    }
  }
  return issues;
}

/**
 * V02: null money must not be treated as 0.
 * Checks that totalDebtCents=null is not silently summed as zero.
 */
export function validateMoneyNullVsZero(debts: readonly Debt[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const d of debts) {
    if (d.totalDebtCents === null) {
      issues.push(
        issue("WARNING", "V02_TOTAL_DEBT_UNKNOWN",
          "Debt total amount is null (unknown). Do not treat as zero in aggregations.",
          { debtId: d.debtId, creditorKey: d.creditorKey })
      );
    }
  }
  return issues;
}

/**
 * V03: CREDITOR_COLLATERAL_VALUE must never produce or supplement MARKET_VALUE_ESTIMATE.
 */
export function validatePropertyValueTypeSeparation(
  evidences: readonly PropertyValueEvidence[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Group by property
  const byProperty = new Map<string, PropertyValueEvidence[]>();
  for (const e of evidences) {
    const existing = byProperty.get(e.propertyId) ?? [];
    existing.push(e);
    byProperty.set(e.propertyId, existing);
  }

  for (const [propertyId, evs] of byProperty) {
    const hasMarket = evs.some((e) => e.valueType === "MARKET_VALUE_ESTIMATE");
    const hasCreditorCollateral = evs.some(
      (e) => e.valueType === "CREDITOR_COLLATERAL_VALUE"
    );
    const hasLiquidation = evs.some(
      (e) => e.valueType === "LIQUIDATION_OR_AUCTION_VALUE"
    );

    if (!hasMarket) {
      issues.push(
        issue("WARNING", "V03_MISSING_MARKET_VALUE",
          "No documented market value for property. Market value must remain null; " +
          "do not fall back to creditor collateral or auction value.",
          { propertyId, hasCreditorCollateral, hasLiquidation })
      );
    }

    if (hasLiquidation && hasMarket) {
      // This is OK — just verify they're stored separately (they are by type)
    }
  }
  return issues;
}

/**
 * V04: A property referenced in multiple CollateralLinks is still one unique property.
 * Flags if the same propertyId appears in >1 link without explicit awareness.
 */
export function validateNoPropertyDoubleCounting(
  collateralLinks: readonly CollateralLink[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const propertyDebtCount = new Map<string, Set<string>>();

  for (const link of collateralLinks) {
    const existing = propertyDebtCount.get(link.propertyId) ?? new Set<string>();
    link.coveredDebtIds.forEach((id: string) => existing.add(id));
    propertyDebtCount.set(link.propertyId, existing);
  }

  for (const [propertyId, debtIds] of propertyDebtCount) {
    if (debtIds.size > 1) {
      issues.push(
        issue("INFO", "V04_PROPERTY_COVERS_MULTIPLE_DEBTS",
          "Property appears in multiple collateral links covering different debts. " +
          "Do not double-count this property when computing aggregate coverage.",
          { propertyId, coveredDebtCount: debtIds.size })
      );
    }
  }
  return issues;
}

/**
 * V05: Co-debtor must be linked per specific debt, not assumed to cover all debts.
 * Validates that DebtPartyRole.debtId references are specific.
 */
export function validateDebtPersonMappingCompleteness(
  debtPartyRoles: readonly DebtPartyRole[],
  debts: readonly Debt[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const debtIds = new Set(debts.map((d) => d.debtId));
  const coDebtorDebtIds = new Map<string, Set<string>>();

  for (const role of debtPartyRoles) {
    if (!debtIds.has(role.debtId)) {
      issues.push(
        issue("BLOCKER", "V05_ORPHAN_DEBT_PARTY_ROLE",
          "DebtPartyRole references a debtId that does not exist in the case.",
          { mappingId: role.mappingId, debtId: role.debtId })
      );
    }
    if (role.role === "CO_DEBTOR") {
      const existing = coDebtorDebtIds.get(role.personId) ?? new Set();
      existing.add(role.debtId);
      coDebtorDebtIds.set(role.personId, existing);
    }
  }

  // If a co-debtor is linked to ALL debts, raise an informational note
  for (const [personId, linkedDebtIds] of coDebtorDebtIds) {
    if (linkedDebtIds.size === debts.length && debts.length > 1) {
      issues.push(
        issue("INFO", "V05_CO_DEBTOR_COVERS_ALL_DEBTS",
          "Co-debtor is linked to all debts. Verify this is intentional per source, " +
          "not an import default.",
          { personId, debtCount: debts.length })
      );
    }
  }

  return issues;
}

/**
 * V06: Ownership percentages per property should not exceed 100%.
 */
export function validateOwnershipPercentages(
  ownerships: readonly PropertyOwnership[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byProperty = new Map<string, number[]>();

  for (const o of ownerships) {
    if (o.ownershipPercentage !== null) {
      const existing = byProperty.get(o.propertyId) ?? [];
      existing.push(o.ownershipPercentage);
      byProperty.set(o.propertyId, existing);
    }
  }

  for (const [propertyId, percentages] of byProperty) {
    const total = percentages.reduce((a, b) => a + b, 0);
    if (total > 100) {
      issues.push(
        issue("BLOCKER", "V06_OWNERSHIP_EXCEEDS_100_PERCENT",
          `Ownership percentages for property sum to ${total}%, which exceeds 100%.`,
          { propertyId, totalPercentage: total })
      );
    }
  }
  return issues;
}

/**
 * V07: Manually entered critical values must have a source reference.
 */
export function validateSourceTraceRequirement(
  evidences: readonly PropertyValueEvidence[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const e of evidences) {
    if (
      e.valueType === "MARKET_VALUE_ESTIMATE" &&
      e.sourceRef?.sourceType === "MANUAL_ENTRY" &&
      e.verificationStatus === "UNVERIFIED"
    ) {
      issues.push(
        issue("WARNING", "V07_UNVERIFIED_MANUAL_MARKET_VALUE",
          "Manually entered market value is unverified. Confirmation is required.",
          { propertyId: e.propertyId })
      );
    }
  }
  return issues;
}

/**
 * V08: Training-safe projection must not contain PII fields.
 * Checks the projection object's string fields for suspicious patterns.
 */
export function validateTrainingSafeProjectionNoPII(
  projection: TrainingSafeCaseProjection
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Patterns that suggest PII leakage
  const piiPatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\b\d{9}\b/, label: "9-digit AFM" },
    { pattern: /\bGR\d{2}[0-9A-Z]{22}\b/i, label: "IBAN" },
    { pattern: /\bIBAN\b/i, label: "IBAN keyword" },
  ];

  function checkString(value: string, fieldPath: string): void {
    for (const { pattern, label } of piiPatterns) {
      if (pattern.test(value)) {
        issues.push(
          issue("BLOCKER", "V08_PII_LEAK_IN_PROJECTION",
            `Training-safe projection field "${fieldPath}" appears to contain ${label}. ` +
            "Strip all PII before projection.",
            { fieldPath, piiType: label })
        );
      }
    }
  }

  // Check area labels
  for (let i = 0; i < projection.properties.length; i++) {
    const p = projection.properties[i];
    if (p && p.areaLabel) checkString(p.areaLabel, `properties[${i}].areaLabel`);
  }

  // Check creditor keys (should never be a raw AFM)
  for (let i = 0; i < projection.debts.length; i++) {
    const d = projection.debts[i];
    if (d) checkString(d.creditorKey, `debts[${i}].creditorKey`);
  }

  return issues;
}

// ─── Composite case validator ─────────────────────────────────────────────────

/**
 * Run all validators against a full ExtrajudicialCase.
 * Returns a consolidated ValidationResult.
 */
export function validateCase(c: ExtrajudicialCase): ValidationResult {
  const allIssues: ValidationIssue[] = [
    ...validateIdentifierTypes(c.debts),
    ...validateMoneyNullVsZero(c.debts),
    ...validatePropertyValueTypeSeparation(c.propertyValueEvidences),
    ...validateNoPropertyDoubleCounting(c.collateralLinks),
    ...validateDebtPersonMappingCompleteness(c.debtPartyRoles, c.debts),
    ...validateOwnershipPercentages(c.propertyOwnerships),
    ...validateSourceTraceRequirement(c.propertyValueEvidences),
  ];

  return {
    issues: allIssues,
    hasBlockers: allIssues.some((i) => i.severity === "BLOCKER"),
    hasWarnings: allIssues.some((i) => i.severity === "WARNING"),
  };
}
