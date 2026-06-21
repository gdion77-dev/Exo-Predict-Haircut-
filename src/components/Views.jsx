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
        const personRoles = Object.fromEntries((c.persons || []).map(pr => [pr.personId, pr.role]));
        const roleLabel = { APPLICANT: 'Αιτών', CO_DEBTOR: 'Συνοφειλέτης', SPOUSE: 'Σύζυγος', GUARANTOR: 'Εγγυητής' };
        return (
          <Card key={p.propertyId} style={{ marginBottom: 12 }}>
            <div className="asset-header">
              <span className="mono identity">{p.propertyId}</span>
              <Tag label="Ακίνητο" variant="muted" />
            </div>
            <Row label="Περιοχή" value={p.areaLabel || '—'} />
            {p.address && <Row label="Διεύθυνση" value={p.address} />}
            <div className="data-row">
              <span className="row-label">Συνιδιοκτήτες ({owners.length})</span>
              <div className="tag-row">
                {owners.map(o => (
                  <span key={o.personId} className="tag tag-muted" style={{ fontSize: 11 }}>
                    {roleLabel[personRoles[o.personId]] || 'Πρόσωπο'} · {o.personId}
                    {o.ownershipPercentage != null && ` · ${o.ownershipPercentage}%`}
                  </span>
                ))}
              </div>
            </div>
            <div className="data-row">
              <span className="row-label">Εξασφαλίσεις</span>
              <div className="tag-row">
                {links.map(l => (
                  <Tag key={l.collateralId} label={`${l.collateralId} · ${l.registrationPriority}η`} variant="warn" />
                ))}
              </div>
            </div>
            {(() => {
              const evid = c.propertyValueEvidences || [];
              const bookVal = evid.find(e => e.propertyId === p.propertyId && e.valueType === 'CREDITOR_COLLATERAL_VALUE')?.amountCents;
              const enfiaVal = evid.find(e => e.propertyId === p.propertyId && e.valueType === 'OBJECTIVE_OR_ENFIA_VALUE')?.amountCents;
              const liq = (() => {
                const book = bookVal != null ? Math.round(bookVal * 0.97) : null;
                if (enfiaVal == null && book == null) return null;
                if (enfiaVal == null) return book;
                if (book == null) return enfiaVal;
                return Math.max(enfiaVal, book);
              })();
              return (
                <>
                  <div className="data-row">
                    <span className="row-label">Αξία βιβλίων servicer</span>
                    <span className="row-value mono">{bookVal != null ? fmt(bookVal) : '—'}</span>
                  </div>
                  <div className="data-row">
                    <span className="row-label">Αντικειμενική / ΕΝΦΙΑ αξία</span>
                    <span className="row-value mono">{enfiaVal != null ? fmt(enfiaVal) : '—'}</span>
                  </div>
                  <div className="data-row" style={{ borderBottom: 'none' }}>
                    <span className="row-label"><strong>Αξία ρευστοποίησης</strong></span>
                    <span className="row-value mono green">{liq != null ? fmt(liq) : '—'}</span>
                  </div>
                </>
              );
            })()}
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
