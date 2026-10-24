import { connection } from '@/lib/db';
import { topics } from '@/lib/kafka';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const c = connection(new URL(request.url).searchParams.get('connection') || '');
  if (!c) return Response.json({ error: 'Connection not found' }, { status: 404 });
  try { return Response.json(await topics(c)); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 502 }); }
}
