import { useState, useCallback } from 'react';
import {
  parseIncomeXls,
  parseIncomeHistoryXls,
  parseAssetXls,
  parseFinancialAssetXls,
  parseCollateralXls,
} from '../parsers/xlsParser.js';
import {
  parseContractPdfWithClaude,
  buildContractData,
  assembleCaseFromParsed,
} from '../parsers/contractPdfParser.js';

const REQUIRED_FILES = [
  { key: 'income',         label: 'incomeXls.xls',          hint: 'Εισοδήματα τρέχοντος έτους',       accept: '.xls,.xlsx' },
  { key: 'incomeHistory',  label: 'incomeHistoryXls.xls',   hint: 'Ιστορικό εισοδημάτων',             accept: '.xls,.xlsx' },
  { key: 'asset',          label: 'assetXls.xls',           hint: 'Ακίνητα',                          accept: '.xls,.xlsx' },
  { key: 'financialAsset', label: 'financialAssetXls.xls',  hint: 'Χρηματοοικονομικά στοιχεία',      accept: '.xls,.xlsx' },
  { key: 'collateral',     label: 'collateralXls.xls',      hint: 'Εξασφαλίσεις',                    accept: '.xls,.xlsx' },
  { key: 'contract',       label: 'Σύμβαση αναδιάρθρωσης', hint: 'PDF σύμβαση Ν.4738/2020',          accept: '.pdf' },
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

  const allRequired = REQUIRED_FILES.every(f => files[f.key]);

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

      const incomeRecords        = parseIncomeXls(incomeWb, 'INCOME_EXPORT');
      const incomeHistoryRecords = parseIncomeHistoryXls(incomeHistoryWb);
      const assetData            = parseAssetXls(assetWb);
      const financialAssets      = parseFinancialAssetXls(financialWb);
      const collateralLinks      = parseCollateralXls(collWb);

      setProgress('Ανάλυση PDF με AI...');
      const claudeParsed  = await parseContractPdfWithClaude(files.contract);
      const contractData  = buildContractData(claudeParsed);

      if (!contractData.debts || contractData.debts.length === 0) {
        throw new Error('Δεν βρέθηκαν οφειλές στο PDF. Βεβαιώσου ότι ανέβασες σωστή σύμβαση αναδιάρθρωσης Ν.4738/2020.');
      }

      setProgress('Συναρμολόγηση υπόθεσης...');
      const assembled = assembleCaseFromParsed({
        incomeRecords, incomeHistoryRecords,
        assetData, financialAssets, collateralLinks,
        contractData,
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
                  Ανέβασε τα 5 XLS exports και την PDF σύμβαση. Τα αρχεία διαβάζονται τοπικά.
                  Το PDF αναλύεται αυτόματα με AI.
                </p>
                <div className="file-list">
                  {REQUIRED_FILES.map(f => (
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
