/**
 * PDF Contract Parser — runs in browser using pdf.js
 *
 * Extracts structured data from Σύμβαση Αναδιάρθρωσης Ν.4738/2020.
 * Parses Πίνακας 5, 6, 7, 8, and Παράρτημα Ι.
 *
 * Strategy: extract all text, find table sections by Greek headers,
 * parse numeric patterns.
 */

// ─── Money ────────────────────────────────────────────────────────────────────

function parseMoney(s) {
  if (!s) return null;
  const clean = String(s)
    .replace(/€/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const n = parseFloat(clean);
  return isNaN(n) ? null : Math.round(n * 100);
}

function parseMoneyFromText(text) {
  // Match € 1.234,56 or 1.234,56
  const m = text.match(/€?\s*[\d.]+,\d{2}/);
  if (!m) return null;
  return parseMoney(m[0]);
}

// ─── Text extraction ──────────────────────────────────────────────────────────

export async function extractPdfText(file) {
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  if (!pdfjsLib) throw new Error('PDF.js not loaded');

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

// ─── Core parser ──────────────────────────────────────────────────────────────

export function parseContractText(text) {
  const result = {
    applicationNumber: null,
    submissionDate: null,
    creditorAfm: null,
    creditorKey: 'DOVALUE_GREECE',
    claimantLabel: null,
    debts: [],
    coDebtorDebtRefs: [],
    restructuringTerms: [],
    installments: [],
  };

  // Application number
  const appMatch = text.match(/αριθμ[μ]?\.\s*(\d+)/i);
  if (appMatch) result.applicationNumber = appMatch[1];

  // Submission date
  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (dateMatch) result.submissionDate = parseGreekDate(dateMatch[1]);

  // Creditor AFM
  const afmMatch = text.match(/099755919/);
  if (afmMatch) result.creditorAfm = '099755919';

  // Claimant
  const claimantMatch = text.match(/XYQ Luxco S\.?à r\.?l\.?/i);
  if (claimantMatch) result.claimantLabel = 'XYQ Luxco S.à r.l.';

  // ── Πίνακας 5: Parse debt rows ──────────────────────────────────────────
  // Pattern: contract number (with leading zeros) + identity ref + amounts
  const debtPattern = /(\d{16,20}(?:_\d)?)\s+(\d{13})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+EUR\s+Ναι/g;
  let m;
  while ((m = debtPattern.exec(text)) !== null) {
    result.debts.push({
      debtId: `DEBT-PDF-${m[2]}`,
      contractNumber: m[1],
      debtIdentityRef: m[2],
      principalCents: parseMoney(m[3]),
      overdueInterestCents: parseMoney(m[4]),
      totalDebtCents: parseMoney(m[5]),
      currency: 'EUR',
      isRegulated: true,
      creditorKey: result.creditorKey,
      claimantLabel: result.claimantLabel,
    });
  }

  // ── Πίνακας 7: Co-debtor debt refs ───────────────────────────────────────
  // Find identity refs that appear near co-debtor AFM
  const coDebtSection = text.match(/ΠΙΝΑΚΑΣ 7.*?ΠΙΝΑΚΑΣ 8/s);
  if (coDebtSection) {
    const refPattern = /(\d{13})/g;
    let rm;
    while ((rm = refPattern.exec(coDebtSection[0])) !== null) {
      if (!result.coDebtorDebtRefs.includes(rm[1])) {
        result.coDebtorDebtRefs.push(rm[1]);
      }
    }
  }

  // ── Πίνακας 8: Restructuring terms ───────────────────────────────────────
  const termPattern = /(\d{16,20}(?:_\d)?)\s+(\d{13})\s+€\s*([\d.]+,\d{2})\s+€\s*([\d.]+,\d{2})\s+€\s*([\d.]+,\d{2})\s+[\d,]+%\s+([\d,]+)%\s+(\d+)/g;
  while ((m = termPattern.exec(text)) !== null) {
    const spreadStr = m[6].replace(',', '.');
    const spreadBp = Math.round(parseFloat(spreadStr) * 100);
    result.restructuringTerms.push({
      debtId: `DEBT-PDF-${m[2]}`,
      contractNumber: m[1],
      debtIdentityRef: m[2],
      totalDebtCents: parseMoney(m[3]),
      writeOffCents: parseMoney(m[4]),
      finalRegulatedCents: parseMoney(m[5]),
      spreadBasisPoints: spreadBp,
      paymentTermMonths: parseInt(m[7], 10),
      isCollateralSecured: spreadBp === 300,
      rateBase: 'EURIBOR_3M',
    });
  }

  // ── Παράρτημα Ι: Installments ─────────────────────────────────────────────
  // Pattern: identity ref + year number + 12 + € X.XXX,XX / € XXX,XX
  const instPattern = /(\d{13})\s+(\d+)\s+12\s+€\s*([\d.]+,\d{2})\s*\/\s*€\s*([\d.]+,\d{2})/g;
  const seenInst = new Set();
  while ((m = instPattern.exec(text)) !== null) {
    const ref = m[2] === '1' ? m[1] : null; // only take year 1
    if (m[2] === '1' && !seenInst.has(m[1])) {
      seenInst.add(m[1]);
      result.installments.push({
        debtIdentityRef: m[1],
        debtId: `DEBT-PDF-${m[1]}`,
        annualAmountCents: parseMoney(m[3]),
        monthlyAmountCents: parseMoney(m[4]),
      });
    }
  }

  return result;
}

// ─── Assemble from parsed data ────────────────────────────────────────────────

export function assembleCaseFromParsed({
  incomeRecords,
  incomeHistoryRecords,
  assetData,
  financialAssets,
  collateralLinks,
  contractData,
  caseIdOverride,
}) {
  const now = new Date().toISOString();

  // Build person map from income records
  const afmToRole = {};
  const allIncomeRows = [...incomeRecords, ...incomeHistoryRecords];

  for (const r of allIncomeRows) {
    if (!afmToRole[r.afm]) {
      if (r.memberType.includes('Αιτών')) afmToRole[r.afm] = 'APPLICANT';
      else if (r.memberType.includes('Σύζυγος') || r.memberType.includes('Συνοφειλέτης'))
        afmToRole[r.afm] = 'CO_DEBTOR';
    }
  }

  const afms = Object.keys(afmToRole);
  const applicantAfm = afms.find(a => afmToRole[a] === 'APPLICANT') || afms[0];

  // Persons (no PII stored in privateIdentity)
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
  const properties = assetData?.properties || [];
  const propertyOwnerships = (assetData?.ownerships || []).map(o => ({
    ...o,
    personId: afmToPersonId[o.ownerAfm] || `PERSON-${o.ownerAfm?.slice(-6)}`,
  }));

  // Property value evidences (creditor collateral values from asset XLS)
  const propertyValueEvidences = properties.map(p => ({
    propertyId: p.propertyId,
    valueType: 'CREDITOR_COLLATERAL_VALUE',
    amountCents: p.creditorCollateralValueCents ?? null,
    range: null,
    currency: 'EUR',
    asOfDate: null,
    methodDescription: 'Εκτιμώμενη αξία από ASSET_EXPORT',
    confidence: 'MEDIUM',
    verificationStatus: 'VERIFIED_AGAINST_SOURCE',
  }));

  // Debts from PDF
  const debts = contractData.debts.map(d => ({
    ...d,
    category: 'UNKNOWN',
    currency: 'EUR',
  }));

  // Proposal terms — merge with installments
  const installMap = Object.fromEntries(
    (contractData.installments || []).map(i => [i.debtId, i])
  );
  const proposalTerms = contractData.restructuringTerms.map(t => ({
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

  // Co-debtor roles from Π7
  const coDebtorAfm = afms.find(a => afmToRole[a] === 'CO_DEBTOR');
  if (coDebtorAfm) {
    const coPersonId = afmToPersonId[coDebtorAfm];
    for (const ref of contractData.coDebtorDebtRefs) {
      const debt = debts.find(d => d.debtIdentityRef === ref);
      if (debt && coPersonId) {
        debtPartyRoles.push({
          mappingId: `DPR-CODEBT-${ref}-${coDebtorAfm.slice(-4)}`,
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

  // Household aggregate
  const hasSpouse = afms.some(a => {
    const rows = allIncomeRows.filter(r => r.afm === a);
    return rows.some(r => r.memberType?.includes('Σύζυγος'));
  });

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
    flags.push(`WARNING: Δεν υπάρχει εμπορική αξία για ${p.propertyId} — αποθηκεύεται null`);
  }
  if (securedDebtIds.length > 0) {
    flags.push(`INFO: ${updatedCollateralLinks.length} εξασφαλίσεις συνδέθηκαν με ${securedDebtIds.length} εξασφαλισμένες οφειλές`);
  }

  const caseId = caseIdOverride || `CASE-${contractData.applicationNumber || Date.now()}`;

  return {
    caseId,
    status: 'PROPOSAL_RECEIVED',
    submissionDate: contractData.submissionDate,
    proposalOrContractDate: null,
    sourceFileManifest: {
      files: [
        { label: 'Income export',        sourceType: 'INCOME_EXPORT',          importedAt: now },
        { label: 'Income history',        sourceType: 'INCOME_HISTORY_EXPORT',  importedAt: now },
        { label: 'Asset export',          sourceType: 'ASSET_EXPORT',           importedAt: now },
        { label: 'Financial asset export',sourceType: 'FINANCIAL_ASSET_EXPORT', importedAt: now },
        { label: 'Collateral export',     sourceType: 'COLLATERAL_EXPORT',      importedAt: now },
        { label: 'Contract PDF',          sourceType: 'PROPOSAL_OR_CONTRACT_PDF',importedAt: now },
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
    debtPartyRoles,
    proposalTerms,
    outcome: {
      status: 'PROPOSAL_ISSUED',
      proposalIssuedDate: now.slice(0, 10),
      signedDate: null,
      recordedAt: now,
      notes: 'ΠΡΟΧΕΙΡΟ — εισαγωγή από αρχεία',
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

function parseGreekDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
