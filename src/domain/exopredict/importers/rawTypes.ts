/**
 * ExoPredict PRO — Raw XLS Row Types
 * Step 2: XLS Import Layer
 *
 * These interfaces represent the raw data as it comes from the XLS exports,
 * using the EXACT Greek column names confirmed by inspection.
 * They are NOT domain types — they are the input boundary.
 *
 * All values are unknown/string because XLS cells can contain anything.
 * Parsers in each importer validate and convert to domain types.
 */

// ─── incomeXls / incomeHistoryXls ─────────────────────────────────────────────

export interface RawIncomeRow {
  "Α.Φ.Μ.": unknown;
  "Τύπος Μέλους": unknown;
  "Φορολογικό Έτος": unknown;
  "Ετήσιο Ατομικό Εισόδημα": unknown;
}

// ─── assetXls ────────────────────────────────────────────────────────────────

export interface RawAssetRow {
  "ΑΦΜ Πιστωτή / Διαχειριστή": unknown;
  "Επωνυμία Πιστωτή / Διαχειριστή": unknown;
  "Ιδιοκτήτης": unknown;
  "ΑΦΜ Οφειλέτη": unknown;
  "Κωδικός Περιουσιακού Στοιχείου": unknown;
  "Κατηγορία Περιουσιακού Στοιχείου": unknown;
  "Εκτιμώμενη Αξία Περιουσιακού Στοιχείου": unknown;
  "Ένδειξη Ακινήτου": unknown;
  "Διεύθυνση": unknown;
  "Περιοχή": unknown;
  "ΤΚ": unknown;
  "Νομός": unknown;
  "Κωδικός Αντιστοίχισης Περιουσιακού Στοιχείου": unknown;
}

// ─── financialAssetXls ───────────────────────────────────────────────────────

export interface RawFinancialAssetRow {
  "ΑΦΜ Πιστωτή / Διαχειριστή": unknown;
  "Επωνυμία Πιστωτή / Διαχειριστή": unknown;
  "ΑΦΜ Δικαιούχου": unknown;
  "Κωδικός Χρηματοοικονομικού Προϊόντος": unknown;
  "Είδος Χρηματοοικονομικού Προϊόντος": unknown;
  "Αξία Χρηματοοικονομικού Προϊόντος": unknown;
  "Είδος Κατάθεσης": unknown;
  "Ημερομηνία Αποτίμησης": unknown;
  "Νόμισμα": unknown;
  "Κωδικός Αντιστοίχισης Περιουσιακού Στοιχείου": unknown;
  "Υποβλήθηκε/Ακυρώθηκε από:": unknown;
}

// ─── collateralXls ───────────────────────────────────────────────────────────

export interface RawCollateralRow {
  "ΑΦΜ Πιστωτή / Διαχειριστή": unknown;
  "Επωνυμία Πιστωτή / Διαχειριστή": unknown;
  "Ιδιοκτήτης": unknown;
  "Κωδικός Εξασφάλισης": unknown;
  "Ποσό Εξασφάλισης": unknown;
  "Κωδικός Περιουσιακού Στοιχείου": unknown;
  "Είδος Βάρους": unknown;
  "Σειρά Προσημείωσης": unknown;
}

// ─── debtsSymmaryXls ─────────────────────────────────────────────────────────

export interface RawDebtSummaryRow {
  "ΑΦΜ Πιστωτή / Διαχειριστή": unknown;
  "Επωνυμία Πιστωτή / Διαχειριστή": unknown;
  "Ιδιοκτήτης": unknown;
  "Συνολικό ποσό υπαγόμενων οφειλών": unknown;
  "Ποσό βασικής οφειλής": unknown;
  "Ποσό τόκων υπερημερίας": unknown;
  "Προσαυξήσεις": unknown;
  "Πρόστιμο δημοσίου": unknown;
  "Ποσοστό οφειλών": unknown;
  "Συνολικό ποσό μη υπαγόμενων οφειλών": unknown;
  "Συνολικό ποσό οφειλών ρυθμισμένων με Εξωδ/κό Μηχανισμό": unknown;
}
