/**
 * ExoPredict PRO — Shared Primitives
 * Step 1: Domain Foundation
 *
 * Rules:
 * - Money is always integer cents (never float).
 * - null means unknown/unavailable; 0 means explicitly zero.
 * - External identifiers (contract numbers, AFM, debt IDs) are always string.
 * - Dates are ISO 8601 strings (YYYY-MM-DD).
 */

/** Money in integer euro cents. null = unknown. 0 = explicitly zero. */
export type MoneyAmount = number | null;

/** ISO 8601 date string, e.g. "2024-03-15" */
export type ISODateString = string;

/** Currency code (ISO 4217) */
export type CurrencyCode = "EUR" | "USD" | string;

/** Opaque branded ID — prevents mixing up different entity IDs */
export type CaseId = string & { readonly _brand: "CaseId" };
export type PersonId = string & { readonly _brand: "PersonId" };
export type DebtId = string & { readonly _brand: "DebtId" };
export type PropertyId = string & { readonly _brand: "PropertyId" };
export type CollateralId = string & { readonly _brand: "CollateralId" };
export type OwnershipId = string & { readonly _brand: "OwnershipId" };

export function makeCaseId(s: string): CaseId { return s as CaseId; }
export function makePersonId(s: string): PersonId { return s as PersonId; }
export function makeDebtId(s: string): DebtId { return s as DebtId; }
export function makePropertyId(s: string): PropertyId { return s as PropertyId; }
export function makeCollateralId(s: string): CollateralId { return s as CollateralId; }
export function makeOwnershipId(s: string): OwnershipId { return s as OwnershipId; }
