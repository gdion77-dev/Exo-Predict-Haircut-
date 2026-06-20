import { useState } from 'react';
import { DEMO_CASE } from './demoData.js';
import { STATUS_LABEL, statusClass, exportJson } from './utils.js';
import { Tag } from './components/UI.jsx';
import OverviewView from './components/OverviewView.jsx';
import DebtsView from './components/DebtsView.jsx';
import { AssetsView, IncomeView, TrainingView } from './components/Views.jsx';
import './App.css';

const VIEWS = [
  { id: 'overview', label: 'Επισκόπηση', icon: 'ti-layout-dashboard' },
  { id: 'debts',    label: 'Οφειλές',    icon: 'ti-credit-card' },
  { id: 'assets',   label: 'Ακίνητα',    icon: 'ti-building' },
  { id: 'income',   label: 'Εισοδήματα', icon: 'ti-receipt' },
  { id: 'training', label: 'Training',   icon: 'ti-brain' },
];

export default function App() {
  const [cases, setCases] = useState({});
  const [activeCase, setActiveCase] = useState(null);
  const [activeView, setActiveView] = useState('overview');

  const currentCase = activeCase ? cases[activeCase] : null;
  const caseList = Object.values(cases);
  const eligibleCount = caseList.filter(c => c.trainingEligibility.status === 'ELIGIBLE_VERIFIED').length;

  function loadDemo() {
    setCases(prev => ({ ...prev, [DEMO_CASE.caseId]: { ...DEMO_CASE } }));
    setActiveCase(DEMO_CASE.caseId);
    setActiveView('overview');
  }

  function selectCase(id) {
    setActiveCase(id);
    setActiveView('overview');
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
          <button className="btn btn-primary btn-sm" onClick={loadDemo}>
            <i className="ti ti-plus" aria-hidden="true" /> Demo υπόθεση
          </button>
          <button
            className="btn btn-sm"
            onClick={() => exportJson(caseList)}
            disabled={caseList.length === 0}
          >
            <i className="ti ti-download" aria-hidden="true" /> Export JSON
          </button>
        </div>
      </header>

      <div className="layout">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-label">Υποθέσεις</div>
            {caseList.length === 0 && (
              <div className="sidebar-empty">Καμία υπόθεση ακόμα</div>
            )}
            {caseList.map(c => (
              <button
                key={c.caseId}
                className={`case-item${activeCase === c.caseId ? ' active' : ''}`}
                onClick={() => selectCase(c.caseId)}
              >
                <span className="case-id">{c.caseId}</span>
                <Tag status={c.trainingEligibility.status} />
              </button>
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
              <div className="upload-zone" onClick={loadDemo}>
                <i className="ti ti-folder-open" style={{ fontSize: 36 }} aria-hidden="true" />
                <div className="upload-title">Ανέβασε αρχεία υπόθεσης</div>
                <div className="upload-sub">XLS exports + PDF σύμβαση αναδιάρθρωσης</div>
                <div className="upload-files">
                  {['incomeXls.xls', 'assetXls.xls', 'collateralXls.xls', 'debtsSymmaryXls.xls', 'contract.pdf'].map(f => (
                    <span key={f} className="badge badge-muted">{f}</span>
                  ))}
                </div>
              </div>
              <p className="upload-hint">ή κλίκ για φόρτωση demo υπόθεσης →</p>
            </div>
          ) : (
            <>
              {/* Case header */}
              <div className="case-header">
                <div>
                  <div className="case-title">{currentCase.caseId}</div>
                  <div className="case-meta">
                    Υποβολή: {currentCase.submissionDate}
                    {' · '}{currentCase.debts.length} οφειλές
                    {' · '}{currentCase.properties.length} ακίνητα
                  </div>
                </div>
                <div className="case-badges">
                  <Tag status={currentCase.outcome.status} />
                  <Tag status={currentCase.trainingEligibility.status} />
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

              {/* View content */}
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
    </div>
  );
}
