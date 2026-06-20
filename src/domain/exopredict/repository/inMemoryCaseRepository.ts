/**
 * ExoPredict PRO — In-Memory Case Repository
 * Step 4: Case Assembly
 *
 * Simple, pure in-memory store for ExtrajudicialCase objects.
 * No persistence, no database, no I/O.
 *
 * Supports:
 *   - add / replace / get / list
 *   - export to training-safe JSON dataset
 *   - export to full JSON (for case management — includes PII container)
 *
 * PRIVACY:
 *   - exportTrainingSafeDataset() strips all PII via projectTrainingSafe()
 *   - exportFullJson() retains PII — for case management use only
 *     (never send to training pipeline)
 */

import type { ExtrajudicialCase } from "../types/case";
import type { CaseId } from "../types/primitives";
import type { TrainingSafeCaseProjection } from "../types/projection";
import { projectTrainingSafe } from "../types/projection";
import { validateCase } from "../validators";
import type { ValidationResult } from "../validators";
import type { TrainingEligibilityStatus } from "../types/outcome";

// ─── Repository ───────────────────────────────────────────────────────────────

export class InMemoryCaseRepository {
  private readonly store = new Map<string, ExtrajudicialCase>();

  /** Add or replace a case. Returns false if case already exists (use replace). */
  add(c: ExtrajudicialCase): boolean {
    if (this.store.has(c.caseId)) return false;
    this.store.set(c.caseId, c);
    return true;
  }

  /** Replace existing case. Returns false if case does not exist (use add). */
  replace(c: ExtrajudicialCase): boolean {
    if (!this.store.has(c.caseId)) return false;
    this.store.set(c.caseId, c);
    return true;
  }

  /** Upsert — add or replace without checking. */
  upsert(c: ExtrajudicialCase): void {
    this.store.set(c.caseId, c);
  }

  get(caseId: CaseId): ExtrajudicialCase | null {
    return this.store.get(caseId) ?? null;
  }

  list(): readonly ExtrajudicialCase[] {
    return Array.from(this.store.values());
  }

  count(): number {
    return this.store.size;
  }

  /** Mark a case's training eligibility. Requires explicit reviewer. */
  setTrainingEligibility(
    caseId: CaseId,
    status: TrainingEligibilityStatus,
    reviewedBy: string,
    exclusionReason: string | null = null,
  ): boolean {
    const existing = this.store.get(caseId);
    if (!existing) return false;
    const updated: ExtrajudicialCase = {
      ...existing,
      trainingEligibility: {
        status,
        exclusionReason,
        reviewedAt: new Date().toISOString(),
        reviewedBy,
      },
    };
    this.store.set(caseId, updated);
    return true;
  }

  /** Validate all cases. Returns map of caseId → ValidationResult. */
  validateAll(): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();
    for (const [id, c] of this.store) {
      results.set(id, validateCase(c));
    }
    return results;
  }

  // ─── Exports ──────────────────────────────────────────────────────────────

  /**
   * Export training-safe projections for ELIGIBLE_VERIFIED cases only.
   * Strips all PII. Safe for ML pipeline.
   */
  exportTrainingSafeDataset(): readonly TrainingSafeCaseProjection[] {
    const eligible = Array.from(this.store.values()).filter(
      (c) => c.trainingEligibility.status === "ELIGIBLE_VERIFIED",
    );
    return eligible.map(projectTrainingSafe);
  }

  /**
   * Export ALL cases as training-safe projections (regardless of eligibility).
   * Still strips PII. Used for analysis/review — NOT for training.
   */
  exportAllProjections(): readonly TrainingSafeCaseProjection[] {
    return Array.from(this.store.values()).map(projectTrainingSafe);
  }

  /**
   * Export a single case as training-safe JSON string.
   * Returns null if case not found.
   */
  exportCaseProjectionJson(caseId: CaseId): string | null {
    const c = this.store.get(caseId);
    if (!c) return null;
    return JSON.stringify(projectTrainingSafe(c), null, 2);
  }

  /**
   * Export full case as JSON (includes PII container).
   * FOR CASE MANAGEMENT USE ONLY — never send to training pipeline.
   */
  exportFullCaseJson(caseId: CaseId): string | null {
    const c = this.store.get(caseId);
    if (!c) return null;
    return JSON.stringify(c, null, 2);
  }

  /**
   * Export training-safe dataset as JSON string.
   * Only includes ELIGIBLE_VERIFIED cases.
   */
  exportTrainingSafeDatasetJson(): string {
    return JSON.stringify(this.exportTrainingSafeDataset(), null, 2);
  }

  /** Summary stats — no PII. */
  stats(): {
    total: number;
    byOutcomeStatus: Record<string, number>;
    byEligibility: Record<string, number>;
    eligibleVerifiedCount: number;
  } {
    const cases = Array.from(this.store.values());
    const byOutcome: Record<string, number> = {};
    const byEligibility: Record<string, number> = {};

    for (const c of cases) {
      byOutcome[c.outcome.status] = (byOutcome[c.outcome.status] ?? 0) + 1;
      byEligibility[c.trainingEligibility.status] = (byEligibility[c.trainingEligibility.status] ?? 0) + 1;
    }

    return {
      total: cases.length,
      byOutcomeStatus: byOutcome,
      byEligibility,
      eligibleVerifiedCount: byEligibility["ELIGIBLE_VERIFIED"] ?? 0,
    };
  }
}
