import { useState, useCallback } from 'react';
import {
  parseIncomeXls,
  parseIncomeHistoryXls,
  parseAssetXls,
  parseFinancialAssetXls,
  parseCollateralXls,
  parseDebtSummaryXls,
  parsePropertyTaxXls,
} from '../parsers/xlsParser.js';
import {
  parseContractPdfWithClaude,
  parsePublicPdfWithClaude,
  buildContractData,
  assembleCaseFromParsed,
} from '../parsers/contractPdfParser.js';

const XLS_REQUIRED = [
  { key: 'income',         label: 'incomeXls.xls',          hint: 'Εισοδήματα τρέχοντος έτους',       accept: '.xls,.xlsx' },
  { key: 'incomeHistory',  label: 'incomeHistoryXls.xls',   hint: 'Ιστορικό εισοδημάτων',             accept: '.xls,.xlsx' },
  { key: 'asset',          label: 'assetXls.xls',           hint: 'Ακίνητα',                          accept: '.xls,.xlsx' },
  { key: 'financialAsset', label: 'financialAssetXls.xls',  hint: 'Χρηματοοικονομικά στοιχεία',      accept: '.xls,.xlsx' },
  { key: 'collateral',     label: 'collateralXls.xls',      hint: 'Εξασφαλίσεις',                    accept: '.xls,.xlsx' },
  { key: 'debtsSummary',   label: 'debtsSymmaryXls.xls',    hint: 'Σύνοψη οφειλών (τράπεζες+ΑΑΔΕ+ΕΦΚΑ)', accept: '.xls,.xlsx' },
  { key: 'propertyTax',    label: 'propertyTaxBuildingXls.xls', hint: 'Φορολογητέα/αντικειμενική αξία ακινήτων', accept: '.xls,.xlsx' },
];

// At least ONE pdf required. Bank contract OR public (AADE/EFKA) contracts.
const PDF_OPTIONAL = [
  { key: 'contractBank',  label: 'Σύμβαση Τραπεζών/Servicers', hint: 'PDF — δάνεια (προαιρετικό)',  accept: '.pdf' },
  { key: 'contractAade',  label: 'Σύμβαση ΑΑΔΕ / Δημοσίου',    hint: 'PDF — φορολογικές οφειλές (προαιρετικό)', accept: '.pdf' },
  { key: 'contractEfka',  label: 'Σύμβαση ΕΦΚΑ / ΚΕΑΟ',        hint: 'PDF — ασφαλιστικές οφειλές (προαιρετικό)', accept: '.pdf' },
];

