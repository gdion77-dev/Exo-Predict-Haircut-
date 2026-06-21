/**
 * ExoPredict PRO — Contract PDF Parser
 * 
 * Strategy: Send PDF to Claude API which reads it natively and returns
 * structured JSON. No regex, no brittle parsing, no server needed.
 * Claude understands the Greek table structure perfectly.
 */

function parseMoney(s) {
  if (!s) return null;
  const clean = String(s)
    .replace(/€/g, '').replace(/\s/g, '')
    .replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(clean);
  return isNaN(n) ? null : Math.round(n * 100);
}

function parseGreekDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/**
 * Parse contract PDF using Claude API (base64 document)
 */
export async function parseContractPdfWithClaude(file) {
  // Convert PDF to base64
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
  const base64 = btoa(binary);

  const prompt = `Αυτό είναι μια Σύμβαση Αναδιάρθρωσης Οφειλών βάσει Ν.4738/2020.

Εξήγαγε ακριβώς τα παρακάτω δεδομένα σε JSON format.
ΚΑΝΟΝΑΣ: Επίστρεψε ΜΟΝΟ το JSON object, χωρίς καμία άλλη λέξη.

{
  "applicationNumber": "string ή null",
  "submissionDate": "DD/MM/YYYY ή null",
  "creditorAfm": "string ή null",
  "claimantLabel": "string ή null",
  "debts": [
    {
      "contractNumber": "string — ακριβώς όπως εμφανίζεται, χωρίς κενά",
      "debtIdentityRef": "string — 13ψήφιος κωδικός",
      "principalCents": number_in_cents_integer,
      "overdueInterestCents": number_in_cents_integer,
      "totalDebtCents": number_in_cents_integer,
      "isRegulated": true
    }
  ],
  "coDebtorDebtRefs": ["debtIdentityRef1", "debtIdentityRef2"],
  "restructuringTerms": [
    {
      "debtIdentityRef": "string",
      "contractNumber": "string",
      "totalDebtCents": integer,
      "writeOffCents": integer,
      "finalRegulatedCents": integer,
      "spreadBasisPoints": integer,
      "paymentTermMonths": integer
    }
  ],
  "installments": [
    {
      "debtIdentityRef": "string",
      "annualAmountCents": integer,
      "monthlyAmountCents": integer
    }
  ],
  "publicDebts": [
    {
      "creditorType": "AADE ή EFKA",
      "principalRegulatableCents": integer,
      "principalNonRegulatableCents": integer,
      "penaltyPrincipalCents": integer,
      "surchargesCents": integer,
      "totalRegulatedCents": integer,
      "writeOffCents": integer,
      "amountToRegulateCents": integer,
      "payableInterestCents": integer,
      "totalPaymentCents": integer
    }
  ]
}

ΣΗΜΕΙΩΣΕΙΣ:
- Τα ποσά σε cents (πολλαπλασίασε επί 100, π.χ. €115.638,36 = 11563836)
- contractNumber: αφαίρεσε τα κενά/newlines και ένωσε τα δύο μέρη (π.χ. "0000000000369\\n0018856" → "00000000003690018856")
- coDebtorDebtRefs: τα debtIdentityRef από τον Πίνακα 7
- installments: μία εγγραφή ανά οφειλή (χρησιμοποίησε έτος=1)
- spreadBasisPoints: 3,00% = 300, 4,00% = 400
- debts/restructuringTerms: ΜΟΝΟ από Πίνακες 5 και 8 (τράπεζες/servicers)
- publicDebts: από Πίνακα 9α (ΑΑΔΕ/Δημόσιο, creditorType="AADE") και Πίνακα 9β (ΕΦΚΑ, creditorType="EFKA"). Αν ένας πίνακας λέει "Δεν υπάρχουν στοιχεία", ΜΗΝ τον συμπεριλάβεις. Στήλες 9α: "Βασική οφειλή με δυνατότητα διαγραφής"→principalRegulatableCents, "Βασική οφειλή χωρίς δυνατότητα διαγραφής"→principalNonRegulatableCents, "Βασική οφειλή από πρόστιμα"→penaltyPrincipalCents, "Προσαυξήσεις"→surchargesCents, "Σύνολο ρυθμιζόμενης οφειλής"→totalRegulatedCents, "Ποσό διαγραφής/απαλλαγής"→writeOffCents, "Ποσό οφειλής προς ρύθμιση"→amountToRegulateCents, "Πληρωτέος τόκος"→payableInterestCents, "Συνολικό ποσό πληρωμής"→totalPaymentCents`;

  const response = await fetch('https://exopredict-proxy.gdion77.workers.dev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 }
          },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} — ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Parse JSON — strip any markdown fences
  const clean = rawText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  return parsed;
}

