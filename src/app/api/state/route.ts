import { userStore } from '@/lib/user-store';
import { withUser } from '@/lib/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withUser(async (request,user) => Response.json(await (await userStore(user.uid,user.email)).getState(new URL(request.url).searchParams.get('key') || 'app',new URL(request.url).searchParams.get('scope') === 'company')));
export const PUT = withUser(async (request,user) => {
  const {key,value,scope} = await request.json();
  if (typeof key !== 'string' || key.length > 300 || !value || typeof value !== 'object') return Response.json({error:'Invalid state'},{status:400});
  await (await userStore(user.uid,user.email)).setState(key,value,scope === 'company'); return Response.json({ok:true});
});
