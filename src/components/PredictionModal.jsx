import { useState } from 'react';
import {
  parseIncomeXls,
  parseIncomeHistoryXls,
  parseAssetXls,
  parseFinancialAssetXls,
  parseCollateralXls,
  parseDebtSummaryXls,
  buildDebtsFromSummary,
  parsePropertyTaxXls,
} from '../parsers/xlsParser.js';
import { assembleCaseFromParsed } from '../parsers/contractPdfParser.js';

const XLS_FILES = [
  { key: 'income',         label: 'incomeXls.xls',         hint: 'Εισοδήματα τρέχοντος έτους',  accept: '.xls,.xlsx' },
  { key: 'incomeHistory',  label: 'incomeHistoryXls.xls',  hint: 'Ιστορικό εισοδημάτων',        accept: '.xls,.xlsx' },
  { key: 'asset',          label: 'assetXls.xls',          hint: 'Ακίνητα',                     accept: '.xls,.xlsx' },
  { key: 'financialAsset', label: 'financialAssetXls.xls', hint: 'Χρηματοοικονομικά στοιχεία', accept: '.xls,.xlsx' },
  { key: 'collateral',     label: 'collateralXls.xls',     hint: 'Εξασφαλίσεις',               accept: '.xls,.xlsx' },
  { key: 'debtsSummary',   label: 'debtsSymmaryXls.xls',   hint: 'Σύνοψη οφειλών (τράπεζες+ΑΑΔΕ+ΕΦΚΑ)', accept: '.xls,.xlsx' },
  { key: 'propertyTax',    label: 'propertyTaxBuildingXls.xls', hint: 'Φορολογητέα/αντικειμενική αξία ακινήτων', accept: '.xls,.xlsx' },
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

export default function PredictionModal({ onClose, onSave }) {
  const [files, setFiles] = useState({});
  const [step, setStep] = useState('upload');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [caseIdInput, setCaseIdInput] = useState('');

  const allRequired = XLS_FILES.every(f => files[f.key]);

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

      setProgress('Ανάγνωση αρχείων...');
      const incomeWb         = await readXls(files.income);
      const incomeHistoryWb  = await readXls(files.incomeHistory);
      const assetWb          = await readXls(files.asset);
      const financialWb      = await readXls(files.financialAsset);
      const collWb           = await readXls(files.collateral);
      const debtSumWb        = await readXls(files.debtsSummary);
      const propTaxWb        = await readXls(files.propertyTax);

      const incomeRecords        = parseIncomeXls(incomeWb, 'INCOME_EXPORT');
      const incomeHistoryRecords = parseIncomeHistoryXls(incomeHistoryWb);
      const assetData            = parseAssetXls(assetWb);
      const financialAssets      = parseFinancialAssetXls(financialWb);
      const collateralLinks      = parseCollateralXls(collWb);
      const debtSummary          = parseDebtSummaryXls(debtSumWb);
      const summaryDebts         = buildDebtsFromSummary(debtSummary);
      const propertyTaxData      = parsePropertyTaxXls(propTaxWb);

      setProgress('Συναρμολόγηση...');

      // Build case from debt summary (no contract/PDF available)
      const assembled = assembleCaseFromParsed({
        incomeRecords,
        incomeHistoryRecords,
        assetData,
        financialAssets,
        collateralLinks,
        propertyTaxData,
        contractData: {
          applicationNumber: caseIdInput || String(Date.now()),
          submissionDate: null,
          creditorAfm: null,
          creditorKey: 'UNKNOWN',
          claimantLabel: null,
          debts: summaryDebts,
          debtSummary: debtSummary,
          coDebtorDebtRefs: [],
          restructuringTerms: [],
          installments: [],
        },
      });

      // Mark as prediction
      const prediction = {
        ...assembled,
        caseId: caseIdInput ? `PRED-${caseIdInput}` : `PRED-${Date.now()}`,
        _type: 'prediction',
        _predictionResult: null, // will be filled by ML model
        outcome: {
          status: 'PENDING',
          proposalIssuedDate: null,
          signedDate: null,
          recordedAt: new Date().toISOString(),
          notes: 'Αναμένει πρόβλεψη από το μοντέλο',
        },
        trainingEligibility: {
          status: 'NOT_REVIEWED',
          exclusionReason: null,
          reviewedAt: null,
          reviewedBy: null,
        },
      };

      setStep('done');
      onSave(prediction);

    } catch (err) {
      setStep('error');
      setError(err.message || 'Άγνωστο σφάλμα');
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Νέα πρόβλεψη</h2>
          <button className="modal-close" onClick={onClose}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        {step === 'upload' && (
          <div className="modal-body">
            <p className="modal-hint">
              Ανέβασε τα 5 XLS exports για υπόθεση <strong>χωρίς σύμβαση αναδιάρθρωσης</strong>.
              Το μοντέλο θα εκτιμήσει το πιθανό κούρεμα.
            </p>

            <div style={{ marginBottom: 14 }}>
              <div className="file-label" style={{ marginBottom: 6 }}>
                Αρ. αίτησης / αναγνωριστικό (προαιρετικό)
              </div>
              <input
                className="notes-input"
                style={{ width: '100%', maxWidth: '100%' }}
                value={caseIdInput}
                onChange={e => setCaseIdInput(e.target.value)}
                placeholder="π.χ. 443625"
              />
            </div>

            <div className="file-list">
              {XLS_FILES.map(f => (
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

            <div className="modal-footer">
              <button className="btn" onClick={onClose}>Ακύρωση</button>
              <button
                className="btn btn-primary"
                disabled={!allRequired}
                onClick={processFiles}
              >
                <i className="ti ti-cpu" aria-hidden="true" /> Εισαγωγή
              </button>
            </div>
          </div>
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
            <div className="done-text">Η πρόβλεψη αποθηκεύτηκε</div>
            <div className="processing-sub">
              Θα ενημερωθεί αυτόματα όταν το μοντέλο είναι έτοιμο.
            </div>
            <button className="btn btn-primary" onClick={onClose}>Εντάξει</button>
          </div>
        )}

        {step === 'error' && (
          <div className="modal-body modal-error">
            <i className="ti ti-alert-circle" style={{ fontSize: 48, color: 'var(--error)' }} aria-hidden="true" />
            <div className="error-text">Σφάλμα</div>
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