/**
 * Build case-ready data from Claude's parsed output
 */
export function buildContractData(parsed) {
  return {
    applicationNumber: parsed.applicationNumber || null,
    submissionDate: parseGreekDate(parsed.submissionDate),
    creditorAfm: parsed.creditorAfm || '099755919',
    creditorKey: 'DOVALUE_GREECE',
    claimantLabel: parsed.claimantLabel || null,
    debts: (parsed.debts || []).map(d => ({
      debtId: `DEBT-PDF-${d.debtIdentityRef}`,
      contractNumber: String(d.contractNumber || '').replace(/\s/g, ''),
      debtIdentityRef: String(d.debtIdentityRef || ''),
      principalCents: typeof d.principalCents === 'number' ? d.principalCents : null,
      overdueInterestCents: typeof d.overdueInterestCents === 'number' ? d.overdueInterestCents : null,
      totalDebtCents: typeof d.totalDebtCents === 'number' ? d.totalDebtCents : null,
      currency: 'EUR',
      isRegulated: true,
      creditorKey: 'DOVALUE_GREECE',
      claimantLabel: parsed.claimantLabel || null,
    })),
    coDebtorDebtRefs: parsed.coDebtorDebtRefs || [],
    restructuringTerms: (parsed.restructuringTerms || []).map(t => ({
      debtId: `DEBT-PDF-${t.debtIdentityRef}`,
      debtIdentityRef: String(t.debtIdentityRef || ''),
      contractNumber: String(t.contractNumber || '').replace(/\s/g, ''),
      totalDebtCents: typeof t.totalDebtCents === 'number' ? t.totalDebtCents : null,
      writeOffCents: typeof t.writeOffCents === 'number' ? t.writeOffCents : null,
      finalRegulatedCents: typeof t.finalRegulatedCents === 'number' ? t.finalRegulatedCents : null,
      spreadBasisPoints: typeof t.spreadBasisPoints === 'number' ? t.spreadBasisPoints : null,
      paymentTermMonths: typeof t.paymentTermMonths === 'number' ? t.paymentTermMonths : null,
      isCollateralSecured: t.spreadBasisPoints === 300,
      rateBase: 'EURIBOR_3M',
    })),
    installments: (parsed.installments || []).map(i => ({
      debtId: `DEBT-PDF-${i.debtIdentityRef}`,
      debtIdentityRef: String(i.debtIdentityRef || ''),
      annualAmountCents: typeof i.annualAmountCents === 'number' ? i.annualAmountCents : null,
      monthlyAmountCents: typeof i.monthlyAmountCents === 'number' ? i.monthlyAmountCents : null,
    })),
    publicDebts: (parsed.publicDebts || []).map((pd, idx) => ({
      debtId: `DEBT-PUBLIC-${pd.creditorType || idx}`,
      creditorType: pd.creditorType === 'EFKA' ? 'EFKA_GR' : 'AADE_GR',
      creditorKey: pd.creditorType === 'EFKA' ? 'EFKA_GR' : 'AADE_GR',
      principalRegulatableCents: num(pd.principalRegulatableCents),
      principalNonRegulatableCents: num(pd.principalNonRegulatableCents),
      penaltyPrincipalCents: num(pd.penaltyPrincipalCents),
      surchargesCents: num(pd.surchargesCents),
      totalRegulatedCents: num(pd.totalRegulatedCents),
      writeOffCents: num(pd.writeOffCents),
      amountToRegulateCents: num(pd.amountToRegulateCents),
      payableInterestCents: num(pd.payableInterestCents),
      totalPaymentCents: num(pd.totalPaymentCents),
    })),
  };
}

