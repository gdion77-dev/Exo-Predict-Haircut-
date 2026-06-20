/**
 * Local Storage Case Repository
 * Persists cases in browser localStorage.
 * Key: 'exopredict_cases'
 */

const STORAGE_KEY = 'exopredict_cases';

export function loadCasesFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveCasesToStorage(cases) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
    return true;
  } catch {
    return false;
  }
}

export function exportCasesJson(cases) {
  const data = JSON.stringify(Object.values(cases), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `exopredict-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importCasesJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        const cases = {};
        const arr = Array.isArray(data) ? data : [data];
        for (const c of arr) {
          if (c.caseId) cases[c.caseId] = c;
        }
        resolve(cases);
      } catch {
        reject(new Error('Μη έγκυρο JSON αρχείο'));
      }
    };
    reader.onerror = () => reject(new Error('Σφάλμα ανάγνωσης αρχείου'));
    reader.readAsText(file);
  });
}
