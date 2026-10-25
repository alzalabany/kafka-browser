import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function firebaseAdmin() {
  const existing = getApps().find(app => app.name === 'kafka-browser');
  if (existing) return existing;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return initializeApp({ projectId:process.env.FIREBASE_PROJECT_ID,
    credential:serviceAccount ? cert(JSON.parse(serviceAccount)) : applicationDefault(),
  }, 'kafka-browser');
}
export const firebaseAuth = () => getAuth(firebaseAdmin());
export const firestore = () => getFirestore(firebaseAdmin());
