/**
 * ExoPredict PRO — Additional manual fields schema
 *
 * All fields are OPTIONAL. They capture data NOT present in the platform XLS/PDF
 * exports but relevant to the haircut calculation per the Ν.4738/2020 methodology.
 *
 * Each value field has a companion `_evidence` field:
 *   'documented' | 'estimate' | 'unknown'
 */

export const DEBTOR_TYPES = {
  NATURAL: 'NATURAL_PERSON',
  PROFESSIONAL: 'PROFESSIONAL_OR_BUSINESS',
};

export const DEBTOR_TYPE_LABEL = {
  NATURAL_PERSON: 'Φυσικό πρόσωπο',
  PROFESSIONAL_OR_BUSINESS: 'Επαγγελματίας / Επιχείρηση',
};

export const EVIDENCE_STATUS = {
  documented: { label: 'Τεκμηριωμένο', color: 'green', icon: 'ti-file-check' },
  estimate:   { label: 'Εκτίμηση',     color: 'warn',  icon: 'ti-pencil' },
  unknown:    { label: 'Άγνωστο',      color: 'muted', icon: 'ti-question-mark' },
};

/**
 * Default empty additional-fields block attached to a case.
 */
export function emptyAdditionalFields() {
  return {
    debtorType: DEBTOR_TYPES.NATURAL,

    // ── Α. Household ──
    household: {
      minorChildrenCount: null,
      dependentMembersNoIncomeCount: null,
      primaryResidenceIsOwned: null,   // true | false | null
      applicantAge: null,
    },

    // ── Β. Monthly / annual expenses (in cents) ──
    expenses: {
      monthlyRentCents: null,
      monthlyRentCents_evidence: 'unknown',
      permanentMedicalCostsCents: null,
      permanentMedicalCostsCents_evidence: 'unknown',
      courtOrderedAlimonyCents: null,
      courtOrderedAlimonyCents_evidence: 'unknown',
      annualEnfiaCents: null,
      annualEnfiaCents_evidence: 'unknown',
    },

    // ── Δ. Business (only if debtorType = PROFESSIONAL_OR_BUSINESS) ──
    business: {
      annualTurnoverCents: null,
      annualTurnoverCents_evidence: 'unknown',
      annualProfitCents: null,
      annualProfitCents_evidence: 'unknown',
      annualOperatingCostsCents: null,
      annualOperatingCostsCents_evidence: 'unknown',
    },

    // ── Ε. Procedural / creditor-outcome factors ──
    procedural: {
      auctionScheduled: null,          // true | false | null
      auctionDate: null,               // ISO date string
      priorSettlementExists: null,
      priorSettlementDefaulted: null,
      activeCreditExists: null,
      recentRestructureExists: null,
      allRelevantPartiesParticipate: null,
      creditorRejectionReason: null,   // free text
    },

    // ── Per-property value fields (keyed by propertyId) ──
    // { [propertyId]: { objectiveOrEnfiaValueCents, objectiveOrEnfiaValueCents_evidence,
    //                   independentEstimateCents, independentEstimateCents_evidence,
    //                   auctionValueCents, auctionValueCents_evidence } }
    propertyValues: {},

    lastEditedAt: null,
  };
}

/**
 * Liquidation value per methodology:
 *   max( objective/ENFIA value , creditorBookValue − 3% )
 * Returns cents or null if no data.
 */
export function computeLiquidationValue({ objectiveOrEnfiaValueCents, creditorBookValueCents }) {
  const enfia = typeof objectiveOrEnfiaValueCents === 'number' ? objectiveOrEnfiaValueCents : null;
  const book  = typeof creditorBookValueCents === 'number'
    ? Math.round(creditorBookValueCents * 0.97)
    : null;

  if (enfia === null && book === null) return null;
  if (enfia === null) return book;
  if (book === null) return enfia;
  return Math.max(enfia, book);
}

/**
 * Debt composition components (cents). Different max-writeoff caps apply per component.
 */
export const DEBT_COMPONENTS = [
  { key: 'principalCents',          label: 'Βασική οφειλή' },
  { key: 'overdueInterestCents',    label: 'Τόκοι υπερημερίας' },
  { key: 'contractualInterestCents',label: 'Συμβατικοί τόκοι' },
  { key: 'surchargesCents',         label: 'Προσαυξήσεις' },
  { key: 'penaltiesCents',          label: 'Πρόστιμα' },
  { key: 'withheldTaxesCents',      label: 'Παρακρατούμενοι/επιρριπτόμενοι φόροι' },
  { key: 'socialContributionsCents',label: 'Ασφαλιστικές εισφορές' },
  { key: 'expensesCents',           label: 'Έξοδα' },
];

/** Max write-off caps per component & creditor type (informational, from ΚΥΑ). */
export const WRITEOFF_CAPS = {
  PUBLIC: { principal: 0.75, surcharges: 0.85, penalties: 0.95, interest: 1.00 },
  BANK:   { principal: 0.80, interest: 1.00 },
};
