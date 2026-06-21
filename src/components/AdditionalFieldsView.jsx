import { useState } from 'react';
import {
  DEBTOR_TYPES, DEBTOR_TYPE_LABEL, EVIDENCE_STATUS,
  emptyAdditionalFields, computeLiquidationValue,
} from '../additionalFields.js';
import { fmt } from '../utils.js';
import { Card } from './UI.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────
function eurosToCents(str) {
  if (str === '' || str === null || str === undefined) return null;
  const n = parseFloat(String(str).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : Math.round(n * 100);
}
function centsToEuros(cents) {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Evidence selector ─────────────────────────────────────────────────────────
function EvidencePicker({ value, onChange }) {
  return (
    <div className="evidence-picker">
      {Object.entries(EVIDENCE_STATUS).map(([key, cfg]) => (
        <button
          key={key}
          className={`evidence-btn evidence-${cfg.color}${value === key ? ' active' : ''}`}
          onClick={() => onChange(key)}
          title={cfg.label}
          type="button"
        >
          <i className={`ti ${cfg.icon}`} />
        </button>
      ))}
    </div>
  );
}

// ── Money field with evidence ─────────────────────────────────────────────────
function MoneyField({ label, valueCents, evidence, onValueChange, onEvidenceChange }) {
  const [raw, setRaw] = useState(centsToEuros(valueCents));
  return (
    <div className="field-row">
      <label className="field-label">{label}</label>
      <div className="field-input-group">
        <div className="money-input-wrap">
          <span className="money-prefix">€</span>
          <input
            className="field-input money"
            value={raw}
            onChange={e => setRaw(e.target.value)}
            onBlur={() => onValueChange(eurosToCents(raw))}
            placeholder="0,00"
            inputMode="decimal"
          />
        </div>
        <EvidencePicker value={evidence} onChange={onEvidenceChange} />
      </div>
    </div>
  );
}

// ── Number / toggle helpers ───────────────────────────────────────────────────
function NumberField({ label, value, onChange, placeholder }) {
  const [raw, setRaw] = useState(value ?? '');
  return (
    <div className="field-row">
      <label className="field-label">{label}</label>
      <input
        className="field-input"
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={() => onChange(raw === '' ? null : parseInt(raw, 10))}
        placeholder={placeholder || '—'}
        inputMode="numeric"
      />
    </div>
  );
}

function TriToggle({ label, value, onChange }) {
  return (
    <div className="field-row">
      <label className="field-label">{label}</label>
      <div className="tri-toggle">
        <button type="button" className={value === true ? 'active yes' : ''} onClick={() => onChange(true)}>Ναι</button>
        <button type="button" className={value === false ? 'active no' : ''} onClick={() => onChange(false)}>Όχι</button>
        <button type="button" className={value === null ? 'active unk' : ''} onClick={() => onChange(null)}>—</button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdditionalFieldsView({ c, onSave }) {
  const [af, setAf] = useState(() => ({ ...emptyAdditionalFields(), ...(c.additionalFields || {}) }));
  const [dirty, setDirty] = useState(false);

  function update(path, value) {
    setAf(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      let obj = next;
      const parts = path.split('.');
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = value;
      return next;
    });
    setDirty(true);
  }

  function save() {
    onSave({ ...af, lastEditedAt: new Date().toISOString() });
    setDirty(false);
  }

  const isProfessional = af.debtorType === DEBTOR_TYPES.PROFESSIONAL;
  const properties = c.properties || [];

  return (
    <div className="view-content additional-fields">
      <div className="af-intro">
        <i className="ti ti-info-circle" />
        Όλα τα πεδία είναι <strong>προαιρετικά</strong>. Συμπλήρωσε όσα έχεις διαθέσιμα.
        Βελτιώνουν την ακρίβεια της εκτίμησης αλλά δεν είναι απαραίτητα για αποθήκευση.
      </div>

      {/* Debtor type */}
      <Card style={{ marginBottom: 14 }}>
        <div className="card-title">Τύπος οφειλέτη</div>
        <div className="debtor-type-toggle">
          {Object.values(DEBTOR_TYPES).map(t => (
            <button
              key={t}
              type="button"
              className={`debtor-type-btn${af.debtorType === t ? ' active' : ''}`}
              onClick={() => update('debtorType', t)}
            >
              <i className={`ti ${t === DEBTOR_TYPES.NATURAL ? 'ti-user' : 'ti-building-store'}`} />
              {DEBTOR_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </Card>

      {/* Α. Household */}
      <Card style={{ marginBottom: 14 }}>
        <div className="card-title">Α. Νοικοκυριό</div>
        <NumberField label="Αριθμός ανηλίκων τέκνων"
          value={af.household.minorChildrenCount}
          onChange={v => update('household.minorChildrenCount', v)} />
        <NumberField label="Εξαρτώμενα μέλη χωρίς εισόδημα"
          value={af.household.dependentMembersNoIncomeCount}
          onChange={v => update('household.dependentMembersNoIncomeCount', v)} />
        <NumberField label="Ηλικία αιτούντος"
          value={af.household.applicantAge}
          onChange={v => update('household.applicantAge', v)} />
        <TriToggle label="Ιδιόκτητη κύρια κατοικία;"
          value={af.household.primaryResidenceIsOwned}
          onChange={v => update('household.primaryResidenceIsOwned', v)} />
      </Card>

      {/* Β. Expenses */}
      <Card style={{ marginBottom: 14 }}>
        <div className="card-title">Β. Μηνιαία / ετήσια έξοδα</div>
        {af.household.primaryResidenceIsOwned === false && (
          <MoneyField label="Μηνιαίο ενοίκιο κύριας κατοικίας"
            valueCents={af.expenses.monthlyRentCents}
            evidence={af.expenses.monthlyRentCents_evidence}
            onValueChange={v => update('expenses.monthlyRentCents', v)}
            onEvidenceChange={v => update('expenses.monthlyRentCents_evidence', v)} />
        )}
        <MoneyField label="Μόνιμες ιατρικές δαπάνες (μηνιαίες)"
          valueCents={af.expenses.permanentMedicalCostsCents}
          evidence={af.expenses.permanentMedicalCostsCents_evidence}
          onValueChange={v => update('expenses.permanentMedicalCostsCents', v)}
          onEvidenceChange={v => update('expenses.permanentMedicalCostsCents_evidence', v)} />
        <MoneyField label="Διατροφή από διαζύγιο (μηνιαία)"
          valueCents={af.expenses.courtOrderedAlimonyCents}
          evidence={af.expenses.courtOrderedAlimonyCents_evidence}
          onValueChange={v => update('expenses.courtOrderedAlimonyCents', v)}
          onEvidenceChange={v => update('expenses.courtOrderedAlimonyCents_evidence', v)} />
        <MoneyField label="ΕΝΦΙΑ (ετήσιο)"
          valueCents={af.expenses.annualEnfiaCents}
          evidence={af.expenses.annualEnfiaCents_evidence}
          onValueChange={v => update('expenses.annualEnfiaCents', v)}
          onEvidenceChange={v => update('expenses.annualEnfiaCents_evidence', v)} />
      </Card>

      {/* Δ. Business — only if professional */}
      {isProfessional && (
        <Card style={{ marginBottom: 14 }}>
          <div className="card-title">Δ. Επιχειρηματικά στοιχεία</div>
          <MoneyField label="Ετήσιος κύκλος εργασιών (τζίρος)"
            valueCents={af.business.annualTurnoverCents}
            evidence={af.business.annualTurnoverCents_evidence}
            onValueChange={v => update('business.annualTurnoverCents', v)}
            onEvidenceChange={v => update('business.annualTurnoverCents_evidence', v)} />
          <MoneyField label="Ετήσιο κέρδος"
            valueCents={af.business.annualProfitCents}
            evidence={af.business.annualProfitCents_evidence}
            onValueChange={v => update('business.annualProfitCents', v)}
            onEvidenceChange={v => update('business.annualProfitCents_evidence', v)} />
          <MoneyField label="Ετήσια λειτουργικά κόστη"
            valueCents={af.business.annualOperatingCostsCents}
            evidence={af.business.annualOperatingCostsCents_evidence}
            onValueChange={v => update('business.annualOperatingCostsCents', v)}
            onEvidenceChange={v => update('business.annualOperatingCostsCents_evidence', v)} />
        </Card>
      )}

      {/* Property values */}
      {properties.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <div className="card-title">Γ. Αξίες ακινήτων</div>
          <div className="af-hint">
            Η αξία βιβλίων servicer έρχεται αυτόματα από το assetXls.
            Συμπλήρωσε τις υπόλοιπες αν τις έχεις.
          </div>
          {properties.map(p => {
            const pv = af.propertyValues[p.propertyId] || {};
            const bookValue = (c.propertyValueEvidences || [])
              .find(e => e.propertyId === p.propertyId && e.valueType === 'CREDITOR_COLLATERAL_VALUE')?.amountCents;
            const liq = computeLiquidationValue({
              objectiveOrEnfiaValueCents: pv.objectiveOrEnfiaValueCents,
              creditorBookValueCents: bookValue,
            });
            return (
              <div key={p.propertyId} className="property-value-block">
                <div className="property-value-header">
                  <span className="mono">{p.propertyId}</span>
                  <span className="property-area">{p.areaLabel}</span>
                </div>
                <div className="data-row">
                  <span className="row-label">Αξία βιβλίων servicer (auto)</span>
                  <span className="row-value mono green">{bookValue != null ? fmt(bookValue) : '—'}</span>
                </div>
                <MoneyField label="Αντικειμενική / ΕΝΦΙΑ αξία"
                  valueCents={pv.objectiveOrEnfiaValueCents}
                  evidence={pv.objectiveOrEnfiaValueCents_evidence || 'unknown'}
                  onValueChange={v => update(`propertyValues.${p.propertyId}.objectiveOrEnfiaValueCents`, v)}
                  onEvidenceChange={v => update(`propertyValues.${p.propertyId}.objectiveOrEnfiaValueCents_evidence`, v)} />
                <MoneyField label="Ανεξάρτητη εκτίμηση"
                  valueCents={pv.independentEstimateCents}
                  evidence={pv.independentEstimateCents_evidence || 'unknown'}
                  onValueChange={v => update(`propertyValues.${p.propertyId}.independentEstimateCents`, v)}
                  onEvidenceChange={v => update(`propertyValues.${p.propertyId}.independentEstimateCents_evidence`, v)} />
                <MoneyField label="Τιμή πλειστηριασμού"
                  valueCents={pv.auctionValueCents}
                  evidence={pv.auctionValueCents_evidence || 'unknown'}
                  onValueChange={v => update(`propertyValues.${p.propertyId}.auctionValueCents`, v)}
                  onEvidenceChange={v => update(`propertyValues.${p.propertyId}.auctionValueCents_evidence`, v)} />
                <div className="data-row liquidation-row">
                  <span className="row-label"><strong>Αξία ρευστοποίησης</strong> = max(ΕΝΦΙΑ, βιβλία−3%)</span>
                  <span className="row-value mono warn">{liq != null ? fmt(liq) : '—'}</span>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Ε. Procedural */}
      <Card style={{ marginBottom: 14 }}>
        <div className="card-title">Ε. Διαδικαστικοί παράγοντες</div>
        <div className="af-hint">Επηρεάζουν την έγκριση της πρότασης, όχι το μέγεθος του κουρέματος.</div>
        <TriToggle label="Προγραμματισμένος πλειστηριασμός;"
          value={af.procedural.auctionScheduled}
          onChange={v => update('procedural.auctionScheduled', v)} />
        {af.procedural.auctionScheduled === true && (
          <div className="field-row">
            <label className="field-label">Ημερομηνία πλειστηριασμού</label>
            <input type="date" className="field-input"
              value={af.procedural.auctionDate || ''}
              onChange={e => update('procedural.auctionDate', e.target.value || null)} />
          </div>
        )}
        <TriToggle label="Υπάρχει προηγούμενη ρύθμιση;"
          value={af.procedural.priorSettlementExists}
          onChange={v => update('procedural.priorSettlementExists', v)} />
        {af.procedural.priorSettlementExists === true && (
          <TriToggle label="Χάθηκε η προηγούμενη ρύθμιση;"
            value={af.procedural.priorSettlementDefaulted}
            onChange={v => update('procedural.priorSettlementDefaulted', v)} />
        )}
        <TriToggle label="Ενεργές πιστώσεις;"
          value={af.procedural.activeCreditExists}
          onChange={v => update('procedural.activeCreditExists', v)} />
        <TriToggle label="Συμμετέχουν όλοι οι εμπλεκόμενοι;"
          value={af.procedural.allRelevantPartiesParticipate}
          onChange={v => update('procedural.allRelevantPartiesParticipate', v)} />
        <div className="field-row">
          <label className="field-label">Λόγος απόρριψης πιστωτή (αν υπάρχει)</label>
          <input className="field-input"
            value={af.procedural.creditorRejectionReason || ''}
            onChange={e => update('procedural.creditorRejectionReason', e.target.value || null)}
            placeholder="—" />
        </div>
      </Card>

      {/* Save bar */}
      <div className={`af-save-bar${dirty ? ' visible' : ''}`}>
        <span className="af-save-hint">{dirty ? 'Υπάρχουν μη αποθηκευμένες αλλαγές' : 'Αποθηκευμένο'}</span>
        <button className="btn btn-primary" onClick={save} disabled={!dirty}>
          <i className="ti ti-device-floppy" /> Αποθήκευση στοιχείων
        </button>
      </div>
    </div>
  );
}
