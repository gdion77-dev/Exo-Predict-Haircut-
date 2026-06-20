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

  return rows
    .filter(r => {
      const label = asStr(r['Επωνυμία Πιστωτή / Διαχειριστή']);
      return label && label !== 'Σύνολα:';
    })
    .map(r => {
      const afm = asAfm(r['ΑΦΜ Πιστωτή / Διαχειριστή']);
      return {
        creditorAfm: afm,
        creditorKey: afm ? (CREDITOR_KEYS[afm] || `UNKNOWN_${afm.slice(-4)}`) : 'UNKNOWN',
        creditorLabel: asStr(r['Επωνυμία Πιστωτή / Διαχειριστή']),
        claimantLabel: asStr(r['Ιδιοκτήτης']),
        regulatedTotalCents: parseEuroCents(r['Συνολικό ποσό υπαγόμενων οφειλών']),
        principalCents: parseEuroCents(r['Ποσό βασικής οφειλής']),
        overdueInterestCents: parseEuroCents(r['Ποσό τόκων υπερημερίας']),
      };
    });
}
