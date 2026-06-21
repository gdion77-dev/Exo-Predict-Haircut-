import { useState, useEffect, useCallback } from 'react';
import { DEMO_CASE } from './demoData.js';
import { STATUS_LABEL, statusClass, exportJson } from './utils.js';
import { saveCase, loadAllCases, deleteCase as fbDeleteCase } from './firebase.js';
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
  const [cases, setCases] = useState({});
  const [activeCase, setActiveCase] = useState(null);
  const [activeView, setActiveView] = useState('overview');
  const [showNewCase, setShowNewCase] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | saving | saved | error
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState('');

  // Load from Firebase on startup
  useEffect(() => {
    loadAllCases()
      .then(data => { setCases(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const caseList = Object.values(cases);
  const eligibleCount = caseList.filter(c => c.trainingEligibility?.status === 'ELIGIBLE_VERIFIED').length;
  const currentCase = activeCase ? cases[activeCase] : null;

  async function addCase(caseData) {
    setSyncStatus('saving');
    try {
      await saveCase(caseData);
      setCases(prev => ({ ...prev, [caseData.caseId]: caseData }));
      setActiveCase(caseData.caseId);
      setActiveView('overview');
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch {
      setSyncStatus('error');
    }
  }

  async function handleImport(data, isMultiple = false) {
    const newCases = isMultiple ? data : { [data.caseId]: data };
    setSyncStatus('saving');
    try {
      await Promise.all(Object.values(newCases).map(c => saveCase(c)));
      setCases(prev => ({ ...prev, ...newCases }));
      const ids = Object.keys(newCases);
      if (ids.length > 0) { setActiveCase(ids[0]); setActiveView('overview'); }
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch {
      setSyncStatus('error');
    }
    setShowNewCase(false);
  }

  async function handleDeleteCase(id) {
    if (!window.confirm('Διαγραφή υπόθεσης;')) return;
    await fbDeleteCase(id);
    setCases(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (activeCase === id) setActiveCase(null);
  }

  async function updateCase(updated) {
    setSyncStatus('saving');
    try {
      await saveCase(updated);
      setCases(prev => ({ ...prev, [updated.caseId]: updated }));
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch {
      setSyncStatus('error');
    }
  }

  async function approve() {
    const updated = {
      ...cases[activeCase],
      trainingEligibility: {
        status: 'ELIGIBLE_VERIFIED',
        reviewedAt: new Date().toISOString(),
        reviewedBy: 'manual-review',
      },
    };
    await updateCase(updated);
  }

  async function exclude() {
    const updated = {
      ...cases[activeCase],
      trainingEligibility: {
        status: 'EXCLUDED_INCOMPLETE',
        reviewedAt: new Date().toISOString(),
        reviewedBy: 'manual-review',
      },
    };
    await updateCase(updated);
  }

  async function saveNote() {
    const updated = { ...cases[activeCase], notes: noteValue };
    await updateCase(updated);
    setEditingNote(false);
  }

  function startEditNote() {
    setNoteValue(currentCase?.notes || '');
    setEditingNote(true);
  }

  function loadDemo() {
    addCase({ ...DEMO_CASE });
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="logo">
          Exo<span className="logo-accent">Predict</span>
          <span className="logo-sub"> PRO</span>
        </div>
        <span className="header-sep">|</span>
        <span className="header-law">Ν.4738/2020</span>

        <div className="header-right">
          {syncStatus === 'saving' && <span className="sync-status saving">⟳ Αποθήκευση...</span>}
          {syncStatus === 'saved'  && <span className="sync-status saved">✓ Αποθηκεύτηκε</span>}
          {syncStatus === 'error'  && <span className="sync-status error">✗ Σφάλμα σύνδεσης</span>}
          <span className="badge badge-muted">{caseList.length} υπόθεση/-ις</span>
          <span className="badge badge-green">{eligibleCount} ELIGIBLE</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewCase(true)}>
            <i className="ti ti-plus" /> Νέα υπόθεση
          </button>
          <button className="btn btn-sm" onClick={loadDemo} title="Demo">
            <i className="ti ti-test-pipe" /> Demo
          </button>
          <button className="btn btn-sm" onClick={() => exportJson(cases)} disabled={caseList.length === 0}>
            <i className="ti ti-download" /> Export
          </button>
        </div>
      </header>

      <div className="layout">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-label">
              Υποθέσεις ({caseList.length})
              {loading && <span style={{ color: 'var(--text-sub)', marginLeft: 6 }}>⟳</span>}
            </div>
            {!loading && caseList.length === 0 && (
              <div className="sidebar-empty">Πάτα "Νέα υπόθεση" για να ξεκινήσεις</div>
            )}
            {caseList.map(c => (
              <div
                key={c.caseId}
                className={`case-item${activeCase === c.caseId ? ' active' : ''}`}
                onClick={() => { setActiveCase(c.caseId); setActiveView('overview'); setEditingNote(false); }}
              >
                <div className="case-item-top">
                  <span className="case-id">{c.caseId}</span>
                  <button className="case-delete" onClick={e => { e.stopPropagation(); handleDeleteCase(c.caseId); }}>
                    <i className="ti ti-trash" />
                  </button>
                </div>
                {c.notes && <div className="case-note-preview">{c.notes}</div>}
                <Tag status={c.trainingEligibility?.status} />
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
                  onClick={() => { setActiveView(v.id); setEditingNote(false); }}
                >
                  <i className={`ti ${v.icon}`} /> {v.label}
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
                <div className="mini-bar-fill green"
                  style={{ width: caseList.length ? `${Math.round(eligibleCount/caseList.length*100)}%` : '0%' }} />
              </div>
            </div>
          )}
        </aside>

        {/* ── Content ── */}
        <main className="content">
          {!currentCase ? (
            <div className="welcome">
              <div className="welcome-logo">
                Exo<span className="logo-accent">Predict</span>
                <span className="logo-sub"> PRO</span>
              </div>
              <p className="welcome-sub">Οργάνωση & ανάλυση υποθέσεων εξωδικαστικού μηχανισμού Ν.4738/2020</p>
              <div className="welcome-actions">
                <div className="upload-zone" onClick={() => setShowNewCase(true)}>
                  <i className="ti ti-folder-open" style={{ fontSize: 36 }} />
                  <div className="upload-title">Νέα υπόθεση</div>
                  <div className="upload-sub">Ανέβασε XLS exports + PDF σύμβαση</div>
                  <div className="upload-files">
                    {['incomeXls.xls','assetXls.xls','collateralXls.xls','debtsSymmaryXls.xls','contract.pdf'].map(f => (
                      <span key={f} className="badge badge-muted">{f}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="welcome-links">
                <button className="btn btn-sm" onClick={loadDemo}>
                  <i className="ti ti-test-pipe" /> Demo υπόθεση
                </button>
                <button className="btn btn-sm" onClick={() => document.getElementById('json-top').click()}>
                  <i className="ti ti-database-import" /> Εισαγωγή JSON
                </button>
                <input id="json-top" type="file" accept=".json" style={{ display:'none' }}
                  onChange={e => {
                    if (!e.target.files[0]) return;
                    e.target.files[0].text().then(t => {
                      const d = JSON.parse(t);
                      const cs = {};
                      (Array.isArray(d) ? d : [d]).forEach(c => { if (c.caseId) cs[c.caseId] = c; });
                      handleImport(cs, true);
                    });
                  }} />
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
                  </div>
                  {/* ── Notes field ── */}
                  <div className="case-notes">
                    {editingNote ? (
                      <div className="notes-edit">
                        <input
                          className="notes-input"
                          value={noteValue}
                          onChange={e => setNoteValue(e.target.value)}
                          placeholder="π.χ. Πελάτης Α — Σάμος"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditingNote(false); }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={saveNote}>Αποθήκευση</button>
                        <button className="btn btn-sm" onClick={() => setEditingNote(false)}>Ακύρωση</button>
                      </div>
                    ) : (
                      <div className="notes-display" onClick={startEditNote}>
                        <i className="ti ti-note" />
                        {currentCase.notes
                          ? <span className="notes-text">{currentCase.notes}</span>
                          : <span className="notes-placeholder">+ Προσθήκη σημείωσης...</span>
                        }
                      </div>
                    )}
                  </div>
                </div>
                <div className="case-badges">
                  <Tag status={currentCase.outcome?.status} />
                  <Tag status={currentCase.trainingEligibility?.status} />
                </div>
              </div>

              {/* Tabs */}
              <nav className="tabs">
                {VIEWS.map(v => (
                  <button key={v.id} className={`tab${activeView === v.id ? ' active' : ''}`}
                    onClick={() => { setActiveView(v.id); setEditingNote(false); }}>
                    <i className={`ti ${v.icon}`} /> {v.label}
                  </button>
                ))}
              </nav>

              {activeView === 'overview' && <OverviewView c={currentCase} />}
              {activeView === 'debts'    && <DebtsView    c={currentCase} />}
              {activeView === 'assets'   && <AssetsView   c={currentCase} />}
              {activeView === 'income'   && <IncomeView   c={currentCase} />}
              {activeView === 'training' && <TrainingView c={currentCase} onApprove={approve} onExclude={exclude} />}
            </>
          )}
        </main>
      </div>

      {showNewCase && <NewCaseModal onClose={() => setShowNewCase(false)} onImport={handleImport} />}
    </div>
  );
}
