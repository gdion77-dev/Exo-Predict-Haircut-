/**
 * XLS Parser — runs in the browser using SheetJS (xlsx)
 * Reads incomeXls, incomeHistoryXls, assetXls, financialAssetXls,
 * collateralXls, debtsSymmaryXls and returns structured objects.
 *
 * NO personal data is stored beyond what's needed for case assembly.
 * AFM values are used only for PersonId mapping.
 */

// ─── Money parsing ────────────────────────────────────────────────────────────

function parseEuroCents(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw)
    .replace(/€/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  if (!s || s === '-') return null;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return Math.round(n * 100);
}

function asStr(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim();
  return s || null;
}

function asAfm(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).replace(/\s/g, '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s) && s.length < 9) return s.padStart(9, '0');
  return s;
}

function parseTaxYear(raw) {
  if (!raw) return null;
  const n = parseInt(String(raw).trim(), 10);
  return isNaN(n) || n < 1990 || n > 2100 ? null : n;
}

// ─── Sheet reader ─────────────────────────────────────────────────────────────

function readSheet(workbook, sheetName) {
  const XLSX = window.XLSX;
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
  return rows;
}

// ─── Individual parsers ───────────────────────────────────────────────────────

export function parseIncomeXls(workbook, sourceType) {
  const rows = readSheet(workbook, 'incomeDataTable');
  const seen = new Set();
  const records = [];

  for (const row of rows) {
    const afm = asAfm(row['Α.Φ.Μ.']);
    const year = parseTaxYear(row['Φορολογικό Έτος']);
    const memberType = asStr(row['Τύπος Μέλους']) || '';
    const amountCents = parseEuroCents(row['Ετήσιο Ατομικό Εισόδημα']);

    if (!afm) continue;

    const key = `${afm}::${year}`;
    if (seen.has(key)) continue;
    seen.add(key);

    records.push({ afm, taxYear: year, memberType, netAmountCents: amountCents, sourceType });
  }
  return records;
}

export function parseIncomeHistoryXls(workbook) {
  const rows = readSheet(workbook, 'incomeHistoryDataTable');
  const seen = new Set();
  const records = [];

  for (const row of rows) {
    const afm = asAfm(row['Α.Φ.Μ.']);
    const year = parseTaxYear(row['Φορολογικό Έτος']);
    const memberType = asStr(row['Τύπος Μέλους']) || '';
    const amountCents = parseEuroCents(row['Ετήσιο Ατομικό Εισόδημα']);

    if (!afm) continue;

    const key = `${afm}::${year}`;
    if (seen.has(key)) continue;
    seen.add(key);

    records.push({ afm, taxYear: year, memberType, netAmountCents: amountCents, sourceType: 'INCOME_HISTORY_EXPORT' });
  }
  return records;
}

export function parseAssetXls(workbook) {
  const rows = readSheet(workbook, 'applicationAssetDataTable');
  const propMap = new Map();
  const ownerships = [];

  for (const row of rows) {
    const code = asStr(row['Κωδικός Περιουσιακού Στοιχείου']);
    const ownerAfm = asAfm(row['ΑΦΜ Οφειλέτη']);
    const valueCents = parseEuroCents(row['Εκτιμώμενη Αξία Περιουσιακού Στοιχείου']);
    const nomos = asStr(row['Νομός']);
    const periochi = asStr(row['Περιοχή']);

    if (!code) continue;

    if (!propMap.has(code)) {
      propMap.set(code, {
        propertyId: `PROP-${code}`,
        propertyType: 'UNKNOWN',
        areaLabel: [periochi, nomos].filter(Boolean).join(', ') || null,
        creditorCollateralValueCents: valueCents,
      });
    }

    if (ownerAfm) {
      const key = `${code}::${ownerAfm}`;
      if (!ownerships.find(o => o.key === key)) {
        ownerships.push({
          key,
          ownershipId: `OWN-${code}-${ownerAfm.slice(-4)}`,
          propertyId: `PROP-${code}`,
          ownerAfm,
          ownershipPercentage: null,
        });
      }
    }
  }

  return {
    properties: Array.from(propMap.values()),
    ownerships,
  };
}

