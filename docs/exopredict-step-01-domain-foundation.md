# ExoPredict PRO — Step 01: Domain Foundation

## Scope

Αυτό το βήμα υλοποιεί αποκλειστικά το **canonical domain layer** για την οργάνωση υποθέσεων εξωδικαστικού μηχανισμού (Ν.4738/2020). Δεν υπάρχει UI, persistence, importer, ML ή οικονομικός/νομικός υπολογισμός.

---

## Entities & Σχέσεις

### ExtrajudicialCase (Aggregate Root)

Κεντρική οντότητα. Περιέχει ως readonly arrays:

| Field | Τύπος | Σημείωση |
|---|---|---|
| `persons` | `Person[]` | Πρόσωπα υπόθεσης |
| `household` | `HouseholdAggregate` | Ανώνυμα aggregates νοικοκυριού |
| `incomes` | `IncomeRecord[]` | Εισοδήματα ανά πρόσωπο |
| `financialAssets` | `FinancialAsset[]` | Χρηματοοικονομικά στοιχεία |
| `properties` | `Property[]` | Ακίνητα |
| `propertyOwnerships` | `PropertyOwnership[]` | Ιδιοκτησία ανά πρόσωπο/ακίνητο |
| `propertyValueEvidences` | `PropertyValueEvidence[]` | Αξίες ανά τύπο |
| `collateralLinks` | `CollateralLink[]` | Εξασφαλίσεις ανά οφειλή |
| `debts` | `Debt[]` | Οφειλές |
| `debtPartyRoles` | `DebtPartyRole[]` | Ρόλοι προσώπων ανά οφειλή |
| `proposalTerms` | `ProposalDebtTerms[]` | Όροι ρύθμισης ανά οφειλή |
| `outcome` | `CaseOutcome` | Έκβαση υπόθεσης |
| `trainingEligibility` | `TrainingCaseEligibility` | Κατάσταση training eligibility |

### Person

- Ρόλοι: `APPLICANT`, `SPOUSE_OR_PARTNER`, `DEPENDENT_CHILD`, `MINOR_CHILD`, `CO_DEBTOR`, `GUARANTOR`, `THIRD_PARTY_COLLATERAL_PROVIDER`, `CO_BENEFICIARY_FINANCIAL_ASSET`, `OTHER_RELATED_PERSON`
- Τα PII (`fullName`, `afm`, `address`, `dateOfBirth`) βρίσκονται αποκλειστικά στο optional `PrivateIdentity` — **ποτέ** στο projection

### DebtPartyRole

- Κάθε mapping είναι **ανά οφειλή** — ο συνοφειλέτης δεν συνδέεται αυτόματα με όλες τις οφειλές
- Ξεχωριστοί ρόλοι: `CO_DEBTOR` ≠ `GUARANTOR` ≠ `THIRD_PARTY_COLLATERAL_PROVIDER`

### PropertyValueEvidence

Τέσσερις ξεχωριστοί τύποι αξίας:
- `OBJECTIVE_VALUE` — AADE αντικειμενική αξία
- `CREDITOR_COLLATERAL_VALUE` — εκτίμηση πιστωτή (≠ εμπορική αξία)
- `MARKET_VALUE_ESTIMATE` — τεκμηριωμένη εμπορική αξία
- `LIQUIDATION_OR_AUCTION_VALUE` — τιμή πλειστηριασμού

### CollateralLink

- Ένα ακίνητο → πολλές οφειλές (many-to-many)
- Κανόνας μη διπλομέτρησης: ένα `Property` record, πολλοί `CollateralLink`

---

## Invariants (Αμεταβλητοί Κανόνες)

1. **Money**: Integer euro cents. `null` = άγνωστο. `0` = ρητά μηδέν. Ποτέ float.
2. **String identifiers**: ΑΦΜ, αριθμοί συμβάσεων, ταυτότητες οφειλών — πάντα `string`.
3. **No market-value fallback**: `CREDITOR_COLLATERAL_VALUE` → `MARKET_VALUE_ESTIMATE` απαγορεύεται.
4. **Per-debt proposal terms**: Οι όροι ρύθμισης αποθηκεύονται ανά οφειλή, όχι μόνο aggregate.
5. **SIGNED ≠ ELIGIBLE_VERIFIED**: Απαιτείται ρητή ανθρώπινη κριτική για training eligibility.
6. **Source traceability**: Κάθε εγγραφή έχει `SourceReference` με verification status.
7. **No silent repair**: Οι validators επιστρέφουν issues — δεν «διορθώνουν» δεδομένα.

---

## Ρητές Απαγορεύσεις (Step 1)

- Machine learning, prediction, scoring, similarity
- Υπολογισμός κουρέματος, δόσης, επιτοκίου, βιωσιμότητας
- Κανόνες/υπολογισμοί Ν.4738/2020
- XLS/PDF importer, OCR
- UI, persistence, database, backend, API, authentication
- PDF/Excel exports
- Πραγματικά προσωπικά δεδομένα σε fixtures/tests/docs

---

## Επόμενο Βήμα (Step 2)

- XLS importer για `INCOME_EXPORT`, `DEBTS_SUMMARY_EXPORT` κ.ά.
- PDF parser για `PROPOSAL_OR_CONTRACT_PDF`
- Case repository (in-memory ή persistent)
- Export σε training-safe JSON dataset
- Aggregate analytics (ανώνυμα)
