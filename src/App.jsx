import { useState, useEffect } from 'react';
import { DEMO_CASE } from './demoData.js';
import { STATUS_LABEL, statusClass, exportJson } from './utils.js';
import { loadCasesFromStorage, saveCasesToStorage, exportCasesJson } from './storage.js';
import { Tag } from './components/UI.jsx';
import OverviewView from './components/OverviewView.jsx';
import DebtsView from './components/DebtsView.jsx';
import { AssetsView, IncomeView, TrainingView } from './components/Views.jsx';
import NewCaseModal from './components/NewCaseModal.jsx';
import './App.css';

const VIEWS = [
  { id: 'overview', label: 'Επισκόπηση', icon: 'ti-layout-dashboard' },
  { id: 'debts',    label: 'Οφειλές',    icon: 'ti-credit-card' },
  { id: 'assets',   label: 'Ακίνητα',    icon: 'ti-building' },
  { id: 'income',   label: 'Εισοδήματα', icon: 'ti-receipt' },
  { id: 'training', label: 'Training',   icon: 'ti-brain' },
];

export default function App() {
  const [cases, setCases] = useState(() => loadCasesFromStorage());
  const [activeCase, setActiveCase] = useState(null);
  const [activeView, setActiveView] = useState('overview');
  const [showNewCase, setShowNewCase] = useState(false);

  // Auto-save to localStorage whenever cases change
  useEffect(() => {
    saveCasesToStorage(cases);
  }, [cases]);

  const caseList = Object.values(cases);
  const eligibleCount = caseList.filter(c => c.trainingEligibility.status === 'ELIGIBLE_VERIFIED').length;
  const currentCase = activeCase ? cases[activeCase] : null;

  function loadDemo() {
    setCases(prev => ({ ...prev, [DEMO_CASE.caseId]: { ...DEMO_CASE } }));
    setActiveCase(DEMO_CASE.caseId);
    setActiveView('overview');
  }

  function selectCase(id) {
    setActiveCase(id);
    setActiveView('overview');
  }

  function handleImport(data, isMultiple = false) {
    if (isMultiple) {
      // data is an object of cases
      setCases(prev => ({ ...prev, ...data }));
      const ids = Object.keys(data);
      if (ids.length > 0) { setActiveCase(ids[0]); setActiveView('overview'); }
    } else {
      // data is a single case
      setCases(prev => ({ ...prev, [data.caseId]: data }));
      setActiveCase(data.caseId);
      setActiveView('overview');
    }
    setShowNewCase(false);
  }

  function deleteCase(id) {
    if (!window.confirm('Διαγραφή υπόθεσης;')) return;
    setCases(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeCase === id) setActiveCase(null);
  }

  function approve() {
    setCases(prev => ({
      ...prev,
      [activeCase]: {
        ...prev[activeCase],
        trainingEligibility: {
          status: 'ELIGIBLE_VERIFIED',
          reviewedAt: new Date().toISOString(),
          reviewedBy: 'manual-review',
        },
      },
    }));
  }

  function exclude() {
    setCases(prev => ({
      ...prev,
      [activeCase]: {
        ...prev[activeCase],
        trainingEligibility: {
          status: 'EXCLUDED_INCOMPLETE',
          reviewedAt: new Date().toISOString(),
          reviewedBy: 'manual-review',
        },
      },
    }));
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="logo">
          Exo<span className="logo-accent">Predict</span>
          <span className="logo-sub"> PRO</span>
        </div>
        <span className="header-sep" aria-hidden="true">|</span>
        <span className="header-law">Ν.4738/2020</span>

        <div className="header-right">
          <span className="badge badge-muted">{caseList.length} υπόθεση/-ις</span>
          <span className="badge badge-green">{eligibleCount} ELIGIBLE</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewCase(true)}>
            <i className="ti ti-plus" aria-hidden="true" /> Νέα υπόθεση
          </button>
          <button className="btn btn-sm" onClick={loadDemo} title="Φόρτωση demo">
            <i className="ti ti-test-pipe" aria-hidden="true" /> Demo
          </button>
          <button
            className="btn btn-sm"
            onClick={() => exportCasesJson(cases)}
            disabled={caseList.length === 0}
            title="Export όλων των υποθέσεων ως JSON"
          >
            <i className="ti ti-download" aria-hidden="true" /> Export
          </button>
        </div>
      </header>

      <div className="layout">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-label">Υποθέσεις ({caseList.length})</div>
            {caseList.length === 0 && (
              <div className="sidebar-empty">
                Πάτα "Νέα υπόθεση" για να ξεκινήσεις
              </div>
            )}
            {caseList.map(c => (
              <div
                key={c.caseId}
                className={`case-item${activeCase === c.caseId ? ' active' : ''}`}
                onClick={() => selectCase(c.caseId)}
              >
                <div className="case-item-top">
                  <span className="case-id">{c.caseId}</span>
                  <button
                    className="case-delete"
                    onClick={e => { e.stopPropagation(); deleteCase(c.caseId); }}
                    title="Διαγραφή"
                  >
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                </div>
                <Tag status={c.trainingEligibility.status} />
              </div>
            ))}
          </div>

          {currentCase && (
            <div className="sidebar-section">
              <div className="sidebar-label">Προβολή</div>
              {VIEWS.map(v => (
                <button
                  key={v.id}
                  className={`nav-item${activeView === v.id ? ' active' : ''}`}
                  onClick={() => setActiveView(v.id)}
                >
                  <i className={`ti ${v.icon}`} aria-hidden="true" />
                  {v.label}
                </button>
              ))}
            </div>
          )}

          {caseList.length > 0 && (
            <div className="sidebar-section sidebar-footer">
              <div className="sidebar-label">Training dataset</div>
              <div className="sidebar-stat">
                <span>{eligibleCount} / {caseList.length}</span>
                <span className="sidebar-stat-label">εγκεκριμένες</span>
              </div>
              <div className="mini-bar-wrap" style={{ marginTop: 6 }}>
                <div
                  className="mini-bar-fill green"
                  style={{ width: caseList.length ? `${Math.round(eligibleCount/caseList.length*100)}%` : '0%' }}
                />
              </div>
            </div>
          )}
        </aside>

        {/* ── Main content ── */}
        <main className="content">
          {!currentCase ? (
            <div className="welcome">
              <div className="welcome-logo">
                Exo<span className="logo-accent">Predict</span>
                <span className="logo-sub"> PRO</span>
              </div>
              <p className="welcome-sub">
                Οργάνωση & ανάλυση υποθέσεων εξωδικαστικού μηχανισμού Ν.4738/2020
              </p>

              <div className="welcome-actions">
                <div className="upload-zone" onClick={() => setShowNewCase(true)}>
                  <i className="ti ti-folder-open" style={{ fontSize: 36 }} aria-hidden="true" />
                  <div className="upload-title">Νέα υπόθεση</div>
                  <div className="upload-sub">Ανέβασε XLS exports + PDF σύμβαση</div>
                  <div className="upload-files">
                    {['incomeXls.xls', 'assetXls.xls', 'collateralXls.xls', 'debtsSymmaryXls.xls', 'contract.pdf'].map(f => (
                      <span key={f} className="badge badge-muted">{f}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="welcome-links">
                <button className="btn btn-sm" onClick={loadDemo}>
                  <i className="ti ti-test-pipe" aria-hidden="true" /> Φόρτωση demo υπόθεσης
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => document.getElementById('json-import-top').click()}
                >
                  <i className="ti ti-database-import" aria-hidden="true" /> Εισαγωγή JSON
                </button>
                <input
                  id="json-import-top"
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (!e.target.files[0]) return;
                    const f = e.target.files[0];
                    f.text().then(t => {
                      const data = JSON.parse(t);
                      const cs = {};
                      (Array.isArray(data) ? data : [data]).forEach(c => { if (c.caseId) cs[c.caseId] = c; });
                      handleImport(cs, true);
                    });
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Case header */}
              <div className="case-header">
                <div>
                  <div className="case-title">{currentCase.caseId}</div>
                  <div className="case-meta">
                    Υποβολή: {currentCase.submissionDate || '—'}
                    {' · '}{currentCase.debts?.length || 0} οφειλές
                    {' · '}{currentCase.properties?.length || 0} ακίνητα
                    {currentCase._importedAt && (
                      <> · Εισαγωγή: {new Date(currentCase._importedAt).toLocaleDateString('el-GR')}</>
                    )}
                  </div>
                </div>
                <div className="case-badges">
                  <Tag status={currentCase.outcome?.status} />
                  <Tag status={currentCase.trainingEligibility?.status} />
                </div>
              </div>

              {/* View tabs */}
              <nav className="tabs" aria-label="Προβολές">
                {VIEWS.map(v => (
                  <button
                    key={v.id}
                    className={`tab${activeView === v.id ? ' active' : ''}`}
                    onClick={() => setActiveView(v.id)}
                  >
                    <i className={`ti ${v.icon}`} aria-hidden="true" />
                    {v.label}
                  </button>
                ))}
              </nav>

              {activeView === 'overview' && <OverviewView c={currentCase} />}
              {activeView === 'debts'    && <DebtsView    c={currentCase} />}
              {activeView === 'assets'   && <AssetsView   c={currentCase} />}
              {activeView === 'income'   && <IncomeView   c={currentCase} />}
              {activeView === 'training' && (
                <TrainingView c={currentCase} onApprove={approve} onExclude={exclude} />
              )}
            </>
          )}
        </main>
      </div>

      {/* ── New Case Modal ── */}
      {showNewCase && (
        <NewCaseModal
          onClose={() => setShowNewCase(false)}
          onImport={handleImport}
        />
      )}
    </div>
  );
}
