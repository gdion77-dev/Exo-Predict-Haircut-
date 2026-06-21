import { useState, useEffect } from 'react';
import { DEMO_CASE } from './demoData.js';
import { exportJson } from './utils.js';
import {
  saveCase, loadAllCases, deleteCase as fbDeleteCase,
  savePrediction, loadAllPredictions, deletePrediction as fbDeletePrediction,
} from './firebase.js';
import { Tag } from './components/UI.jsx';
import OverviewView from './components/OverviewView.jsx';
import DebtsView from './components/DebtsView.jsx';
import { AssetsView, IncomeView, TrainingView } from './components/Views.jsx';
import PersonsView from './components/PersonsView.jsx';
import AdditionalFieldsView from './components/AdditionalFieldsView.jsx';
import NewCaseModal from './components/NewCaseModal.jsx';
import PredictionModal from './components/PredictionModal.jsx';
import './App.css';

const CASE_VIEWS = [
  { id: 'overview', label: 'Επισκόπηση', icon: 'ti-layout-dashboard' },
  { id: 'debts',    label: 'Οφειλές',    icon: 'ti-credit-card' },
  { id: 'assets',   label: 'Ακίνητα',    icon: 'ti-building' },
  { id: 'persons',  label: 'Πρόσωπα',    icon: 'ti-users' },
  { id: 'income',   label: 'Εισοδήματα', icon: 'ti-receipt' },
  { id: 'extra',    label: 'Πρόσθετα',   icon: 'ti-clipboard-plus' },
  { id: 'training', label: 'Training',   icon: 'ti-brain' },
];

const PRED_VIEWS = [
  { id: 'overview', label: 'Επισκόπηση', icon: 'ti-layout-dashboard' },
  { id: 'income',   label: 'Εισοδήματα', icon: 'ti-receipt' },
  { id: 'assets',   label: 'Ακίνητα',    icon: 'ti-building' },
  { id: 'persons',  label: 'Πρόσωπα',    icon: 'ti-users' },
  { id: 'result',   label: 'Αποτέλεσμα', icon: 'ti-crystal-ball' },
];

