import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, doc,
  setDoc, getDocs, deleteDoc, updateDoc
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBATdE80ZPM4QNjmfxBaqgB2GQsbjLcX_Y",
  authDomain: "exopredict-pro.firebaseapp.com",
  projectId: "exopredict-pro",
  storageBucket: "exopredict-pro.firebasestorage.app",
  messagingSenderId: "806363227977",
  appId: "1:806363227977:web:b3a7ae1835cbdc6f94dc98"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Cases (training data — with PDF) ─────────────────────────────────────────
export async function saveCase(data) {
  await setDoc(doc(db, 'cases', data.caseId), data);
}

export async function loadAllCases() {
  const snap = await getDocs(collection(db, 'cases'));
  const out = {};
  snap.forEach(d => { out[d.id] = d.data(); });
  return out;
}

export async function deleteCase(caseId) {
  await deleteDoc(doc(db, 'cases', caseId));
}

export async function updateCaseField(caseId, fields) {
  await updateDoc(doc(db, 'cases', caseId), fields);
}

// ── Predictions (XLS only — no PDF) ──────────────────────────────────────────
export async function savePrediction(data) {
  await setDoc(doc(db, 'predictions', data.caseId), data);
}

export async function loadAllPredictions() {
  const snap = await getDocs(collection(db, 'predictions'));
  const out = {};
  snap.forEach(d => { out[d.id] = d.data(); });
  return out;
}

export async function deletePrediction(caseId) {
  await deleteDoc(doc(db, 'predictions', caseId));
}

export async function updatePredictionField(caseId, fields) {
  await updateDoc(doc(db, 'predictions', caseId), fields);
}