export function parseFinancialAssetXls(workbook) {
  const rows = readSheet(workbook, 'applicationFinancialAssetDataTa');
  const seen = new Set();
  const assets = [];

  const CREDITOR_KEYS = {
    '099755919': 'DOVALUE_GREECE',
    '094014201': 'NATIONAL_BANK_GR',
    '996807331': 'ALPHA_BANK_GR',
    '996866969': 'EUROBANK_GR',
    '997072577': 'EFKA_GR',
    '997073525': 'AADE_GR',
  };

  for (const row of rows) {
    const productCode = asStr(row['Κωδικός Χρηματοοικονομικού Προϊόντος']);
    const benefAfm = asAfm(row['ΑΦΜ Δικαιούχου']);
    if (!productCode) continue;

    const key = `${productCode}::${benefAfm}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const credAfm = asAfm(row['ΑΦΜ Πιστωτή / Διαχειριστή']);
    const institutionKey = credAfm
      ? (CREDITOR_KEYS[credAfm] || `UNKNOWN_${credAfm.slice(-4)}`)
      : 'UNKNOWN';

    assets.push({
      assetId: `FIN-${(productCode || 'UNK').slice(-8)}`,
      beneficiaryAfm: benefAfm,
      institutionKey,
      assetType: 'BANK_DEPOSIT',
      balanceCents: parseEuroCents(row['Αξία Χρηματοοικονομικού Προϊόντος']),
      currency: asStr(row['Νόμισμα']) || 'EUR',
      asOfDate: asStr(row['Ημερομηνία Αποτίμησης']),
    });
  }
  return assets;
}

export function parseCollateralXls(workbook) {
  const rows = readSheet(workbook, 'applicationCollateralDataTable');
  const seen = new Set();
  const links = [];

  for (const row of rows) {
    const code = asStr(row['Κωδικός Εξασφάλισης']);
    if (!code || seen.has(code)) continue;
    seen.add(code);

    const assetCode = asStr(row['Κωδικός Περιουσιακού Στοιχείου']);
    const priority = row['Σειρά Προσημείωσης'];
    const priorityNum = priority ? parseInt(String(priority), 10) : null;

    links.push({
      collateralId: `COL-${code}`,
      propertyId: assetCode ? `PROP-${assetCode}` : null,
      coveredDebtIds: [], // filled by PDF parser
      registrationPriority: isNaN(priorityNum) ? null : priorityNum,
      collateralAmountCents: parseEuroCents(row['Ποσό Εξασφάλισης']),
    });
  }
  return links;
}

export function parseDebtSummaryXls(workbook) {
  const rows = readSheet(workbook, 'debtSummary');
  const CREDITOR_KEYS = {
    '099755919': 'DOVALUE_GREECE',
    '094014201': 'NATIONAL_BANK_GR',
    '996807331': 'ALPHA_BANK_GR',
    '996866969': 'EUROBANK_GR',
    '997072577': 'EFKA_GR',
    '997073525': 'AADE_GR',
  };

  // Public creditors (ΑΑΔΕ / ΕΦΚΑ) get different write-off treatment
  const PUBLIC_AFMS = new Set(['997072577', '997073525']);

  return rows
    .filter(r => {
      const label = asStr(r['Επωνυμία Πιστωτή / Διαχειριστή']);
      return label && label !== 'Σύνολα:';
    })
    .map(r => {
      const afm = asAfm(r['ΑΦΜ Πιστωτή / Διαχειριστή']);
      const regulatedCents = parseEuroCents(r['Συνολικό ποσό υπαγόμενων οφειλών']);
      const nonRegulatedCents = parseEuroCents(r['Συνολικό ποσό μη υπαγόμενων οφειλών']);
      const isPublic = afm ? PUBLIC_AFMS.has(afm) : false;

      return {
        creditorAfm: afm,
        creditorKey: afm ? (CREDITOR_KEYS[afm] || `UNKNOWN_${afm.slice(-4)}`) : 'UNKNOWN',
        creditorLabel: asStr(r['Επωνυμία Πιστωτή / Διαχειριστή']),
        claimantLabel: asStr(r['Ιδιοκτήτης']),
        creditorType: isPublic ? 'PUBLIC' : 'FINANCIAL',
        // Composition
        regulatedTotalCents: regulatedCents,
        nonRegulatedTotalCents: nonRegulatedCents,
        principalCents: parseEuroCents(r['Ποσό βασικής οφειλής']),
        overdueInterestCents: parseEuroCents(r['Ποσό τόκων υπερημερίας']),
        surchargesCents: parseEuroCents(r['Προσαυξήσεις']),
        publicPenaltyCents: parseEuroCents(r['Πρόστιμο δημοσίου']),
        debtPercentage: asStr(r['Ποσοστό οφειλών']),
        settledViaExtrajudicialCents: parseEuroCents(r['Συνολικό ποσό οφειλών ρυθμισμένων με Εξωδ/κό Μηχανισμό']),
      };
    })
    // Keep only creditors with actual regulated debt or non-regulated debt
    .filter(r => (r.regulatedTotalCents || 0) > 0 || (r.nonRegulatedTotalCents || 0) > 0);
}

/**
 * Build synthetic "debts" from debt summary (for PREDICTIONS — no PDF available).
 * Each creditor row becomes one aggregate debt entry.
 */
export function buildDebtsFromSummary(summaryRows) {
  return summaryRows
    .filter(r => (r.regulatedTotalCents || 0) > 0)
    .map((r, idx) => ({
      debtId: `DEBT-SUM-${r.creditorAfm || idx}`,
      debtIdentityRef: `SUMMARY-${r.creditorKey}`,
      contractNumber: null,
      creditorKey: r.creditorKey,
      creditorType: r.creditorType,
      claimantLabel: r.claimantLabel,
      totalDebtCents: r.regulatedTotalCents,
      principalAmountCents: r.principalCents,
      overdueInterestCents: r.overdueInterestCents,
      surchargesCents: r.surchargesCents,
      penaltiesCents: r.publicPenaltyCents,
      nonRegulatedCents: r.nonRegulatedTotalCents,
      regulatedParticipation: true,
      category: r.creditorType === 'PUBLIC' ? 'PUBLIC' : 'FINANCIAL',
      currency: 'EUR',
      source: 'DEBT_SUMMARY_XLS',
    }));
}

/**
 * Parse propertyTaxBuildingXls — ΕΝΦΙΑ / objective values per property.
 *
 * Structure: each row = one ATAK part for one owner.
 * "Αξία Ακινήτου" is the FULL property value (not the owner's share).
 * The SAME property (code) is repeated per owner, each owner having their own
 * ATAK numbers but identical values. So we take the value from ONE owner only.
 *
 * A property code may bundle multiple physical parts (land + building) under
 * different "Όροφος" rows but the SAME code — those are summed per owner,
 * then we keep the per-owner total (not summed across owners).
 *
 * Returns map keyed by property code:
 *   { [code]: { propertyId, objectiveValueCents, ownerships:[{afm,role,percentage}], address, area } }
 */
export function parsePropertyTaxXls(workbook) {
  let rows = readSheet(workbook, 'propertyTaxBuildingDataTable') || [];
  if (rows.length === 0) {
    const firstSheet = workbook.SheetNames[0];
    rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: null, raw: false });
  }

  // First pass: accumulate value per (code, afm) — sums multi-part rows for same owner
  const perCodeAfm = {};   // `${code}::${afm}` -> { valueCents, role, pct, address, area, tk, atakSet }
  for (const r of rows) {
    const code = asStr(r['Κωδικός Αντιστοίχισης Περιουσιακού Στοιχείου']);
    if (!code) continue;
    const afm = asAfm(r['Α.Φ.Μ.']) || 'UNKNOWN';
    const key = `${code}::${afm}`;
    const valueCents = parseEuroCents(r['Αξία Ακινήτου']) || 0;
    const atak = asStr(r['ΑΤΑΚ']) || `${key}-${valueCents}`;

    if (!perCodeAfm[key]) {
      perCodeAfm[key] = {
        code, afm, valueCents: 0,
        role: asStr(r['Τύπος Μέλους']),
        pctRaw: asStr(r['Ποσοστό Συνιδιοκτησίας']),
        address: asStr(r['Διεύθυνση']),
        area: asStr(r['Περιοχή']),
        tk: asStr(r['Τ.Κ.']),
        atakSet: new Set(),
      };
    }
    // Sum distinct ATAK parts for this owner
    if (!perCodeAfm[key].atakSet.has(atak)) {
      perCodeAfm[key].atakSet.add(atak);
      perCodeAfm[key].valueCents += valueCents;
    }
  }

  // Second pass: build per-code property, value taken ONCE (max across owners,
  // since all owners report the same full property value), ownerships listed.
  const byCode = {};
  for (const key in perCodeAfm) {
    const e = perCodeAfm[key];
    if (!byCode[e.code]) {
      byCode[e.code] = {
        propertyCode: e.code,
        propertyId: `PROP-${e.code}`,
        objectiveValueCents: 0,
        ownerships: [],
        address: e.address,
        area: e.area,
        postalCode: e.tk,
      };
    }
    // Full property value = the per-owner total (they're equal across owners) → take max
    byCode[e.code].objectiveValueCents = Math.max(byCode[e.code].objectiveValueCents, e.valueCents);

    const pct = e.pctRaw ? parseFloat(e.pctRaw.replace('%', '').replace(',', '.')) : null;
    if (e.afm !== 'UNKNOWN' && !byCode[e.code].ownerships.find(o => o.afm === e.afm)) {
      byCode[e.code].ownerships.push({
        afm: e.afm,
        role: e.role,
        percentage: isNaN(pct) ? null : pct,
      });
    }
  }

  return byCode;
}
