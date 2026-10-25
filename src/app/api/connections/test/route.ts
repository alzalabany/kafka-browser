import { userStore } from '@/lib/user-store';
import { withUser } from '@/lib/auth';
import { validateBroker } from '@/lib/broker-policy';
import { readConnection } from '@/lib/connection-form';
import { topics } from '@/lib/kafka';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = withUser(async (request,user) => {
  const store = await userStore(user.uid,user.email);
  let c;
  try {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    const existing = id ? await store.connection(id) : undefined;
    if (id && !existing) return Response.json({ error: 'Connection not found' }, { status: 404 });
    c = await readConnection(form, existing);
    validateBroker(c.host,c.port);
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  try {
    const list = await topics(c);
    return Response.json({ ok: true, topics: list.length });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 502 }); }
});
