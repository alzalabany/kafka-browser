import { connection } from '@/lib/db';
import { kafka } from '@/lib/kafka';
import { readTimestamp, timestampOffsets, seekOnFirstJoin } from '@/lib/stream-position';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url); const c = connection(url.searchParams.get('connection') || ''); const topic = url.searchParams.get('topic');
  if (!c || !topic) return Response.json({error:'Connection and topic are required'}, {status:400});
  let timestamp: number | undefined;
  try { timestamp = readTimestamp(url.searchParams.get('from'), url.searchParams.get('timestamp')); }
  catch (e) { return Response.json({error:(e as Error).message}, {status:400}); }
  const client = kafka(c);
  const consumer = client.consumer({ groupId: `kafka-browser-${crypto.randomUUID()}`, allowAutoTopicCreation: false });
  const admin = timestamp !== undefined ? client.admin() : undefined;
  let closed = false; let timer: ReturnType<typeof setInterval> | undefined;
  const close = async () => { if (closed) return; closed = true; clearInterval(timer); await Promise.allSettled([consumer.disconnect(), admin?.disconnect()]); };
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => { if (!closed) { try { controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { void close(); } } };
      request.signal.addEventListener('abort', () => { void close(); }, { once: true });
      timer = setInterval(() => send('heartbeat', {}), 15000);
      consumer.on(consumer.events.CRASH, ({payload}) => { send('failure', {error: payload.error.message}); void close().then(() => { try {controller.close();} catch {} }); });
      void (async () => {
        try {
          if (admin && timestamp !== undefined) {
            await admin.connect();
            if (closed) { await admin.disconnect(); return; }
            const offsets = await timestampOffsets(admin, topic, timestamp);
            await admin.disconnect();
            if (closed) return;
            seekOnFirstJoin(consumer, offsets);
          }
          await consumer.connect(); if (closed) { await consumer.disconnect(); return; }
          await consumer.subscribe({ topic, fromBeginning: url.searchParams.get('from') === 'beginning' });
          if (closed) { await consumer.disconnect(); return; }
          await consumer.run({ autoCommit: false, eachMessage: async ({topic, partition, message}) => {
            // Guard against older timestamps, including out-of-order records and
            // future start times for partitions that currently have no match.
            if (timestamp !== undefined && Number(message.timestamp) < timestamp) return;
            send('message', {id:`${partition}:${message.offset}`, topic, partition, offset:message.offset, timestamp:message.timestamp, key:message.key?.toString() ?? null, value:message.value?.toString() ?? null, headers:Object.fromEntries(Object.entries(message.headers || {}).map(([k,v]) => [k, String(v ?? '')]))});
          } });
          send('ready', {});
        } catch (e) { send('failure', {error:(e as Error).message}); await close(); try { controller.close(); } catch {} }
      })();
    },
    cancel: close,
  });
  return new Response(stream, { headers: {'Content-Type':'text/event-stream', 'Cache-Control':'no-cache, no-transform', Connection:'keep-alive', 'X-Accel-Buffering':'no'} });
}
