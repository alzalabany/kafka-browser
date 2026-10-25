import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encodeSession, decodeSession } from './user-session';

test('user sessions encrypt refresh credentials, reject tampering/expiry, and bind the Firebase project',()=>{
  process.env.KAFKA_CREDENTIALS_KEY=randomBytes(32).toString('base64');
  process.env.FIREBASE_PROJECT_ID='session-test';
  const value={idToken:'private-id-token',refreshToken:'private-refresh-token',expiresAt:Date.now()+60_000};
  const cookie=encodeSession(value);
  assert.deepEqual(decodeSession(cookie),value);
  assert.ok(!cookie.includes(value.refreshToken));assert.notEqual(encodeSession(value),cookie);
  assert.throws(()=>decodeSession(cookie.slice(0,-5)+'xxxxx'));
  assert.throws(()=>decodeSession(encodeSession({...value,expiresAt:Date.now()-1})));
  assert.throws(()=>encodeSession({...value,idToken:'x'.repeat(6000)}));
  process.env.FIREBASE_PROJECT_ID='another-project';assert.throws(()=>decodeSession(cookie));
});
