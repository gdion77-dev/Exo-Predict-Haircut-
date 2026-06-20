/**
 * ExoPredict PRO — Importer Utilities
 * Step 2: XLS Import Layer
 *
 * Pure helper functions used by all importers.
 * No side effects. No I/O. No domain mutations.
 *
 * RULES:
 * - Money parsing always returns integer cents or null. Never float.
 * - null means "could not parse / unknown". 0 means explicitly zero.
 * - External identifiers (ΑΦΜ, codes) always returned as string.
 * - Creditor normalization maps known ΑΦΜ to stable keys.
 */

// ─── Money ────────────────────────────────────────────────────────────────────

/**
 * Parse a Greek-formatted euro string into integer cents.
 * Handles: "€ 130.000,00", "€ 0,00", "130000,00", null, undefined, "".
 * Returns null if value is missing or unparseable.
 * Returns 0 if value explicitly represents zero.
 * NEVER returns a float.
 */
export function parseEuroCents(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;

  const str = String(raw)
    .replace(/€/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")   // remove Greek thousand separators
    .replace(",", ".")     // Greek decimal comma → dot
    .trim();

  if (str === "" || str === "-") return null;

  const parsed = parseFloat(str);
  if (isNaN(parsed)) return null;

  // Round to avoid float imprecision: 130000.00 → 13000000 cents
  return Math.round(parsed * 100);
}

// ─── Strings ─────────────────────────────────────────────────────────────────

/**
 * Ensure external identifiers are always returned as strings.
 * Preserves leading zeros. Returns null for empty/null values.
 */
export function asIdentifierString(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

/**
 * Parse a string that may be a number (from Excel numeric cell) as a string.
 * Used for ΑΦΜ, contract numbers, codes that Excel may auto-cast to number.
 * Pads to minimum length if needed (e.g. ΑΦΜ = 9 digits).
 */
export function asAfm(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).replace(/\s/g, "").trim();
  if (s === "") return null;
  // ΑΦΜ is always 9 digits — pad if Excel dropped leading zero
  if (/^\d+$/.test(s) && s.length < 9) {
    return s.padStart(9, "0");
  }
  return s;
}

// ─── Dates ───────────────────────────────────────────────────────────────────

/**
 * Parse a Greek date string (DD/MM/YYYY) or Excel date serial to ISO date string.
 * Returns null if unparseable.
 */
export function parseGreekDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  // Already a JS Date (from openpyxl/xlsx parsing)
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return raw.toISOString().slice(0, 10);
  }

  const s = String(raw).trim();
  if (s === "") return null;

  // DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  // YYYY-MM-DD passthrough
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  return null;
}

// ─── Tax year ─────────────────────────────────────────────────────────────────

export function parseTaxYear(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = parseInt(String(raw).trim(), 10);
  if (isNaN(n) || n < 1990 || n > 2100) return null;
  return n;
}

// ─── Creditor / Institution normalization ─────────────────────────────────────

/**
 * Map known Greek creditor/servicer ΑΦΜ values to stable normalized keys.
 * Used in training-safe projections (never store raw AFM as key).
 * Unknown ΑΦΜ → "UNKNOWN_CREDITOR_<afm_suffix>"
 */
export const KNOWN_CREDITOR_KEYS: Record<string, string> = {
  "099755919": "DOVALUE_GREECE",
  "094014201": "NATIONAL_BANK_GR",
  "996807331": "ALPHA_BANK_GR",
  "996866969": "EUROBANK_GR",
  "997072577": "EFKA_GR",
  "997073525": "AADE_GR",
};

export function normalizeCreditorKey(afm: string | null): string {
  if (afm === null) return "UNKNOWN_CREDITOR";
  const normalized = asAfm(afm);
  if (normalized && KNOWN_CREDITOR_KEYS[normalized]) {
    return KNOWN_CREDITOR_KEYS[normalized]!;
  }
  // Use only last 4 digits for unknown to avoid storing full ΑΦΜ
  const suffix = normalized ? normalized.slice(-4) : "????";
  return `UNKNOWN_CREDITOR_${suffix}`;
}

// ─── Member type → PersonRole ─────────────────────────────────────────────────

import type { PersonRole } from "../types/person";

const MEMBER_TYPE_MAP: Record<string, PersonRole> = {
  "Αιτών":        "APPLICANT",
  "Σύζυγος":      "SPOUSE_OR_PARTNER",
  "Συνοφειλέτης": "CO_DEBTOR",
  "Εξαρτώμενο":   "DEPENDENT_CHILD",
  "Ανήλικο":      "MINOR_CHILD",
};

export function parseMemberType(raw: unknown): PersonRole {
  const s = String(raw ?? "").trim();
  for (const [key, role] of Object.entries(MEMBER_TYPE_MAP)) {
    if (s.startsWith(key)) return role;
  }
  return "OTHER_RELATED_PERSON";
}

// ─── Asset category ───────────────────────────────────────────────────────────

/**
 * Map Greek asset category string to domain PropertyType.
 * Only maps confirmed values from the export.
 */
export function parsePropertyType(raw: unknown): import("../types/property").PropertyType {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s.includes("ακίνητο") || s.includes("κατοικία")) return "UNKNOWN"; // category determined below
  return "UNKNOWN";
}

// ─── Boolean parsing ──────────────────────────────────────────────────────────

export function parseBoolean(raw: unknown): boolean | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "true" || s === "ναι" || s === "1") return true;
  if (s === "false" || s === "όχι" || s === "0") return false;
  return null;
}

// ─── Percentage string parsing ────────────────────────────────────────────────

export function parsePercentageString(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).replace("%", "").replace(",", ".").trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
