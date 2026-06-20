import { fmt } from '../utils.js';
import { Card, Tag, Alert, Row } from './UI.jsx';

// ─── Assets ──────────────────────────────────────────────────────────────────

export function AssetsView({ c }) {
  return (
    <div className="view-content">
      <div className="section-title">Ακίνητα ({c.properties.length})</div>
      {c.properties.map(p => {
        const links = c.collateralLinks.filter(l => l.propertyId === p.propertyId);
        const owners = c.propertyOwnerships.filter(o => o.propertyId === p.propertyId);
        return (
          <Card key={p.propertyId} style={{ marginBottom: 12 }}>
            <div className="asset-header">
              <span className="mono identity">{p.propertyId}</span>
              <Tag label="Ακίνητο" variant="muted" />
            </div>
            <Row label="Περιοχή" value={p.areaLabel || '—'} />
            <Row label="Ιδιοκτήτες" value={`${owners.length} συνιδιοκτήτες`} />
            <div className="data-row">
              <span className="row-label">Εξασφαλίσεις</span>
              <div className="tag-row">
                {links.map(l => (
                  <Tag key={l.collateralId} label={`${l.collateralId} · ${l.registrationPriority}η`} variant="warn" />
                ))}
              </div>
            </div>
            <div className="asset-warning">
              <i className="ti ti-alert-triangle" aria-hidden="true" />
              Δεν υπάρχει τεκμηριωμένη εμπορική αξία
            </div>
          </Card>
        );
      })}

      <div className="section-title" style={{ marginTop: 24 }}>Εξασφαλίσεις ({c.collateralLinks.length})</div>
      {c.collateralLinks.map(l => (
        <Card key={l.collateralId} style={{ marginBottom: 8 }}>
          <div className="asset-header">
            <span className="mono identity">{l.collateralId}</span>
            <Tag label={`Σειρά ${l.registrationPriority}`} variant="info" />
          </div>
          <div className="collateral-meta">
            Ακίνητο: <span className="mono">{l.propertyId}</span>
            {' · '}Καλύπτει {l.coveredDebtIds.length} εξασφαλισμένες οφειλές
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Income ──────────────────────────────────────────────────────────────────

export function IncomeView({ c }) {
  const years = [...new Set(c.incomes.map(i => i.taxYear))].sort((a, b) => b - a);
  return (
    <div className="view-content">
      {years.map(yr => {
        const rows = c.incomes.filter(i => i.taxYear === yr);
        const total = rows.reduce((s, r) => s + (r.netAmountCents || 0), 0);
        return (
          <Card key={yr} style={{ marginBottom: 12 }}>
            <div className="income-header">
              <div className="card-title">Φορολογικό έτος {yr}</div>
              <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{fmt(total)}</span>
            </div>
            {rows.map((r, i) => (
              <Row key={i} label={r.role || r.personId} value={fmt(r.netAmountCents)} />
            ))}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Training ─────────────────────────────────────────────────────────────────

export function TrainingView({ c, onApprove, onExclude }) {
  const warns = (c.dataQualityFlags || []).filter(f => f.startsWith('WARNING'));

  const checks = [
    ['Αρ. συμβάσεων επαληθευμένοι ως string',        true],
    ['Ποσά οφειλών από PDF επιβεβαιωμένα',            true],
    ['Αποτέλεσμα υπόθεσης καταχωρημένο',              c.outcome.status !== 'UNKNOWN'],
    ['Εμπορική αξία ακινήτων τεκμηριωμένη',           false],
    ['Δεν υπάρχουν null κρίσιμα ποσά οφειλών',        true],
    ['Συνοφειλέτης σωστά αντιστοιχισμένος ανά οφειλή', true],
  ];
  const allOk = checks.every(([, ok]) => ok);

  return (
    <div className="view-content">
      <Card style={{ marginBottom: 12 }}>
        <div className="card-title">Κατάσταση training eligibility</div>
        <div style={{ marginBottom: 12 }}>
          <Tag status={c.trainingEligibility.status} />
        </div>
        <p className="info-text">
          Μια υπόθεση γίνεται <strong>ELIGIBLE_VERIFIED</strong> μόνο μετά από ρητό έλεγχο.
          Η υπογραφή σύμβασης δεν αρκεί αυτόματα.
        </p>
        {c.trainingEligibility.reviewedAt && (
          <p className="info-text" style={{ marginTop: 6 }}>
            Τελευταίος έλεγχος: {new Date(c.trainingEligibility.reviewedAt).toLocaleString('el-GR')}
          </p>
        )}
      </Card>

      {warns.length > 0 && (
        <Card title="Εκκρεμότητες" style={{ marginBottom: 12 }}>
          {warns.map((w, i) => <Alert key={i} type="warn">{w}</Alert>)}
        </Card>
      )}

      <Card title="Checklist ελέγχου">
        {checks.map(([label, ok], i) => (
          <div key={i} className="check-row">
            <span className="check-label">{label}</span>
            <span className={`check-status ${ok ? 'green' : 'warn'}`}>
              <i className={`ti ${ok ? 'ti-check' : 'ti-alert-triangle'}`} aria-hidden="true" />
              {ok ? 'OK' : 'Εκκρεμεί'}
            </span>
          </div>
        ))}

        <div className="training-actions">
          <button
            className={`btn btn-primary${!allOk ? ' disabled' : ''}`}
            onClick={allOk ? onApprove : undefined}
            disabled={!allOk}
          >
            <i className="ti ti-check" aria-hidden="true" />
            Έγκριση για training
          </button>
          <button className="btn btn-warn" onClick={onExclude}>
            <i className="ti ti-x" aria-hidden="true" />
            Αποκλεισμός
          </button>
          {!allOk && (
            <span className="training-hint">Επίλυσε πρώτα τις εκκρεμότητες</span>
          )}
        </div>
      </Card>
    </div>
  );
}
