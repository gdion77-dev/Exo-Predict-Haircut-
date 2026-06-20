/**
 * ExoPredict PRO — Import Result Envelope
 * Step 2: XLS Import Layer
 *
 * Every importer returns an ImportResult<T>.
 * Errors are never thrown — they are collected and returned.
 * The caller decides whether to proceed with partial results.
 */

export interface ImportRowIssue {
  readonly rowIndex: number;
  readonly severity: "BLOCKER" | "WARNING" | "SKIPPED";
  readonly code: string;
  readonly message: string;
  readonly rawValue?: unknown;
}

export interface ImportResult<T> {
  readonly records: readonly T[];
  readonly issues: readonly ImportRowIssue[];
  readonly totalRowsRead: number;
  readonly skippedRows: number;
  readonly sourceFilename: string;
  readonly importedAt: string;
}

export function makeImportResult<T>(
  records: T[],
  issues: ImportRowIssue[],
  totalRows: number,
  sourceFilename: string,
): ImportResult<T> {
  return {
    records,
    issues,
    totalRowsRead: totalRows,
    skippedRows: issues.filter((i) => i.severity === "SKIPPED").length,
    sourceFilename,
    importedAt: new Date().toISOString(),
  };
}

export function rowIssue(
  rowIndex: number,
  severity: ImportRowIssue["severity"],
  code: string,
  message: string,
  rawValue?: unknown,
): ImportRowIssue {
  return { rowIndex, severity, code, message, rawValue };
}