async function readXls(file) {
  const XLSX = window.XLSX;
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: 'array' });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed: ${src}`));
    document.head.appendChild(s);
  });
}

export default function NewCaseModal({ onClose, onImport }) {
  const [files, setFiles] = useState({});
  const [step, setStep] = useState('upload');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [importJson, setImportJson] = useState(false);

  const allXlsReady = XLS_REQUIRED.every(f => files[f.key]);
  const atLeastOnePdf = PDF_OPTIONAL.some(f => files[f.key]);
  const allRequired = allXlsReady && atLeastOnePdf;

  function pickFile(key, accept) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = e => {
      if (e.target.files[0]) setFiles(prev => ({ ...prev, [key]: e.target.files[0] }));
    };
    input.click();
  }

  async function processFiles() {
    setStep('processing');
    setError('');

    try {
      if (!window.XLSX) {
        setProgress('Φόρτωση βιβλιοθηκών...');
        await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      }

      setProgress('Ανάγνωση εισοδημάτων...');
      const incomeWb        = await readXls(files.income);
      const incomeHistoryWb = await readXls(files.incomeHistory);

      setProgress('Ανάγνωση ακινήτων...');
      const assetWb    = await readXls(files.asset);
      const financialWb = await readXls(files.financialAsset);
      const collWb     = await readXls(files.collateral);
      const debtSumWb  = await readXls(files.debtsSummary);
      const propTaxWb  = await readXls(files.propertyTax);

      const incomeRecords        = parseIncomeXls(incomeWb, 'INCOME_EXPORT');
      const incomeHistoryRecords = parseIncomeHistoryXls(incomeHistoryWb);
      const assetData            = parseAssetXls(assetWb);
      const financialAssets      = parseFinancialAssetXls(financialWb);
      const collateralLinks      = parseCollateralXls(collWb);
      const debtSummary          = parseDebtSummaryXls(debtSumWb);
      const propertyTaxData      = parsePropertyTaxXls(propTaxWb);

      // ── Parse whatever PDFs are present ──
      let contractData = {
        applicationNumber: null, submissionDate: null,
        creditorAfm: null, creditorKey: 'UNKNOWN', claimantLabel: null,
        debts: [], coDebtorDebtRefs: [], restructuringTerms: [],
        installments: [], publicDebts: [], debtSummary,
      };

      // Bank contract
      if (files.contractBank) {
        setProgress('Ανάλυση τραπεζικής σύμβασης...');
        const bankParsed = await parseContractPdfWithClaude(files.contractBank);
        const bankData = buildContractData(bankParsed);
        contractData = { ...bankData, debtSummary, publicDebts: bankData.publicDebts || [] };
      }

      // AADE
      if (files.contractAade) {
        setProgress('Ανάλυση σύμβασης ΑΑΔΕ...');
        const aadeParsed = await parsePublicPdfWithClaude(files.contractAade, 'AADE');
        if (!contractData.applicationNumber) contractData.applicationNumber = aadeParsed.applicationNumber;
        if (!contractData.submissionDate) contractData.submissionDate = aadeParsed.submissionDate;
        contractData.publicDebts.push(aadeParsed.publicDebt);
      }

      // EFKA
      if (files.contractEfka) {
        setProgress('Ανάλυση σύμβασης ΕΦΚΑ...');
        const efkaParsed = await parsePublicPdfWithClaude(files.contractEfka, 'EFKA');
        if (!contractData.applicationNumber) contractData.applicationNumber = efkaParsed.applicationNumber;
        if (!contractData.submissionDate) contractData.submissionDate = efkaParsed.submissionDate;
        contractData.publicDebts.push(efkaParsed.publicDebt);
      }

      const hasBankDebts = contractData.debts && contractData.debts.length > 0;
      const hasPublicDebts = contractData.publicDebts && contractData.publicDebts.length > 0;
      if (!hasBankDebts && !hasPublicDebts) {
        throw new Error('Δεν βρέθηκαν οφειλές σε κανένα PDF. Βεβαιώσου ότι ανέβασες σωστή σύμβαση Ν.4738/2020.');
      }

      setProgress('Συναρμολόγηση υπόθεσης...');
      const assembled = assembleCaseFromParsed({
        incomeRecords, incomeHistoryRecords,
        assetData, financialAssets, collateralLinks,
        contractData, propertyTaxData,
      });

      setStep('done');
      onImport(assembled);

    } catch (err) {
      setStep('error');
      setError(err.message || 'Άγνωστο σφάλμα');
    }
  }

  async function handleJsonImport(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const cases = {};
      (Array.isArray(data) ? data : [data]).forEach(c => { if (c.caseId) cases[c.caseId] = c; });
      onImport(cases, true);
    } catch {
      setError('Μη έγκυρο JSON αρχείο');
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Νέα υπόθεση</h2>
          <button className="modal-close" onClick={onClose}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        {step === 'upload' && (
          <>
            <div className="modal-tabs">
              <button className={`modal-tab${!importJson ? ' active' : ''}`} onClick={() => setImportJson(false)}>
                <i className="ti ti-file-upload" aria-hidden="true" /> Από αρχεία XLS + PDF
              </button>
              <button className={`modal-tab${importJson ? ' active' : ''}`} onClick={() => setImportJson(true)}>
                <i className="ti ti-database-import" aria-hidden="true" /> Εισαγωγή JSON
              </button>
            </div>

            {importJson ? (
              <div className="modal-body">
                <p className="modal-hint">Εισαγωγή από προηγούμενο export JSON του ExoPredict PRO.</p>
                <div className="upload-zone-modal" onClick={() => document.getElementById('json-imp').click()}>
                  <i className="ti ti-file-type-json" style={{ fontSize: 32 }} aria-hidden="true" />
                  <div>Κλικ για επιλογή JSON αρχείου</div>
                </div>
                <input id="json-imp" type="file" accept=".json" style={{ display: 'none' }}
                  onChange={e => e.target.files[0] && handleJsonImport(e.target.files[0])} />
              </div>
            ) : (
              <div className="modal-body">
                <p className="modal-hint">
                  Ανέβασε τα 7 XLS exports και τουλάχιστον <strong>μία</strong> σύμβαση PDF
                  (τραπεζών, ΑΑΔΕ ή ΕΦΚΑ — όποια υπάρχει). Τα αρχεία διαβάζονται τοπικά,
                  τα PDF αναλύονται με AI.
                </p>
                <div className="file-section-label">Αρχεία XLS (υποχρεωτικά)</div>
                <div className="file-list">
                  {XLS_REQUIRED.map(f => (
                    <div key={f.key} className={`file-row${files[f.key] ? ' uploaded' : ''}`}>
                      <div className="file-row-left">
                        <i className={`ti ${files[f.key] ? 'ti-check' : 'ti-upload'}`}
                          style={{ color: files[f.key] ? 'var(--accent)' : 'var(--text-sub)', fontSize: 16 }}
                          aria-hidden="true" />
                        <div>
                          <div className="file-label">{f.label}</div>
                          <div className="file-hint">{f.hint}</div>
                        </div>
                      </div>
                      <div className="file-row-right">
                        {files[f.key]
                          ? <span className="file-name">{files[f.key].name}</span>
                          : <button className="btn btn-sm" onClick={() => pickFile(f.key, f.accept)}>Επιλογή</button>
                        }
                      </div>
                    </div>
                  ))}
                </div>

                <div className="file-section-label" style={{ marginTop: 16 }}>
                  Συμβάσεις PDF (τουλάχιστον μία)
                </div>
                <div className="file-list">
                  {PDF_OPTIONAL.map(f => (
                    <div key={f.key} className={`file-row${files[f.key] ? ' uploaded' : ''}`}>
                      <div className="file-row-left">
                        <i className={`ti ${files[f.key] ? 'ti-check' : 'ti-file-text'}`}
                          style={{ color: files[f.key] ? 'var(--accent)' : 'var(--text-sub)', fontSize: 16 }}
                          aria-hidden="true" />
                        <div>
                          <div className="file-label">{f.label}</div>
                          <div className="file-hint">{f.hint}</div>
                        </div>
                      </div>
                      <div className="file-row-right">
                        {files[f.key]
                          ? <span className="file-name">{files[f.key].name}</span>
                          : <button className="btn btn-sm" onClick={() => pickFile(f.key, f.accept)}>Επιλογή</button>
                        }
                      </div>
                    </div>
                  ))}
                </div>

                {!atLeastOnePdf && allXlsReady && (
                  <div className="af-hint" style={{ color: 'var(--warn)', marginTop: 10 }}>
                    Χρειάζεται τουλάχιστον μία σύμβαση PDF.
                  </div>
                )}

                <div className="modal-footer">
                  <button className="btn" onClick={onClose}>Ακύρωση</button>
                  <button className="btn btn-primary" disabled={!allRequired} onClick={processFiles}>
                    <i className="ti ti-cpu" aria-hidden="true" /> Ανάλυση & εισαγωγή
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {step === 'processing' && (
          <div className="modal-body modal-processing">
            <div className="spinner" />
            <div className="processing-text">{progress}</div>
            <div className="processing-sub">Παρακαλώ περίμενε...</div>
          </div>
        )}

        {step === 'done' && (
          <div className="modal-body modal-done">
            <i className="ti ti-circle-check" style={{ fontSize: 48, color: 'var(--accent)' }} aria-hidden="true" />
            <div className="done-text">Η υπόθεση εισήχθη επιτυχώς</div>
            <button className="btn btn-primary" onClick={onClose}>Εντάξει</button>
          </div>
        )}

        {step === 'error' && (
          <div className="modal-body modal-error">
            <i className="ti ti-alert-circle" style={{ fontSize: 48, color: 'var(--error)' }} aria-hidden="true" />
            <div className="error-text">Σφάλμα κατά την εισαγωγή</div>
            <div className="error-detail">{error}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn" onClick={() => setStep('upload')}>← Πίσω</button>
              <button className="btn" onClick={onClose}>Κλείσιμο</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
