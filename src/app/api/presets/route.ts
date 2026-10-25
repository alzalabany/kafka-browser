import { userStore } from '@/lib/user-store';
import { withUser } from '@/lib/auth';
import { readPreset } from '@/lib/presets';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withUser(async (_request,user) => Response.json(await (await userStore(user.uid,user.email)).presets()));
export const POST = withUser(async (request,user) => {
  let value;
  try { value=readPreset(await request.json()); }
  catch (error) { return Response.json({error:(error as Error).message},{status:400}); }
  return Response.json(await (await userStore(user.uid,user.email)).savePreset(value));
});
export const DELETE = withUser(async (request,user) => {
  const id = new URL(request.url).searchParams.get('id');
  const scope = new URL(request.url).searchParams.get('scope');
  if (!id) return Response.json({error:'Preset id is required'},{status:400});
  if (!await (await userStore(user.uid,user.email)).deletePreset(id,scope === 'company')) return Response.json({error:'Preset not found'},{status:404});
  return Response.json({ok:true});
});
