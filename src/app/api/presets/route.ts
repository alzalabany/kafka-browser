import { db } from '@/lib/db';
import { presetStore } from '@/lib/presets';
export const runtime = 'nodejs';
const store = presetStore(db);
export async function GET() { return Response.json(store.list()); }
export async function POST(request: Request) {
  try { return Response.json(store.save(await request.json())); }
  catch (error) { return Response.json({error:(error as Error).message},{status:400}); }
}
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({error:'Preset id is required'},{status:400});
  if (!store.remove(id)) return Response.json({error:'Preset not found'},{status:404});
  return Response.json({ok:true});
}