function num(v) { return typeof v === 'number' ? v : null; }

/**
 * Assemble full ExtrajudicialCase from all parsed sources
 */
export function assembleCaseFromParsed({
  incomeRecords,
  incomeHistoryRecords,
  assetData,
  financialAssets,
  collateralLinks,
  contractData,
  propertyTaxData,
}) {
  const now = new Date().toISOString();

  // Build persons from income records
  const afmToRole = {};
  const allIncomeRows = [...(incomeRecords || []), ...(incomeHistoryRecords || [])];

  for (const r of allIncomeRows) {
    if (!afmToRole[r.afm]) {
      if (r.memberType?.includes('Αιτών')) afmToRole[r.afm] = 'APPLICANT';
      else if (r.memberType?.includes('Σύζυγος') || r.memberType?.includes('Συνοφειλέτης'))
        afmToRole[r.afm] = 'CO_DEBTOR';
    }
  }

  const afms = Object.keys(afmToRole);
  const applicantAfm = afms.find(a => afmToRole[a] === 'APPLICANT') || afms[0];
  const coDebtorAfm = afms.find(a => afmToRole[a] === 'CO_DEBTOR');

  const persons = afms.map(afm => ({
    personId: `PERSON-${afm.slice(-6)}`,
    role: afmToRole[afm],
    privateIdentity: null,
  }));

  const afmToPersonId = Object.fromEntries(
    afms.map(a => [a, `PERSON-${a.slice(-6)}`])
  );

  // Incomes — cross-source dedup
  const incomeSeen = new Set();
  const incomes = [];
  for (const r of allIncomeRows) {
    const key = `${r.afm}::${r.taxYear}`;
    if (incomeSeen.has(key)) continue;
    incomeSeen.add(key);
    incomes.push({
      recordId: `INC-${r.afm.slice(-4)}-${r.taxYear}`,
      personId: afmToPersonId[r.afm] || `PERSON-${r.afm.slice(-6)}`,
      role: r.memberType,
      taxYear: r.taxYear,
      netAmountCents: r.netAmountCents,
      grossAmountCents: null,
      category: 'UNKNOWN',
      periodicity: 'ANNUAL',
      asOfDate: r.taxYear ? `${r.taxYear}-12-31` : null,
    });
  }

  // Financial assets
  const finAssets = (financialAssets || []).map(a => ({
    ...a,
    personIds: a.beneficiaryAfm
      ? [afmToPersonId[a.beneficiaryAfm] || `PERSON-${a.beneficiaryAfm.slice(-6)}`]
      : [],
  }));

  // Properties & ownerships
  const taxByCode = propertyTaxData || {};
  // Map propertyId -> tax record (taxByCode is keyed by code, propertyId = PROP-{code})
  const taxByPropertyId = {};
  for (const code in taxByCode) {
    taxByPropertyId[taxByCode[code].propertyId] = taxByCode[code];
  }

  const properties = (assetData?.properties || []).map(p => {
    const tax = taxByPropertyId[p.propertyId];
    return {
      propertyId: p.propertyId,
      propertyType: 'UNKNOWN',
      areaLabel: p.areaLabel || tax?.area || null,
      address: tax?.address || null,
      postalCode: tax?.postalCode || null,
    };
  });

  // Ownerships: prefer tax-file percentages when available
  const propertyOwnerships = (assetData?.ownerships || []).map(o => {
    const tax = taxByPropertyId[o.propertyId];
    const taxOwner = tax?.ownerships?.find(to => to.afm === o.ownerAfm);
    return {
      ownershipId: o.ownershipId,
      propertyId: o.propertyId,
      personId: afmToPersonId[o.ownerAfm] || `PERSON-${o.ownerAfm?.slice(-6)}`,
      ownershipPercentage: taxOwner?.percentage ?? null,
    };
  });

  // Property value evidences: servicer book value + objective/ENFIA value (auto)
  const propertyValueEvidences = [];
  for (const p of (assetData?.properties || [])) {
    // Servicer book value
    propertyValueEvidences.push({
      propertyId: p.propertyId,
      valueType: 'CREDITOR_COLLATERAL_VALUE',
      amountCents: p.creditorCollateralValueCents ?? null,
      currency: 'EUR',
      methodDescription: 'Αξία βιβλίων από ASSET_EXPORT',
      confidence: 'MEDIUM',
      verificationStatus: 'VERIFIED_AGAINST_SOURCE',
    });
    // Objective / ENFIA value from property tax file
    const tax = taxByPropertyId[p.propertyId];
    if (tax && tax.objectiveValueCents != null) {
      propertyValueEvidences.push({
        propertyId: p.propertyId,
        valueType: 'OBJECTIVE_OR_ENFIA_VALUE',
        amountCents: tax.objectiveValueCents,
        currency: 'EUR',
        methodDescription: 'Αντικειμενική αξία από PROPERTY_TAX_EXPORT',
        confidence: 'HIGH',
        verificationStatus: 'VERIFIED_AGAINST_SOURCE',
      });
    }
  }

  // Debts & terms from PDF
  const debts = (contractData.debts || []).map(d => ({
    ...d,
    category: 'UNKNOWN',
  }));

  const installMap = Object.fromEntries(
    (contractData.installments || []).map(i => [i.debtId, i])
  );

  const proposalTerms = (contractData.restructuringTerms || []).map(t => ({
    termId: `TERM-${t.debtIdentityRef}`,
    debtId: t.debtId,
    totalDebtBeforeCents: t.totalDebtCents,
    writeOffAmountCents: t.writeOffCents,
    finalRegulatedAmountCents: t.finalRegulatedCents,
    currency: 'EUR',
    rateMode: 'FLOATING',
    rateBase: 'EURIBOR_3M',
    spreadBasisPoints: t.spreadBasisPoints,
    fixedRateBasisPoints: null,
    paymentTermMonths: t.paymentTermMonths,
    upfrontPaymentCents: null,
    installmentAmountCents: installMap[t.debtId]?.monthlyAmountCents ?? null,
    isCollateralSecured: t.isCollateralSecured,
    isPublicOrSocialSecurityDebt: false,
    verificationStatus: 'VERIFIED_AGAINST_SOURCE',
  }));

  // Collateral links — populate coveredDebtIds with secured debts
  const securedDebtIds = proposalTerms
    .filter(t => t.isCollateralSecured)
    .map(t => t.debtId);

  const updatedCollateralLinks = (collateralLinks || []).map(l => ({
    ...l,
    coveredDebtIds: securedDebtIds,
  }));

  // Debt party roles
  const debtPartyRoles = [];
  const applicantPersonId = applicantAfm ? afmToPersonId[applicantAfm] : null;

  if (applicantPersonId) {
    for (const d of debts) {
      debtPartyRoles.push({
        mappingId: `DPR-PRIMARY-${d.debtIdentityRef}`,
        debtId: d.debtId,
        personId: applicantPersonId,
        role: 'PRIMARY_DEBTOR',
        participatedInApplication: true,
        signedContract: null,
        benefitsFromRestructuring: true,
      });
    }
  }

  if (coDebtorAfm) {
    const coPersonId = afmToPersonId[coDebtorAfm];
    for (const ref of (contractData.coDebtorDebtRefs || [])) {
      const debt = debts.find(d => d.debtIdentityRef === ref);
      if (debt && coPersonId) {
        debtPartyRoles.push({
          mappingId: `DPR-CODEBT-${ref}`,
          debtId: debt.debtId,
          personId: coPersonId,
          role: 'CO_DEBTOR',
          participatedInApplication: true,
          signedContract: false,
          benefitsFromRestructuring: false,
        });
      }
    }
  }

  // Household
  const hasSpouse = allIncomeRows.some(r => r.memberType?.includes('Σύζυγος'));
  const household = {
    householdSize: persons.length,
    dependentChildrenCount: 0,
    minorChildrenCount: 0,
    spouseOrPartnerPresent: hasSpouse,
    participatingCoDebtorCount: coDebtorAfm ? 1 : 0,
    nonParticipatingCoDebtorCount: 0,
  };

  // Data quality flags
  const flags = [];
  for (const p of properties) {
    flags.push(`WARNING: Δεν υπάρχει εμπορική αξία για ${p.propertyId}`);
  }
  if (securedDebtIds.length > 0) {
    flags.push(`INFO: ${updatedCollateralLinks.length} εξασφαλίσεις → ${securedDebtIds.length} εξασφαλισμένες οφειλές`);
  }

  const caseId = `CASE-${contractData.applicationNumber || Date.now()}`;

  return {
    caseId,
    status: 'PROPOSAL_RECEIVED',
    submissionDate: contractData.submissionDate,
    proposalOrContractDate: null,
    sourceFileManifest: {
      files: [
        { label: 'Income export',         sourceType: 'INCOME_EXPORT',           importedAt: now },
        { label: 'Income history',         sourceType: 'INCOME_HISTORY_EXPORT',   importedAt: now },
        { label: 'Asset export',           sourceType: 'ASSET_EXPORT',            importedAt: now },
        { label: 'Financial asset export', sourceType: 'FINANCIAL_ASSET_EXPORT',  importedAt: now },
        { label: 'Collateral export',      sourceType: 'COLLATERAL_EXPORT',       importedAt: now },
        { label: 'Contract PDF',           sourceType: 'PROPOSAL_OR_CONTRACT_PDF',importedAt: now },
      ],
    },
    persons,
    household,
    incomes,
    financialAssets: finAssets,
    properties,
    propertyOwnerships,
    propertyValueEvidences,
    collateralLinks: updatedCollateralLinks,
    debts,
    publicDebts: contractData.publicDebts || [],
    debtSummary: contractData.debtSummary || [],
    debtPartyRoles,
    proposalTerms,
    outcome: {
      status: 'PROPOSAL_ISSUED',
      proposalIssuedDate: now.slice(0, 10),
      signedDate: null,
      recordedAt: now,
      notes: 'Εισαγωγή από αρχεία',
    },
    trainingEligibility: {
      status: 'NOT_REVIEWED',
      exclusionReason: null,
      reviewedAt: null,
      reviewedBy: null,
    },
    dataQualityFlags: flags,
    _importedAt: now,
  };
}

