import { fmt } from '../utils.js';
import { Tag, HaircutBar } from './UI.jsx';

export default function DebtsView({ c }) {
  const termMap = Object.fromEntries(c.proposalTerms.map(t => [t.debtId, t]));

  return (
    <div className="view-content">
      <div className="view-meta">
        {c.debts.length} οφειλές · όλες προς DOVALUE_GREECE / XYQ Luxco S.à r.l.
      </div>
      {c.debts.map(d => {
        const t = termMap[d.debtId];
        const secured = t?.isCollateralSecured === true;
        return (
          <div key={d.debtId} className="debt-card">
            <div className="debt-card-header">
              <span className="mono identity">{d.debtIdentityRef}</span>
              <div className="debt-tags">
                <Tag label={secured ? 'Εξασφαλισμένη' : 'Ανεξασφάλιστη'} variant={secured ? 'green' : 'muted'} />
                {t && <Tag label={`${(t.spreadBasisPoints / 100).toFixed(2)}%`} variant="warn" />}
              </div>
            </div>

            {t && (
              <HaircutBar writeOff={t.writeOffAmountCents} total={t.totalDebtBeforeCents} />
            )}

            <div className="debt-card-rows">
              <div className="data-row">
                <span className="row-label">Σύνολο οφειλής</span>
                <span className="row-value mono">{fmt(d.totalDebtCents)}</span>
              </div>
              <div className="data-row">
                <span className="row-label">Κεφάλαιο</span>
                <span className="row-value mono">{fmt(d.principalAmountCents)}</span>
              </div>
              <div className="data-row">
                <span className="row-label">Τόκοι υπερημερίας</span>
                <span className="row-value mono red">{fmt(d.overdueInterestCents)}</span>
              </div>
              {t && <>
                <div className="data-row">
                  <span className="row-label">Ποσό διαγραφής</span>
                  <span className="row-value mono red">{fmt(t.writeOffAmountCents)}</span>
                </div>
                <div className="data-row">
                  <span className="row-label">Τελικό ποσό ρύθμισης</span>
                  <span className="row-value mono green">{fmt(t.finalRegulatedAmountCents)}</span>
                </div>
                <div className="data-row">
                  <span className="row-label">Μηνιαία δόση</span>
                  <span className="row-value mono">{fmt(t.installmentAmountCents)}</span>
                </div>
                <div className="data-row">
                  <span className="row-label">Διάρκεια</span>
                  <span className="row-value mono">{t.paymentTermMonths} μήνες</span>
                </div>
                <div className="data-row last">
                  <span className="row-label">Επιτόκιο</span>
                  <span className="row-value mono">{t.rateBase} + {(t.spreadBasisPoints / 100).toFixed(2)}%</span>
                </div>
              </>}
            </div>
            <div className="debt-contract">
              Σύμβαση: <span className="mono">{d.contractNumber}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
