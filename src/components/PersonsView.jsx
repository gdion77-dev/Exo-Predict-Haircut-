import { fmt } from '../utils.js';
import { Card } from './UI.jsx';

const ROLE_LABEL = {
  APPLICANT: 'Αιτών',
  PRIMARY_DEBTOR: 'Αιτών',
  CO_DEBTOR: 'Συνοφειλέτης',
  GUARANTOR: 'Εγγυητής',
  SPOUSE: 'Σύζυγος',
};

const ROLE_COLOR = {
  APPLICANT: 'green',
  CO_DEBTOR: 'warn',
  GUARANTOR: 'info',
  SPOUSE: 'muted',
};

export default function PersonsView({ c }) {
  const persons = c.persons || [];
  const roles = c.debtPartyRoles || [];
  const debts = c.debts || [];
  const ownerships = c.propertyOwnerships || [];
  const incomes = c.incomes || [];

  // For each person, find their debts
  function personDebts(personId) {
    return roles
      .filter(r => r.personId === personId)
      .map(r => {
        const debt = debts.find(d => d.debtId === r.debtId);
        return debt ? { debt, role: r.role, signed: r.signedContract } : null;
      })
      .filter(Boolean);
  }

  function personProperties(personId) {
    return ownerships
      .filter(o => o.personId === personId)
      .map(o => o.propertyId);
  }

  function personIncome(personId) {
    const rows = incomes.filter(i => i.personId === personId);
    if (rows.length === 0) return null;
    const latest = Math.max(...rows.map(r => r.taxYear));
    return rows.find(r => r.taxYear === latest);
  }

  return (
    <div className="view-content">
      <div className="view-meta">
        {persons.length} πρόσωπα στην υπόθεση
        {c.household?.participatingCoDebtorCount > 0 &&
          ` · ${c.household.participatingCoDebtorCount} συνοφειλέτης/-ες`}
      </div>

      {persons.map(p => {
        const pDebts = personDebts(p.personId);
        const pProps = personProperties(p.personId);
        const pIncome = personIncome(p.personId);
        const roleColor = ROLE_COLOR[p.role] || 'muted';

        return (
          <Card key={p.personId} style={{ marginBottom: 14 }}>
            <div className="person-header">
              <div className="person-id-block">
                <span className={`tag tag-${roleColor}`} style={{ marginRight: 8 }}>
                  {ROLE_LABEL[p.role] || p.role}
                </span>
                <span className="mono" style={{ fontSize: 13, color: 'var(--text-sub)' }}>{p.personId}</span>
              </div>
              {pIncome && (
                <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                  {fmt(pIncome.netAmountCents)} <span style={{ color: 'var(--text-sub)', fontWeight: 400, fontSize: 11 }}>({pIncome.taxYear})</span>
                </span>
              )}
            </div>

            {/* Debts this person is liable for */}
            {pDebts.length > 0 && (
              <div className="person-section">
                <div className="person-section-label">
                  Οφειλές ({pDebts.length})
                </div>
                {pDebts.map(({ debt, role, signed }) => (
                  <div key={debt.debtId} className="person-debt-row">
                    <span className="mono" style={{ fontSize: 11 }}>{debt.debtIdentityRef}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="row-value mono">{fmt(debt.totalDebtCents)}</span>
                      {role === 'CO_DEBTOR' && signed === false && (
                        <span className="tag tag-red" style={{ fontSize: 10 }}>δεν υπέγραψε</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Properties */}
            {pProps.length > 0 && (
              <div className="person-section">
                <div className="person-section-label">Ακίνητα ({pProps.length})</div>
                <div className="tag-row">
                  {pProps.map(pid => (
                    <span key={pid} className="tag tag-muted mono" style={{ fontSize: 11 }}>{pid}</span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
