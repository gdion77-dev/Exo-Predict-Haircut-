import { fmt, pct } from '../utils.js';
import { Card, Row, Alert } from './UI.jsx';

export default function OverviewView({ c }) {
  const totalDebt  = c.debts.reduce((s, d) => s + (d.totalDebtCents || 0), 0);
  const totalWO    = c.proposalTerms.reduce((s, t) => s + (t.writeOffAmountCents || 0), 0);
  const totalReg   = c.proposalTerms.reduce((s, t) => s + (t.finalRegulatedAmountCents || 0), 0);
  const latestYr   = Math.max(...c.incomes.map(i => i.taxYear));
  const totalInc   = c.incomes.filter(i => i.taxYear === latestYr).reduce((s, i) => s + (i.netAmountCents || 0), 0);
  const monthly    = c.proposalTerms.reduce((s, t) => s + (t.installmentAmountCents || 0), 0);
  const woPct      = pct(totalWO, totalDebt);
  const burden     = totalInc ? Math.round((monthly / (totalInc / 12)) * 100) : null;

  return (
    <div className="view-content">
      <div className="grid grid-3">
        <Card>
          <div className="stat-label">Συνολική οφειλή</div>
          <div className="stat-value">{fmt(totalDebt)}</div>
        </Card>
        <Card>
          <div className="stat-label">Συνολική διαγραφή</div>
          <div className="stat-value red">{fmt(totalWO)}</div>
          <div className="mini-bar-wrap">
            <div className="mini-bar-fill red" style={{ width: `${woPct}%` }} />
          </div>
          <div className="stat-sub">{woPct}% της συνολικής οφειλής</div>
        </Card>
        <Card>
          <div className="stat-label">Τελικό ποσό ρύθμισης</div>
          <div className="stat-value green">{fmt(totalReg)}</div>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Εισόδημα & επιβάρυνση">
          <Row label={`Ετήσιο εισόδημα (${latestYr})`} value={fmt(totalInc)} />
          <Row label="Μηνιαία δόση (σύνολο)" value={fmt(monthly)} valueClass="warn" />
          <Row
            label="Επιβάρυνση / μηνιαίο εισόδημα"
            value={burden !== null ? burden + '%' : '—'}
            valueClass={burden > 40 ? 'red' : 'warn'}
          />
        </Card>

        <Card title="Νοικοκυριό">
          <Row label="Μέγεθος νοικοκυριού"     value={c.household.householdSize ?? '—'} />
          <Row label="Σύζυγος / σύντροφος"      value={c.household.spouseOrPartnerPresent ? 'Ναι' : 'Όχι'} />
          <Row label="Συμμετέχοντες συνοφειλέτες" value={c.household.participatingCoDebtorCount ?? '—'} />
          <Row label="Εξαρτώμενα τέκνα"         value={c.household.dependentChildrenCount ?? '—'} />
        </Card>
      </div>

      {c.financialAssets?.length > 0 && (
        <Card title="Χρηματοοικονομικά στοιχεία" style={{ marginBottom: 16 }}>
          {c.financialAssets.map((a, i) => (
            <Row key={i} label={`${a.institutionKey} · ${a.asOfDate}`} value={fmt(a.balanceCents)} />
          ))}
        </Card>
      )}

      {c.dataQualityFlags?.length > 0 && (
        <Card title="Ποιότητα δεδομένων">
          {c.dataQualityFlags.map((f, i) => (
            <Alert key={i} type={f.startsWith('WARNING') ? 'warn' : 'info'}>{f}</Alert>
          ))}
        </Card>
      )}
    </div>
  );
}
