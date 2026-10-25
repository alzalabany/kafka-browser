import { userStore } from '@/lib/user-store';
import { withUser } from '@/lib/auth';
import { readConnection } from '@/lib/connection-form';
import { validateBroker } from '@/lib/broker-policy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withUser(async (_request,user) => {
  const store = await userStore(user.uid,user.email);
  return Response.json((await store.connections()).map(({password,ca,cert,key,...c}) => ({...c,hasCredentials:Boolean(password || key),hasCa:Boolean(ca),hasCert:Boolean(cert)})));
});
export const POST = withUser(async (request,user) => {
  const store = await userStore(user.uid,user.email);
  let c;
  try { c = await readConnection(await request.formData()); validateBroker(c.host,c.port); }
  catch (error) { return Response.json({error:(error as Error).message},{status:400}); }
  await store.saveConnection(c); return Response.json({id:c.id});
});
export const PUT = withUser(async (request,user) => {
  const store = await userStore(user.uid,user.email);
  const form = await request.formData();
  const existing = await store.connection(String(form.get('id') || ''));
  if (!existing) return Response.json({error:'Connection not found'},{status:404});
  let c;
  try { c = await readConnection(form,existing); validateBroker(c.host,c.port); }
  catch (error) { return Response.json({error:(error as Error).message},{status:400}); }
  await store.saveConnection(c); return Response.json({id:c.id});
});
export const DELETE = withUser(async (request,user) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({error:'Missing connection'},{status:400});
  await (await userStore(user.uid,user.email)).deleteConnection(id); return Response.json({ok:true});
});
