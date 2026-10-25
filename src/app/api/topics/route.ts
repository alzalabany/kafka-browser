import { userStore } from '@/lib/user-store';
import { withUser } from '@/lib/auth';
import { topics } from '@/lib/kafka';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withUser(async (request,user) => {
  const c = await (await userStore(user.uid,user.email)).connection(new URL(request.url).searchParams.get('connection') || '');
  if (!c) return Response.json({ error: 'Connection not found' }, { status: 404 });
  try { return Response.json(await topics(c)); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 502 }); }
});
