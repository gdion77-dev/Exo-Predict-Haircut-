export function fmt(cents) {
  if (cents === null || cents === undefined) return '—';
  return '€\u00A0' + (cents / 100).toLocaleString('el-GR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export const STATUS_LABEL = {
  PROPOSAL_RECEIVED:    'Πρόταση ληφθείσα',
  PROPOSAL_ISSUED:      'Πρόταση εκδοθείσα',
  SIGNED:               'Υπογεγραμμένη',
  NOT_REVIEWED:         'Μη ελεγχθείσα',
  ELIGIBLE_VERIFIED:    'Εγκεκριμένη',
  EXCLUDED_INCOMPLETE:  'Αποκλεισμένη',
  EXCLUDED_UNVERIFIED:  'Μη επαληθευμένη',
  PENDING:              'Εκκρεμεί',
  UNKNOWN:              'Άγνωστη',
};

export function statusClass(status) {
  if (['ELIGIBLE_VERIFIED', 'SIGNED'].includes(status)) return 'green';
  if (['NOT_REVIEWED', 'PROPOSAL_ISSUED', 'PROPOSAL_RECEIVED', 'PENDING'].includes(status)) return 'warn';
  if (['EXCLUDED_INCOMPLETE', 'EXCLUDED_UNVERIFIED'].includes(status)) return 'red';
  return 'muted';
}

export function exportJson(cases) {
  const data = JSON.stringify(cases, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `exopredict-dataset-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
