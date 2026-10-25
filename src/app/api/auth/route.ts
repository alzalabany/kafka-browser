import { randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { firebaseAuth } from '@/lib/firebase-admin';
import { hosted, requireHostedConfig, allowedIdentity } from '@/lib/hosted-config';
import { identity, checkOrigin, errorResponse, HttpError, requestCookie, SESSION_COOKIE, CSRF_COOKIE, SESSION_SECONDS } from '@/lib/auth';
import { stopUserStreams } from '@/lib/stream-limits';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const options = () => ({httpOnly:true,secure:process.env.APP_ORIGIN?.startsWith('https:') || false,sameSite:'strict' as const,path:'/'});
function csrf(request:Request) {
  checkOrigin(request);
  const cookie = requestCookie(request,CSRF_COOKIE) || '';
  const header = request.headers.get('x-csrf-token') || '';
  if (!/^[a-f0-9]{64}$/.test(cookie) || !/^[a-f0-9]{64}$/.test(header) || !timingSafeEqual(Buffer.from(cookie),Buffer.from(header))) throw new HttpError(403,'Refresh the page and try again');
}
export async function GET(request:Request) {
  if (!hosted()) return NextResponse.json({mode:'local',user:null});
  try {
    requireHostedConfig();
    let user = null;
    try { const current=await identity(request); user={uid:current.uid,email:current.email}; }
    catch (error) { if (!(error instanceof HttpError && [401,403].includes(error.status))) throw error; }
    const csrfToken = randomBytes(32).toString('hex');
    const response = NextResponse.json({mode:'hosted',user,csrfToken,
      config:{apiKey:process.env.FIREBASE_WEB_API_KEY,authDomain:process.env.FIREBASE_AUTH_DOMAIN,projectId:process.env.FIREBASE_PROJECT_ID,appId:process.env.FIREBASE_WEB_APP_ID},
      company:process.env.ALLOWED_EMAIL_DOMAINS,
    },{headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
    response.cookies.set(CSRF_COOKIE,csrfToken,{...options(),maxAge:SESSION_SECONDS});
    return response;
  } catch (error) { return errorResponse(error); }
}
export async function POST(request:Request) {
  try {
    if (!hosted()) throw new HttpError(400,'Google sign-in is not enabled in local mode');
    requireHostedConfig(); csrf(request);
    const {idToken}=await request.json();
    if (typeof idToken !== 'string' || idToken.length > 20_000) throw new HttpError(400,'Invalid sign-in token');
    let claims;
    try { claims=await firebaseAuth().verifyIdToken(idToken,true); }
    catch { throw new HttpError(401,'Google sign-in could not be verified'); }
    if (!allowedIdentity(claims)) throw new HttpError(403,'Sign in with your verified company Google account');
    if (Date.now()/1000 - claims.auth_time > 300) throw new HttpError(401,'Please sign in with Google again');
    const cookie = await firebaseAuth().createSessionCookie(idToken,{expiresIn:SESSION_SECONDS*1000});
    const response=NextResponse.json({ok:true});
    response.cookies.set(SESSION_COOKIE,cookie,{...options(),maxAge:SESSION_SECONDS});
    return response;
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request:Request) {
  try {
    csrf(request);
    try { const user=await identity(request); stopUserStreams(user.uid); } catch {}
    const response=NextResponse.json({ok:true});
    response.cookies.set(SESSION_COOKIE,'',{...options(),maxAge:0});
    return response;
  } catch (error) { return errorResponse(error); }
}
