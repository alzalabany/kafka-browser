import { connection } from '@/lib/db';
import { kafka } from '@/lib/kafka';
import { readTimestamp, readTailCount, timestampOffsets, tailOffsets, seekOnFirstJoin } from '@/lib/stream-position';
import { messageId } from '@/lib/messages';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url); const c = connection(url.searchParams.get('connection') || ''); const topic = url.searchParams.get('topic');
  const allTopics = url.searchParams.get('scope') === 'all';
  if (!c || (!topic && !allTopics)) return Response.json({error:'Connection and topic (or all-topics scope) are required'}, {status:400});
  let timestamp: number | undefined; let tailCount: number | undefined;
  try { timestamp = readTimestamp(url.searchParams.get('from'), url.searchParams.get('timestamp')); tailCount = readTailCount(url.searchParams.get('from'), url.searchParams.get('count')); }
  catch (e) { return Response.json({error:(e as Error).message}, {status:400}); }
  const client = kafka(c);
  const consumer = client.consumer({ groupId: `kafka-browser-${crypto.randomUUID()}`, allowAutoTopicCreation: false });
  const admin = timestamp !== undefined || tailCount !== undefined || allTopics ? client.admin() : undefined;
  const positionClients: ReturnType<typeof client.admin>[] = [];
  let closed = false; let timer: ReturnType<typeof setInterval> | undefined;
  const close = async () => { if (closed) return; closed = true; clearInterval(timer); await Promise.allSettled([consumer.disconnect(), admin?.disconnect(), ...positionClients.map(a => a.disconnect())]); };
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => { if (!closed) { try { controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { void close(); } } };
      request.signal.addEventListener('abort', () => { void close(); }, { once: true });
      timer = setInterval(() => send('heartbeat', {}), 15000);
      consumer.on(consumer.events.CRASH, ({payload}) => { send('failure', {error: payload.error.message}); void close().then(() => { try {controller.close();} catch {} }); });
      void (async () => {
        try {
          let topicNames = topic ? [topic] : [];
          if (admin) {
            await admin.connect();
            if (closed) { await admin.disconnect(); return; }
            if (allTopics) topicNames = (await admin.listTopics()).filter(name => !name.startsWith('__'));
            if (!topicNames.length) throw new Error('No accessible application topics found.');
            if (timestamp !== undefined || tailCount !== undefined) {
              // Each worker owns its admin metadata cache; concurrent lookups on
              // a shared KafkaJS admin can race when adding new target topics.
              const workers = Math.min(4, topicNames.length);
              const offsets = await Promise.all(Array.from({length:workers}, async (_, worker) => {
                const positionClient = client.admin();
                positionClients.push(positionClient);
                const found = [];
                try {
                  await positionClient.connect();
                  for (let i = worker; i < topicNames.length && !closed; i += workers) {
                    found.push(...await (tailCount !== undefined ? tailOffsets(positionClient, topicNames[i], tailCount) : timestampOffsets(positionClient, topicNames[i], timestamp!)));
                  }
                  return found;
                } finally { await positionClient.disconnect(); }
              }));
              if (closed) return;
              seekOnFirstJoin(consumer, offsets.flat());
            }
            await admin.disconnect();
            if (closed) return;
          }
          await consumer.connect(); if (closed) { await consumer.disconnect(); return; }
          await consumer.subscribe({ topics: topicNames, fromBeginning: tailCount !== undefined || url.searchParams.get('from') === 'beginning' });
          if (closed) { await consumer.disconnect(); return; }
          await consumer.run({ autoCommit: false, eachMessage: async ({topic, partition, message}) => {
            // Guard against older timestamps, including out-of-order records and
            // future start times for partitions that currently have no match.
            if (timestamp !== undefined && Number(message.timestamp) < timestamp) return;
            send('message', {id:messageId(topic, partition, message.offset), topic, partition, offset:message.offset, timestamp:message.timestamp, key:message.key?.toString() ?? null, value:message.value?.toString() ?? null, headers:Object.fromEntries(Object.entries(message.headers || {}).map(([k,v]) => [k, String(v ?? '')]))});
          } });
          send('ready', { topics: topicNames.length });
        } catch (e) { send('failure', {error:(e as Error).message}); await close(); try { controller.close(); } catch {} }
      })();
    },
    cancel: close,
  });
  return new Response(stream, { headers: {'Content-Type':'text/event-stream', 'Cache-Control':'no-cache, no-transform', Connection:'keep-alive', 'X-Accel-Buffering':'no'} });
}
