import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('Google login: company session, cookie flags, identity restoration, logout, and disabled-account rejection', {skip:!process.env.FIREBASE_AUTH_EMULATOR_HOST},async t => {
  Object.assign(process.env,{KAFKA_BROWSER_MODE:'hosted',FIREBASE_PROJECT_ID:'demo-kafka-browser',FIREBASE_WEB_API_KEY:'test-key',FIREBASE_AUTH_DOMAIN:'demo-kafka-browser.firebaseapp.com',FIREBASE_WEB_APP_ID:'test-app',KAFKA_CREDENTIALS_KEY:Buffer.alloc(32,1).toString('base64'),APP_ORIGIN:'https://kafka.example.com',KAFKA_ALLOWED_HOSTS:'broker.example.com',ALLOWED_EMAIL_DOMAINS:'amanacapital.com'});
  const {GET,POST,DELETE}=await import('../app/api/auth/route');
  const {identity,HttpError}=await import('./auth');
  const {firebaseAuth}=await import('./firebase-admin');
  const ids:string[]=[];
  t.after(async()=>{for(const uid of ids)await firebaseAuth().deleteUser(uid);});
  const config=await GET(new Request('https://kafka.example.com/api/auth'));
  assert.equal(config.status,200);
  const csrf=(await config.json()).csrfToken;
  const cookie=`kb_csrf=${csrf}`;
  async function google(email:string,verified=true) {
    const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=test-key`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestUri:'http://localhost',returnSecureToken:true,postBody:new URLSearchParams({providerId:'google.com',id_token:JSON.stringify({sub:randomUUID(),email,email_verified:verified})}).toString()}),
    });
    assert.equal(response.status,200);const result=await response.json();ids.push(result.localId);return {idToken:result.idToken as string,refreshToken:result.refreshToken as string};
  }
  const login=(tokens:{idToken:string;refreshToken:string})=>POST(new Request('https://kafka.example.com/api/auth',{method:'POST',headers:{Origin:'https://kafka.example.com',Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify(tokens)}));
  assert.equal((await login(await google('outsider@gmail.com'))).status,403);
  assert.equal((await login({idToken:'not-a-real-token',refreshToken:'invalid'})).status,401);
  assert.equal((await login(await google('unverified@amanacapital.com',false))).status,401);
  const email=`test-${randomUUID()}@amanacapital.com`;
  const tokens=await google(email);
  const response=await login(tokens);
  assert.equal(response.status,200);
  const header=response.headers.get('set-cookie')!;
  assert.match(header,/HttpOnly/i);assert.match(header,/Secure/i);assert.match(header,/SameSite=Strict/i);
  const session=header.split(';')[0];
  const request=()=>new Request('https://kafka.example.com/api/auth',{headers:{Cookie:`${cookie}; ${session}`}});
  const user=await identity(request());assert.equal(user.email,email);
  assert.ok(user.idToken);assert.ok(!header.includes(email));
  assert.ok(header.length<4096,'encrypted session fits the browser cookie limit');
  const restored=await GET(request());assert.equal((await restored.json()).user.email,email);
  const {decodeSession,encodeSession}=await import('./user-session');
  const saved=decodeSession(session.slice('kb_session='.length));
  const parts=saved.idToken.split('.');
  parts[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(parts[1],'base64url').toString()),exp:Math.floor(Date.now()/1000)-10})).toString('base64url');
  const expired=encodeSession({...saved,idToken:parts.join('.')});
  const refreshed=await identity(new Request('https://kafka.example.com/api/auth',{headers:{Cookie:`${cookie}; kb_session=${expired}`}}));
  assert.equal(refreshed.uid,user.uid);assert.ok(refreshed.sessionCookie,'expired ID tokens refresh using the encrypted refresh credential');
  assert.equal(decodeSession(refreshed.sessionCookie!).expiresAt,saved.expiresAt,'refresh never extends the five-day session');
  const second=await google(`other-${randomUUID()}@amanacapital.com`);
  assert.equal((await login({...tokens,refreshToken:second.refreshToken})).status,401,'a different user refresh token cannot be attached');
  const logout=await DELETE(new Request('https://kafka.example.com/api/auth',{method:'DELETE',headers:{Origin:'https://kafka.example.com',Cookie:`${cookie}; ${session}`,'X-CSRF-Token':csrf}}));
  assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie')!,/Max-Age=0/);
  await firebaseAuth().updateUser(user.uid,{disabled:true});
  await assert.rejects(()=>identity(request()),(error:unknown)=>error instanceof HttpError&&error.status===401);
});
