import { encryptCredentials, decryptCredentials } from './credential-crypto';

export type UserSession = {idToken:string;refreshToken:string;expiresAt:number};
const owner='firebase-user-session';
const scope=()=>process.env.FIREBASE_PROJECT_ID || '';
export function encodeSession(value:UserSession) {
  const encrypted=encryptCredentials(value,owner,scope());
  const cookie=['1',encrypted.iv,encrypted.tag,encrypted.ciphertext].map((part,index)=>index===0?part:Buffer.from(part,'base64').toString('base64url')).join('.');
  if (cookie.length > 3800) throw new Error('Firebase session exceeds cookie size limit');
  return cookie;
}
export function decodeSession(cookie:string):UserSession {
  if (cookie.length>3800) throw new Error('Invalid session');
  const [version,iv,tag,ciphertext,...extra]=cookie.split('.');
  if (version !== '1' || !iv || !tag || !ciphertext || extra.length) throw new Error('Invalid session');
  const value=decryptCredentials<UserSession>({version:1,iv:Buffer.from(iv,'base64url').toString('base64'),tag:Buffer.from(tag,'base64url').toString('base64'),ciphertext:Buffer.from(ciphertext,'base64url').toString('base64')},owner,scope());
  if (typeof value.idToken!=='string'||typeof value.refreshToken!=='string'||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now()) throw new Error('Session expired');
  return value;
}
