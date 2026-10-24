import { connection } from '@/lib/db';
import { readConnection } from '@/lib/connection-form';
import { topics } from '@/lib/kafka';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  let c;
  try {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    const existing = id ? connection(id) : undefined;
    if (id && !existing) return Response.json({ error: 'Connection not found' }, { status: 404 });
    c = await readConnection(form, existing);
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  try {
    const list = await topics(c);
    return Response.json({ ok: true, topics: list.length });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 502 }); }
}
