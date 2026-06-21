import { fmt } from '../utils.js';
import { Tag, HaircutBar } from './UI.jsx';

const ROLE_LABEL = {
  PRIMARY_DEBTOR: 'Αιτών',
  CO_DEBTOR: 'Συνοφειλέτης',
  GUARANTOR: 'Εγγυητής',
  SPOUSE: 'Σύζυγος',
};

const ROLE_SHORT = {
  PRIMARY_DEBTOR: 'Αιτών',
  CO_DEBTOR: 'Συνοφ.',
  GUARANTOR: 'Εγγυ.',
};

export default function DebtsView({ c }) {
  const termMap = Object.fromEntries((c.proposalTerms || []).map(t => [t.debtId, t]));
  const roles = c.debtPartyRoles || [];

  // Build map: debtId -> array of {personId, role}
  const rolesByDebt = {};
  for (const r of roles) {
    if (!rolesByDebt[r.debtId]) rolesByDebt[r.debtId] = [];
    rolesByDebt[r.debtId].push(r);
  }

  return (
    <div className="view-content">
      <div className="view-meta">
        {(c.debts?.length || 0) > 0
          ? `${c.debts.length} τραπεζικές οφειλές`
          : 'Καμία τραπεζική οφειλή'}
        {(c.publicDebts?.length || 0) > 0 && ` · ${c.publicDebts.length} δημόσιες οφειλές (ΑΑΔΕ/ΕΦΚΑ)`}
      </div>
      {(c.debts || []).map(d => {
        const t = termMap[d.debtId];
        const secured = t?.isCollateralSecured === true;
        const debtRoles = rolesByDebt[d.debtId] || [];
        const primary = debtRoles.filter(r => r.role === 'PRIMARY_DEBTOR');
        const others = debtRoles.filter(r => r.role !== 'PRIMARY_DEBTOR');

        return (
          <div key={d.debtId} className="debt-card">
            <div className="debt-card-header">
              <span className="mono identity">{d.debtIdentityRef}</span>
              <div className="debt-tags">
                <Tag label={secured ? 'Εξασφαλισμένη' : 'Ανεξασφάλιστη'} variant={secured ? 'green' : 'muted'} />
                {t && <Tag label={`${(t.spreadBasisPoints / 100).toFixed(2)}%`} variant="warn" />}
              </div>
            </div>

            {/* Party roles for this debt */}
            {debtRoles.length > 0 && (
              <div className="debt-parties">
                <span className="debt-parties-label">Ευθύνη:</span>
                {primary.map((r, i) => (
                  <span key={`p${i}`} className="party-chip party-primary">
                    <i className="ti ti-user" /> {ROLE_SHORT[r.role]}
                  </span>
                ))}
                {others.map((r, i) => (
                  <span key={`o${i}`} className="party-chip party-other">
                    <i className="ti ti-users" /> {ROLE_SHORT[r.role]} ({r.personId})
                    {r.signedContract === false && <span className="party-warn"> ✗ δεν υπέγραψε</span>}
                  </span>
                ))}
              </div>
            )}

            {t && <HaircutBar writeOff={t.writeOffAmountCents} total={t.totalDebtBeforeCents} />}

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
                <div className="data-row last">
                  <span className="row-label">Διάρκεια</span>
                  <span className="row-value mono">{t.paymentTermMonths} μήνες</span>
                </div>
              </>}
            </div>
            <div className="debt-contract">
              Σύμβαση: <span className="mono">{d.contractNumber}</span>
            </div>
          </div>
        );
      })}
      <PublicDebtsSection publicDebts={c.publicDebts} />
    </div>
  );
}

// ── Public debts (ΑΑΔΕ / ΕΦΚΑ) sub-component ────────────────────────────────
export function PublicDebtsSection({ publicDebts }) {
  if (!publicDebts || publicDebts.length === 0) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <div className="section-title">Οφειλές προς Δημόσιο ({publicDebts.length})</div>
      {publicDebts.map((pd, i) => {
        const label = pd.creditorType === 'EFKA_GR' ? 'ΕΦΚΑ' : 'ΑΑΔΕ / Δημόσιο';
        const woPct = pd.totalRegulatedCents
          ? Math.round((pd.writeOffCents / pd.totalRegulatedCents) * 100) : 0;
        return (
          <div key={i} className="debt-card">
            <div className="debt-card-header">
              <span className="identity">{label}</span>
              <span className="tag tag-info">Δημόσιο</span>
            </div>
            {pd.totalRegulatedCents > 0 && (
              <div className="haircut-wrap">
                <div className="haircut-labels">
                  <span>Διαγραφή {woPct}%</span>
                  <span>Ρύθμιση {100 - woPct}%</span>
                </div>
                <div className="haircut-bar">
                  <div className="haircut-red" style={{ width: `${woPct}%` }} />
                  <div className="haircut-green" style={{ width: `${100 - woPct}%` }} />
                </div>
              </div>
            )}
            <div className="debt-card-rows">
              {pd.principalRegulatableCents != null && (
                <div className="data-row"><span className="row-label">Βασική (διαγράψιμη)</span><span className="row-value mono">{fmtCents(pd.principalRegulatableCents)}</span></div>
              )}
              {pd.principalNonRegulatableCents ? (
                <div className="data-row"><span className="row-label">Βασική (μη διαγράψιμη — φόροι)</span><span className="row-value mono">{fmtCents(pd.principalNonRegulatableCents)}</span></div>
              ) : null}
              {pd.penaltyPrincipalCents ? (
                <div className="data-row"><span className="row-label">Πρόστιμα</span><span className="row-value mono">{fmtCents(pd.penaltyPrincipalCents)}</span></div>
              ) : null}
              {pd.surchargesCents ? (
                <div className="data-row"><span className="row-label">Προσαυξήσεις</span><span className="row-value mono">{fmtCents(pd.surchargesCents)}</span></div>
              ) : null}
              <div className="data-row"><span className="row-label">Σύνολο ρυθμιζόμενης</span><span className="row-value mono">{fmtCents(pd.totalRegulatedCents)}</span></div>
              <div className="data-row"><span className="row-label">Ποσό διαγραφής</span><span className="row-value mono red">{fmtCents(pd.writeOffCents)}</span></div>
              <div className="data-row"><span className="row-label">Ποσό προς ρύθμιση</span><span className="row-value mono green">{fmtCents(pd.amountToRegulateCents)}</span></div>
              {pd.payableInterestCents != null && (
                <div className="data-row"><span className="row-label">Πληρωτέος τόκος</span><span className="row-value mono">{fmtCents(pd.payableInterestCents)}</span></div>
              )}
              {pd.paymentTermMonths != null && (
                <div className="data-row"><span className="row-label">Διάρκεια</span><span className="row-value mono">{pd.paymentTermMonths} μήνες</span></div>
              )}
              {pd.monthlyInstallmentCents != null && (
                <div className="data-row"><span className="row-label">Μηνιαία δόση (έτος 1)</span><span className="row-value mono">{fmtCents(pd.monthlyInstallmentCents)}</span></div>
              )}
              <div className="data-row last"><span className="row-label">Συνολικό ποσό πληρωμής</span><span className="row-value mono">{fmtCents(pd.totalPaymentCents)}</span></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fmtCents(c) {
  if (c === null || c === undefined) return '—';
  return '€\u00A0' + (c / 100).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
