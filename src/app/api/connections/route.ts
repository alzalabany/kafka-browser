import { connection, connections, saveConnection, deleteConnection } from '@/lib/db';
import { readConnection } from '@/lib/connection-form';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(connections().map(({ password, ca, cert, key, ...c }) => ({ ...c, hasCredentials: Boolean(password || key), hasCa: Boolean(ca), hasCert: Boolean(cert) }))); }
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const c = await readConnection(form);
    saveConnection(c); return Response.json({ id: c.id });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
export async function PUT(request: Request) {
  try {
    const form = await request.formData();
    const existing = connection(String(form.get('id') || ''));
    if (!existing) return Response.json({ error: 'Connection not found' }, { status: 404 });
    const c = await readConnection(form, existing);
    saveConnection(c);
    return Response.json({ id: c.id });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
export async function DELETE(request: Request) { const id = new URL(request.url).searchParams.get('id'); if (!id) return Response.json({error:'Missing connection'}, {status:400}); deleteConnection(id); return Response.json({ok:true}); }
