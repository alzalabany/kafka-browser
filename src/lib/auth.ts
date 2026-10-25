import { firebaseAuth } from './firebase-admin';
import { hosted, requireHostedConfig, allowedIdentity } from './hosted-config';

export const SESSION_COOKIE = 'kb_session';
export const CSRF_COOKIE = 'kb_csrf';
export const SESSION_SECONDS = 60 * 60 * 24 * 5;
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type Identity = { uid:string; email?:string; expiresAt:number };
export function requestCookie(request:Request,name:string) {
  return request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${name}=`))?.slice(name.length+1);
}

export function checkOrigin(request: Request) {
  const expected = hosted() ? process.env.APP_ORIGIN : new URL(request.url).origin;
  if (!expected || request.headers.get('origin') !== expected) throw new HttpError(403,'Request origin is not allowed');
}
export async function identity(request: Request): Promise<Identity> {
  if (!hosted()) return { uid:'local', expiresAt:Infinity };
  requireHostedConfig();
  const cookie = requestCookie(request,SESSION_COOKIE);
  if (!cookie) throw new HttpError(401,'Sign in to continue');
  let decoded;
  try { decoded = await firebaseAuth().verifySessionCookie(cookie, true); }
  catch { throw new HttpError(401,'Your session expired. Sign in again.'); }
  if (!allowedIdentity(decoded)) throw new HttpError(403,'This Google account is not allowed to use this workspace');
  return { uid:decoded.uid, email:decoded.email, expiresAt:decoded.exp * 1000 };
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return Response.json({error:error.message}, {status:error.status});
  // Do not send Firestore, service account, or credential encryption errors to clients.
  console.error('Kafka Browser request failed:', error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error');
  return Response.json({error:'Server configuration or storage is unavailable. Contact the workspace administrator.'},{status:503});
}
export function withUser(handler:(request:Request,user:Identity)=>Promise<Response>) {
  return async (request:Request) => {
    try {
      const user = await identity(request);
      if (hosted() && !['GET','HEAD'].includes(request.method)) checkOrigin(request);
      const result = await handler(request,user);
      result.headers.set('Cache-Control','no-store, no-transform');
      result.headers.set('Vary','Cookie');
      return result;
    } catch (error) { return errorResponse(error); }
  };
}
