import { AsyncLocalStorage } from 'node:async_hooks';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export function verifyPublicIdToken(token:string) {
  const name='kafka-browser-public-verifier';
  const app=getApps().find(app=>app.name===name) || initializeApp({projectId:process.env.FIREBASE_PROJECT_ID,credential:{getAccessToken:async()=>{throw new Error('Privileged Google API credentials are disabled for user-token authentication');}}},name);
  return getAuth(app).verifyIdToken(token,false);
}

const context = new AsyncLocalStorage<string>();
export const withFirebaseToken = <T>(token:string, action:()=>T) => context.run(token,action);
export function firebaseToken() {
  const token=context.getStore();
  if (!token) throw new Error('A signed-in Firebase user is required for storage');
  return token;
}
function authBase(service:'identitytoolkit'|'securetoken') {
  const emulator=process.env.NODE_ENV !== 'production' && process.env.FIREBASE_AUTH_EMULATOR_HOST;
  return emulator ? `http://${emulator}/${service}.googleapis.com/v1` : `https://${service}.googleapis.com/v1`;
}
async function authRequest(service:'identitytoolkit'|'securetoken',path:string,body:unknown) {
  const response=await fetch(`${authBase(service)}/${path}?key=${encodeURIComponent(process.env.FIREBASE_WEB_API_KEY!)}`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Firebase user authentication failed');
  return response.json();
}
export async function verifyUserToken(token:string) {
  // JWT signatures use Google's public certificates; no Admin API or service-account credential is used.
  const claims=await verifyPublicIdToken(token);
  const result=await authRequest('identitytoolkit','accounts:lookup',{idToken:token});
  const user=result.users?.[0];
  if (!user || user.localId !== claims.uid || user.disabled || user.email?.toLowerCase() !== claims.email?.toLowerCase() || !user.emailVerified || Number(user.validSince || 0) > claims.auth_time) throw new Error('Firebase user is disabled, changed, or revoked');
  return claims;
}
export async function refreshUserToken(refreshToken:string) {
  const result=await authRequest('securetoken','token',{grant_type:'refresh_token',refresh_token:refreshToken});
  if (typeof result.id_token !== 'string' || typeof result.refresh_token !== 'string') throw new Error('Firebase session refresh failed');
  return {idToken:result.id_token as string,refreshToken:result.refresh_token as string};
}
