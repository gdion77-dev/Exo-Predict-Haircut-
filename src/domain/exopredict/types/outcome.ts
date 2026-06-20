/**
 * ExoPredict PRO — Case Outcome & Training Eligibility
 * Step 1: Domain Foundation
 *
 * CRITICAL RULE:
 * A SIGNED contract does NOT automatically become ELIGIBLE_VERIFIED for training.
 * Eligibility requires explicit human review.
 */

export type CaseOutcomeStatus =
  | "PROPOSAL_ISSUED"
  | "ACCEPTED"
  | "SIGNED"
  | "DECLINED"
  | "WITHDRAWN"
  | "NOT_COMPLETED"
  | "PENDING"
  | "UNKNOWN";

export type TrainingEligibilityStatus =
  | "NOT_REVIEWED"
  | "ELIGIBLE_VERIFIED"
  | "EXCLUDED_INCOMPLETE"
  | "EXCLUDED_UNVERIFIED"
  | "EXCLUDED_SENSITIVE_DATA_ISSUE";

export interface CaseOutcome {
  readonly status: CaseOutcomeStatus;
  /** ISO date of proposal issuance — null if not yet issued */
  readonly proposalIssuedDate: string | null;
  /** ISO date of signing — null if not signed */
  readonly signedDate: string | null;
  /** ISO date outcome was recorded */
  readonly recordedAt: string | null;
  readonly notes: string | null;
}

export interface TrainingCaseEligibility {
  readonly status: TrainingEligibilityStatus;
  /** Reason for exclusion, if applicable */
  readonly exclusionReason: string | null;
  /** ISO timestamp of last review */
  readonly reviewedAt: string | null;
  readonly reviewedBy: string | null;
}
