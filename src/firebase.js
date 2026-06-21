import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';

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
const CASES_COLLECTION = 'cases';

export async function saveCase(caseData) {
  const ref = doc(db, CASES_COLLECTION, caseData.caseId);
  await setDoc(ref, caseData);
}

export async function loadAllCases() {
  const snapshot = await getDocs(collection(db, CASES_COLLECTION));
  const cases = {};
  snapshot.forEach(d => { cases[d.id] = d.data(); });
  return cases;
}

export async function deleteCase(caseId) {
  await deleteDoc(doc(db, CASES_COLLECTION, caseId));
}