/**
 * Parse a PUBLIC creditor PDF (ΑΑΔΕ / Δημόσιο or ΕΦΚΑ / ΚΕΑΟ).
 * These have a different structure from bank contracts — a single
 * proposal summary table, no per-loan terms or collateral.
 */
export async function parsePublicPdfWithClaude(file, expectedType) {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
  const base64 = btoa(binary);

  const prompt = `Αυτό είναι Διμερής Σύμβαση Αναδιάρθρωσης Οφειλών (Ν.4738/2020) προς ${expectedType === 'EFKA' ? 'Φορείς Κοινωνικής Ασφάλισης (ΚΕΑΟ/ΕΦΚΑ)' : 'το Ελληνικό Δημόσιο (ΑΑΔΕ)'}.

Εξήγαγε ΜΟΝΟ το JSON, χωρίς καμία άλλη λέξη:

{
  "applicationNumber": "string — ο αριθμός αίτησης",
  "submissionDate": "DD/MM/YYYY ή null — ημ. οριστικής υποβολής",
  "creditorType": "${expectedType}",
  "totalRegulatedCents": integer,
  "writeOffCents": integer,
  "amountToRegulateCents": integer,
  "payableInterestCents": integer,
  "totalPaymentCents": integer,
  "paymentTermMonths": integer,
  "monthlyInstallmentCents": integer,
  "composition": {
    "principalRegulatableCents": integer,
    "principalNonRegulatableCents": integer,
    "penaltyPrincipalCents": integer,
    "surchargesCents": integer
  }
}

ΣΗΜΕΙΩΣΕΙΣ:
- Ποσά σε cents (€150.971,16 = 15097116)
- ${expectedType === 'EFKA'
    ? 'Από τον πίνακα "Όροι Αναδιάρθρωσης Οφειλών": "Βασική οφειλή προς ρύθμιση"→composition.principalRegulatableCents, "Προσαυξήσεις"→composition.surchargesCents, "Συνολική Οφειλή προς ρύθμιση"→totalRegulatedCents, "Ποσό διαγραφής"→writeOffCents, "Ποσό ρυθμιζόμενης οφειλής"→amountToRegulateCents, "Πληρωτέος Τόκος"→payableInterestCents, "Συνολικό ποσό πληρωμής"→totalPaymentCents. Το ΕΦΚΑ δεν έχει principalNonRegulatable/penalty — βάλε 0.'
    : 'Από τον πίνακα "Πρόταση Αναδιάρθρωσης Οφειλών Ελληνικού Δημοσίου": "Βασική οφειλή με δυνατότητα διαγραφής"→composition.principalRegulatableCents, "Βασική οφειλή χωρίς δυνατότητα διαγραφής"→composition.principalNonRegulatableCents, "Βασική οφειλή από πρόστιμα"→composition.penaltyPrincipalCents, "Προσαυξήσεις"→composition.surchargesCents, "Ποσό διαγραφής/απαλλαγής"→writeOffCents, "Ποσό οφειλής προς ρύθμιση"→amountToRegulateCents, "Πληρωτέος τόκος"→payableInterestCents, "Συνολικό ποσό πληρωμής"→totalPaymentCents. Το totalRegulatedCents = principalRegulatable+principalNonRegulatable+penalty+surcharges.'}
- Από το Δοσολόγιο: paymentTermMonths = το "Σύνολο" μηνών (π.χ. 240), monthlyInstallmentCents = το μηνιαίο ποσό του έτους 1`;

  const response = await fetch('https://exopredict-proxy.gdion77.workers.dev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error (${expectedType}): ${response.status} — ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = rawText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  // Build a publicDebt entry compatible with the case structure
  return {
    applicationNumber: parsed.applicationNumber || null,
    submissionDate: parsed.submissionDate || null,
    publicDebt: {
      debtId: `DEBT-PUBLIC-${expectedType}`,
      creditorType: expectedType === 'EFKA' ? 'EFKA_GR' : 'AADE_GR',
      creditorKey: expectedType === 'EFKA' ? 'EFKA_GR' : 'AADE_GR',
      principalRegulatableCents: num(parsed.composition?.principalRegulatableCents),
      principalNonRegulatableCents: num(parsed.composition?.principalNonRegulatableCents),
      penaltyPrincipalCents: num(parsed.composition?.penaltyPrincipalCents),
      surchargesCents: num(parsed.composition?.surchargesCents),
      totalRegulatedCents: num(parsed.totalRegulatedCents),
      writeOffCents: num(parsed.writeOffCents),
      amountToRegulateCents: num(parsed.amountToRegulateCents),
      payableInterestCents: num(parsed.payableInterestCents),
      totalPaymentCents: num(parsed.totalPaymentCents),
      paymentTermMonths: num(parsed.paymentTermMonths),
      monthlyInstallmentCents: num(parsed.monthlyInstallmentCents),
    },
  };
}
