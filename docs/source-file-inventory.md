# ExoPredict PRO — Source File Inventory

> **Σημείωση**: Αυτό το αρχείο περιγράφει μόνο την **αναμενόμενη δομή** των source exports
> που χρησιμοποιεί ο εξωδικαστικός μηχανισμός (Ν.4738/2020).
> Δεν περιέχει πραγματικά προσωπικά ή οικονομικά δεδομένα.
> Τα mappings στηλών θα επιβεβαιωθούν κατά την υλοποίηση του importer (Step 2).

---

## Κατηγορίες Source Files

### 1. `INCOME_EXPORT` — Εισοδήματα τρέχοντος έτους

**Αναμενόμενη μορφή**: `.xls` / `.xlsx`

**Πιθανές ομάδες δεδομένων** (χωρίς επιβεβαίωση mappings):
- Ταυτοποιητικό εγγραφής
- Πρόσωπο (χωρίς PII στο domain layer)
- Κατηγορία εισοδήματος
- Περιοδικότητα
- Καθαρό / Μικτό ποσό
- Φορολογικό έτος
- Ημερομηνία αναφοράς

**Domain type**: `IncomeRecord`

---

### 2. `INCOME_HISTORY_EXPORT` — Ιστορικό εισοδημάτων

**Αναμενόμενη μορφή**: `.xls` / `.xlsx`

**Πιθανές ομάδες δεδομένων**:
- Πολλαπλά φορολογικά έτη
- Ίδια δομή με `INCOME_EXPORT`

**Domain type**: `IncomeRecord[]` (πολλά έτη)

---

### 3. `ASSET_EXPORT` — Ακίνητα και ιδιοκτησία

**Αναμενόμενη μορφή**: `.xls` / `.xlsx`

**Πιθανές ομάδες δεδομένων**:
- KAEK ακινήτου (string, leading-zero safe)
- Τύπος ακινήτου
- Γεωγραφική περιοχή (μη αναγνωριστικό label)
- Ποσοστό ιδιοκτησίας ανά πρόσωπο
- Αντικειμενική αξία (AADE)

**Domain types**: `Property`, `PropertyOwnership`, `PropertyValueEvidence` (OBJECTIVE_VALUE)

---

### 4. `FINANCIAL_ASSET_EXPORT` — Χρηματοοικονομικά στοιχεία

**Αναμενόμενη μορφή**: `.xls` / `.xlsx`

**Πιθανές ομάδες δεδομένων**:
- Τύπος στοιχείου (κατάθεση, επένδυση κ.ά.)
- Πρόσωπο/α δικαιούχοι
- Υπόλοιπο σε EUR
- Ημερομηνία αναφοράς
- Ίδρυμα (normalized key — χωρίς IBAN)

**Domain type**: `FinancialAsset`

---

### 5. `COLLATERAL_EXPORT` — Εξασφαλίσεις

**Αναμενόμενη μορφή**: `.xls` / `.xlsx`

**Πιθανές ομάδες δεδομένων**:
- Αναφορά ακινήτου (KAEK ή εσωτερικό ID)
- Αξία εξασφάλισης πιστωτή (`CREDITOR_COLLATERAL_VALUE`)
- Σύνδεση με οφειλή/ές
- Προτεραιότητα εγγραφής (τάξη υποθήκης)

**Domain types**: `PropertyValueEvidence` (CREDITOR_COLLATERAL_VALUE), `CollateralLink`

> ⚠️ **Κρίσιμο**: Η αξία εξασφάλισης πιστωτή ΔΕΝ είναι εμπορική αξία.
> Δεν επιτρέπεται fallback ή conversion.

---

### 6. `DEBTS_SUMMARY_EXPORT` — Συνοπτική κατάσταση οφειλών

**Αναμενόμενη μορφή**: `.xls` / `.xlsx`

**Πιθανές ομάδες δεδομένων**:
- Αριθμός σύμβασης (string — leading-zero safe)
- Ταυτότητα οφειλής (string)
- Πιστωτής / servicer (normalized key)
- Κεφάλαιο, τόκοι, σύνολο (integer cents)
- Κατηγορία οφειλής (μόνο όταν επιβεβαιώνεται)
- Συμμετοχή στη ρύθμιση (flag)

**Domain type**: `Debt`

> ⚠️ **Κρίσιμο**: Αριθμοί σύμβασης και ταυτότητες οφειλών αποθηκεύονται πάντα ως string.

---

### 7. `PROPOSAL_OR_CONTRACT_PDF` — Πρόταση / Σύμβαση

**Αναμενόμενη μορφή**: `.pdf`

**Πιθανές ομάδες δεδομένων**:
- Όροι ρύθμισης ανά οφειλή
- Ποσό διαγραφής ανά οφειλή
- Τελικό ποσό ρύθμισης
- Επιτόκιο (fixed / floating / base + spread)
- Διάρκεια σε μήνες
- Ημερομηνία πρότασης / υπογραφής

**Domain type**: `ProposalDebtTerms[]`

---

## Αρχεία που δεν επιβεβαιώθηκαν

Τα παρακάτω δείγματα δεν έχουν γίνει inspect στο παρόν βήμα:
- `incomeXls.xls`
- `incomeHistoryXls.xls`
- `assetXls.xls`
- `financialAssetXls.xls`
- `collateralXls.xls`
- `debtsSymmaryXls.xls`
- `debt_restructure_contract.pdf`

Τα column mappings, ονόματα φύλλων και ερμηνεία πεδίων **δεν μπορούν να υποτεθούν** πριν από την inspection του Step 2.

---

## Κανόνες Ασφάλειας Δεδομένων

- Πραγματικά ΑΦΜ, ονόματα, διευθύνσεις, IBAN, αριθμοί συμβάσεων **δεν** αποθηκεύονται στο domain layer εκτός από το optional `PrivateIdentity` container
- Το `PrivateIdentity` δεν συμπεριλαμβάνεται ποτέ στο `TrainingSafeCaseProjection`
- Τα filenames αναφέρονται ως anonymized refs στο `SourceFileManifest`
