/**
 * ExoPredict PRO — PDF Contract Parsed Data Types
 * Step 3: PDF Import Layer
 *
 * These types represent the structured output of parsing a
 * Σύμβαση Αναδιάρθρωσης Ν.4738/2020 PDF.
 *
 * ALL identifiers (contract numbers, debt IDs, ΑΦΜ) are always strings.
 * ALL money is integer euro cents or null.
 * Spread and rates are stored as basis points (integer).
 *
 * This is NOT a domain type — it is the parsed intermediate before
 * being mapped to Debt + ProposalDebtTerms domain objects.
 */

// ─── Πίνακας 5: Οφειλές προς χρηματοδοτικούς φορείς ─────────────────────────

export interface ParsedDebtRow {
  /** ΑΦΜ Χρηματοδοτικού Φορέα — always string */
  readonly creditorAfm: string;
  /** Δικαιούχος της απαίτησης */
  readonly claimantLabel: string | null;
  /** Αριθμός σύμβασης — always string, leading zeros preserved */
  readonly contractNumber: string;
  /** Ταυτότητα Οφειλής — always string */
  readonly debtIdentityRef: string;
  /** Ποσό οφειλής εκτός τόκων υπερημερίας — integer cents */
  readonly principalCents: number | null;
  /** Ποσό τόκων υπερημερίας — integer cents */
  readonly overdueInterestCents: number | null;
  /** Συνολικό ποσό οφειλής — integer cents */
  readonly totalDebtCents: number | null;
  /** Νόμισμα */
  readonly currency: string;
  /** Ρυθμιζόμενη οφειλή */
  readonly isRegulated: boolean;
}

// ─── Πίνακας 6: Συνοφειλέτες ─────────────────────────────────────────────────

export interface ParsedCoDebtorRow {
  /** ΑΦΜ Συνοφειλέτη — always string */
  readonly coDebtorAfm: string;
  /** ΑΦΜ Χρηματοδοτικού Φορέα — always string */
  readonly creditorAfm: string;
  /** Δικαιούχος της απαίτησης */
  readonly claimantLabel: string | null;
}

// ─── Πίνακας 7: Οφειλές συνοφειλέτη ─────────────────────────────────────────

export interface ParsedCoDebtorDebtRow {
  /** ΑΦΜ Συνοφειλέτη */
  readonly coDebtorAfm: string;
  /** Αριθμός σύμβασης */
  readonly contractNumber: string;
  /** Ταυτότητα Οφειλής */
  readonly debtIdentityRef: string;
  /** Συνολικό ποσό οφειλής — cents */
  readonly totalDebtCents: number | null;
}

// ─── Πίνακας 8: Όροι αναδιάρθρωσης ──────────────────────────────────────────

export interface ParsedRestructuringTermRow {
  /** ΑΦΜ Χρηματοδοτικού Φορέα */
  readonly creditorAfm: string;
  /** Δικαιούχος */
  readonly claimantLabel: string | null;
  /** Αριθμός σύμβασης — always string */
  readonly contractNumber: string;
  /** Ταυτότητα Οφειλής — always string */
  readonly debtIdentityRef: string;
  /** Συνολική οφειλή — cents */
  readonly totalDebtCents: number | null;
  /** Ποσό διαγραφής — cents */
  readonly writeOffCents: number | null;
  /** Τελικό ποσό ρύθμισης — cents */
  readonly finalRegulatedCents: number | null;
  /**
   * Επιτόκιο βάσης — 0% means Euribor 3M floor at zero (as per contract).
   * Stored as basis points. 0 = Euribor 3M (floor zero).
   */
  readonly rateBaseBasisPoints: number;
  /**
   * Περιθώριο επιτοκίου — basis points.
   * 300 = 3.00%, 400 = 4.00%
   * 300 = secured (εμπραγμάτως εξασφαλισμένη)
   * 400 = unsecured (ανεξασφάλιστη)
   */
  readonly spreadBasisPoints: number | null;
  /** Διάρκεια αποπληρωμής σε μήνες */
  readonly paymentTermMonths: number | null;
  /**
   * Whether this debt is collateral-secured.
   * Inferred from spread: 300bp = secured, 400bp = unsecured.
   * Stored as explicit flag — never auto-converted, always from source.
   */
  readonly isCollateralSecured: boolean | null;
}

// ─── Παράρτημα Ι: Δοσολόγιο ──────────────────────────────────────────────────

export interface ParsedInstallmentScheduleEntry {
  /** Αριθμός σύμβασης */
  readonly contractNumber: string;
  /** Ταυτότητα Οφειλής */
  readonly debtIdentityRef: string;
  /** Έτος αποπληρωμής (1-based ordinal year, not calendar year) */
  readonly repaymentYear: number;
  /** Μήνες εντός έτους */
  readonly monthsInYear: number;
  /** Ετήσιο ποσό — cents */
  readonly annualAmountCents: number | null;
  /** Μηνιαίο ποσό — cents */
  readonly monthlyAmountCents: number | null;
}

// ─── Full parsed contract ─────────────────────────────────────────────────────

export interface ParsedContractData {
  /** Αρ. Αίτησης / Πρωτ. */
  readonly applicationNumber: string | null;
  /** Ημερομηνία υποβολής αίτησης (ISO) */
  readonly submissionDate: string | null;
  /** Ημερομηνία δημιουργίας εγγράφου (ISO) */
  readonly documentCreatedDate: string | null;

  readonly debtRows: readonly ParsedDebtRow[];
  readonly coDebtorRows: readonly ParsedCoDebtorRow[];
  readonly coDebtorDebtRows: readonly ParsedCoDebtorDebtRow[];
  readonly restructuringTermRows: readonly ParsedRestructuringTermRow[];
  readonly installmentSchedule: readonly ParsedInstallmentScheduleEntry[];

  /** Source filename */
  readonly sourceFilename: string;
  readonly importedAt: string;
}