export default function App() {
  const [cases, setCases] = useState({});
  const [predictions, setPredictions] = useState({});
  const [sidebarTab, setSidebarTab] = useState('cases'); // 'cases' | 'predictions'
  const [activeCase, setActiveCase] = useState(null);
  const [activePred, setActivePred] = useState(null);
  const [activeView, setActiveView] = useState('overview');
  const [showNewCase, setShowNewCase] = useState(false);
  const [showNewPred, setShowNewPred] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState('');

  useEffect(() => {
    Promise.all([loadAllCases(), loadAllPredictions()])
      .then(([c, p]) => { setCases(c); setPredictions(p); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const caseList = Object.values(cases);
  const predList = Object.values(predictions);
  const eligibleCount = caseList.filter(c => c.trainingEligibility?.status === 'ELIGIBLE_VERIFIED').length;

  const currentCase = activeCase ? cases[activeCase] : null;
  const currentPred = activePred ? predictions[activePred] : null;
  const current = sidebarTab === 'cases' ? currentCase : currentPred;

  async function sync(fn) {
    setSyncStatus('saving');
    try { await fn(); setSyncStatus('saved'); setTimeout(() => setSyncStatus('idle'), 2000); }
    catch { setSyncStatus('error'); }
  }

  async function handleAddCase(data) {
    await sync(async () => {
      await saveCase(data);
      setCases(prev => ({ ...prev, [data.caseId]: data }));
      setActiveCase(data.caseId); setActivePred(null);
      setSidebarTab('cases'); setActiveView('overview');
    });
    setShowNewCase(false);
  }

  async function handleAddPrediction(data) {
    await sync(async () => {
      await savePrediction(data);
      setPredictions(prev => ({ ...prev, [data.caseId]: data }));
      setActivePred(data.caseId); setActiveCase(null);
      setSidebarTab('predictions'); setActiveView('overview');
    });
    setShowNewPred(false);
  }

  async function handleImport(data, isMultiple = false) {
    const newCases = isMultiple ? data : { [data.caseId]: data };
    await sync(async () => {
      await Promise.all(Object.values(newCases).map(c => saveCase(c)));
      setCases(prev => ({ ...prev, ...newCases }));
      const ids = Object.keys(newCases);
      if (ids.length > 0) {
        setActiveCase(ids[0]); setActivePred(null);
        setSidebarTab('cases'); setActiveView('overview');
      }
    });
    setShowNewCase(false);
  }

  async function handleDeleteCase(id) {
    if (!window.confirm('Διαγραφή υπόθεσης;')) return;
    await fbDeleteCase(id);
    setCases(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (activeCase === id) setActiveCase(null);
  }

  async function handleDeletePrediction(id) {
    if (!window.confirm('Διαγραφή πρόβλεψης;')) return;
    await fbDeletePrediction(id);
    setPredictions(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (activePred === id) setActivePred(null);
  }

  async function updateCurrentCase(updated) {
    await sync(async () => {
      await saveCase(updated);
      setCases(prev => ({ ...prev, [updated.caseId]: updated }));
    });
  }

  async function updateCurrentPred(updated) {
    await sync(async () => {
      await savePrediction(updated);
      setPredictions(prev => ({ ...prev, [updated.caseId]: updated }));
    });
  }

  async function approve() {
    await updateCurrentCase({
      ...cases[activeCase],
      trainingEligibility: { status: 'ELIGIBLE_VERIFIED', reviewedAt: new Date().toISOString(), reviewedBy: 'manual-review' },
    });
  }

  async function exclude() {
    await updateCurrentCase({
      ...cases[activeCase],
      trainingEligibility: { status: 'EXCLUDED_INCOMPLETE', reviewedAt: new Date().toISOString(), reviewedBy: 'manual-review' },
    });
  }

  async function saveNote() {
    if (sidebarTab === 'cases' && currentCase) {
      await updateCurrentCase({ ...currentCase, notes: noteValue });
    } else if (sidebarTab === 'predictions' && currentPred) {
      await updateCurrentPred({ ...currentPred, notes: noteValue });
    }
    setEditingNote(false);
  }

  async function saveAdditionalFields(fields) {
    const updated = { ...current, additionalFields: fields };
    if (sidebarTab === 'cases') await updateCurrentCase(updated);
    else await updateCurrentPred(updated);
  }

  function startEditNote() {
    setNoteValue(current?.notes || '');
    setEditingNote(true);
  }

  function loadDemo() {
    handleAddCase({ ...DEMO_CASE });
  }

  const views = sidebarTab === 'cases' ? CASE_VIEWS : PRED_VIEWS;

  return (
    <div className="app">
      <header className="header">
        <div className="logo">Exo<span className="logo-accent">Predict</span><span className="logo-sub"> PRO</span></div>
        <span className="header-sep">|</span>
        <span className="header-law">Ν.4738/2020</span>
        <div className="header-right">
          {syncStatus === 'saving' && <span className="sync-status saving">⟳ Αποθήκευση...</span>}
          {syncStatus === 'saved'  && <span className="sync-status saved">✓ Αποθηκεύτηκε</span>}
          {syncStatus === 'error'  && <span className="sync-status error">✗ Σφάλμα</span>}
          <span className="badge badge-muted">{caseList.length} υποθέσεις</span>
          <span className="badge badge-green">{eligibleCount} ELIGIBLE</span>
          <span className="badge badge-warn">{predList.length} προβλέψεις</span>
          <button className="btn btn-primary btn-sm" onClick={() => sidebarTab === 'cases' ? setShowNewCase(true) : setShowNewPred(true)}>
            <i className="ti ti-plus" /> {sidebarTab === 'cases' ? 'Νέα υπόθεση' : 'Νέα πρόβλεψη'}
          </button>
          <button className="btn btn-sm" onClick={loadDemo} title="Demo"><i className="ti ti-test-pipe" /></button>
          <button className="btn btn-sm" onClick={() => exportJson(sidebarTab === 'cases' ? cases : predictions)} disabled={caseList.length === 0 && predList.length === 0}>
            <i className="ti ti-download" /> Export
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          {/* Sidebar tabs */}
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab${sidebarTab === 'cases' ? ' active' : ''}`}
              onClick={() => { setSidebarTab('cases'); setActivePred(null); setActiveView('overview'); }}
            >
              <i className="ti ti-files" /> Υποθέσεις
              <span className="sidebar-tab-count">{caseList.length}</span>
            </button>
            <button
              className={`sidebar-tab${sidebarTab === 'predictions' ? ' active' : ''}`}
              onClick={() => { setSidebarTab('predictions'); setActiveCase(null); setActiveView('overview'); }}
            >
              <i className="ti ti-crystal-ball" /> Προβλέψεις
              <span className="sidebar-tab-count">{predList.length}</span>
            </button>
          </div>

          <div className="sidebar-section">
            {loading && <div className="sidebar-empty">Φόρτωση... ⟳</div>}

            {/* Cases list */}
            {sidebarTab === 'cases' && !loading && (
              <>
                {caseList.length === 0 && <div className="sidebar-empty">Πάτα "Νέα υπόθεση"</div>}
                {caseList.map(c => (
                  <div key={c.caseId}
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
              </>
            )}

            {/* Predictions list */}
            {sidebarTab === 'predictions' && !loading && (
              <>
                {predList.length === 0 && <div className="sidebar-empty">Πάτα "Νέα πρόβλεψη"</div>}
                {predList.map(p => (
                  <div key={p.caseId}
                    className={`case-item${activePred === p.caseId ? ' active' : ''}`}
                    onClick={() => { setActivePred(p.caseId); setActiveView('overview'); setEditingNote(false); }}
                  >
                    <div className="case-item-top">
                      <span className="case-id">{p.caseId}</span>
                      <button className="case-delete" onClick={e => { e.stopPropagation(); handleDeletePrediction(p.caseId); }}>
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                    {p.notes && <div className="case-note-preview">{p.notes}</div>}
                    <span className={`tag ${p._predictionResult ? 'tag-green' : 'tag-warn'}`}>
                      {p._predictionResult ? `Κούρεμα: ${p._predictionResult}%` : 'Αναμένει μοντέλο'}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          {current && (
            <div className="sidebar-section">
              <div className="sidebar-label">Προβολή</div>
              {views.map(v => (
                <button key={v.id} className={`nav-item${activeView === v.id ? ' active' : ''}`}
                  onClick={() => { setActiveView(v.id); setEditingNote(false); }}>
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

        <main className="content">
          {!current ? (
            <div className="welcome">
              <div className="welcome-logo">Exo<span className="logo-accent">Predict</span><span className="logo-sub"> PRO</span></div>
              <p className="welcome-sub">Οργάνωση & ανάλυση υποθέσεων εξωδικαστικού μηχανισμού Ν.4738/2020</p>
              <div className="welcome-cards">
                <div className="welcome-card" onClick={() => { setSidebarTab('cases'); setShowNewCase(true); }}>
                  <i className="ti ti-file-text" style={{ fontSize: 32, color: 'var(--accent)' }} />
                  <div className="welcome-card-title">Νέα Υπόθεση</div>
                  <div className="welcome-card-sub">XLS + PDF σύμβαση<br/>Γνωστό αποτέλεσμα → Training data</div>
                </div>
                <div className="welcome-card" onClick={() => { setSidebarTab('predictions'); setShowNewPred(true); }}>
                  <i className="ti ti-crystal-ball" style={{ fontSize: 32, color: 'var(--warn)' }} />
                  <div className="welcome-card-title">Νέα Πρόβλεψη</div>
                  <div className="welcome-card-sub">Μόνο XLS αρχεία<br/>Άγνωστο αποτέλεσμα → Πρόβλεψη ML</div>
                </div>
              </div>
              <div className="welcome-links">
                <button className="btn btn-sm" onClick={loadDemo}><i className="ti ti-test-pipe" /> Demo</button>
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
              <div className="case-header">
                <div>
                  <div className="case-title">{current.caseId}</div>
                  <div className="case-meta">
                    {sidebarTab === 'cases'
                      ? <>Υποβολή: {current.submissionDate || '—'} · {current.debts?.length || 0} οφειλές · {current.properties?.length || 0} ακίνητα</>
                      : <>Πρόβλεψη · {current.properties?.length || 0} ακίνητα · {current.incomes?.length || 0} εισοδήματα</>
                    }
                  </div>
                  <div className="case-notes">
                    {editingNote ? (
                      <div className="notes-edit">
                        <input className="notes-input" value={noteValue} onChange={e => setNoteValue(e.target.value)}
                          placeholder="π.χ. Πελάτης Α — Σάμος" autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditingNote(false); }} />
                        <button className="btn btn-primary btn-sm" onClick={saveNote}>Αποθήκευση</button>
                        <button className="btn btn-sm" onClick={() => setEditingNote(false)}>Ακύρωση</button>
                      </div>
                    ) : (
                      <div className="notes-display" onClick={startEditNote}>
                        <i className="ti ti-note" />
                        {current.notes
                          ? <span className="notes-text">{current.notes}</span>
                          : <span className="notes-placeholder">+ Προσθήκη σημείωσης...</span>
                        }
                      </div>
                    )}
                  </div>
                </div>
                <div className="case-badges">
                  {sidebarTab === 'cases' && (
                    <>
                      <Tag status={current.outcome?.status} />
                      <Tag status={current.trainingEligibility?.status} />
                    </>
                  )}
                  {sidebarTab === 'predictions' && (
                    <span className={`tag ${current._predictionResult ? 'tag-green' : 'tag-warn'}`}>
                      {current._predictionResult ? `Εκτιμώμενο κούρεμα: ${current._predictionResult}%` : 'Αναμένει μοντέλο ML'}
                    </span>
                  )}
                </div>
              </div>

              <nav className="tabs">
                {views.map(v => (
                  <button key={v.id} className={`tab${activeView === v.id ? ' active' : ''}`}
                    onClick={() => { setActiveView(v.id); setEditingNote(false); }}>
                    <i className={`ti ${v.icon}`} /> {v.label}
                  </button>
                ))}
              </nav>

              {activeView === 'overview' && <OverviewView c={current} />}
              {activeView === 'debts'    && <DebtsView    c={current} />}
              {activeView === 'assets'   && <AssetsView   c={current} />}
              {activeView === 'persons'  && <PersonsView  c={current} />}
              {activeView === 'income'   && <IncomeView   c={current} />}
              {activeView === 'extra'    && <AdditionalFieldsView c={current} onSave={saveAdditionalFields} />}
              {activeView === 'training' && sidebarTab === 'cases' && (
                <TrainingView c={current} onApprove={approve} onExclude={exclude} />
              )}
              {activeView === 'result' && sidebarTab === 'predictions' && (
                <div className="view-content">
                  <div className="pred-result-card">
                    <i className="ti ti-crystal-ball" style={{ fontSize: 48, color: 'var(--warn)', marginBottom: 16 }} />
                    <div className="pred-result-title">
                      {current._predictionResult
                        ? `Εκτιμώμενο κούρεμα: ${current._predictionResult}%`
                        : 'Αναμένει εκπαίδευση μοντέλου'
                      }
                    </div>
                    <div className="pred-result-sub">
                      {current._predictionResult
                        ? 'Αποτέλεσμα βάσει εκπαιδευμένου ML μοντέλου'
                        : `Χρειάζονται τουλάχιστον 30 εγκεκριμένες υποθέσεις. Τρέχουσα κατάσταση: ${Object.values(cases).filter(c => c.trainingEligibility?.status === 'ELIGIBLE_VERIFIED').length} / 30`
                      }
                    </div>
                    {!current._predictionResult && (
                      <div className="pred-progress">
                        <div className="mini-bar-wrap" style={{ width: '100%', marginTop: 12 }}>
                          <div className="mini-bar-fill green"
                            style={{ width: `${Math.min(100, Math.round(eligibleCount/30*100))}%` }} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 4 }}>
                          {eligibleCount}/30 υποθέσεις για εκπαίδευση μοντέλου
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {showNewCase && <NewCaseModal onClose={() => setShowNewCase(false)} onImport={handleImport} />}
      {showNewPred && <PredictionModal onClose={() => setShowNewPred(false)} onSave={handleAddPrediction} />}
    </div>
  );
}
