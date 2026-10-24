import type { Admin, Consumer } from 'kafkajs';

export function readTimestamp(from: string | null, timestamp: string | null) {
  if (!['latest', 'beginning', 'timestamp'].includes(from || 'latest')) throw new Error('Invalid start position.');
  if (from !== 'timestamp') return undefined;
  const value = Number(timestamp);
  if (!timestamp || !Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) throw new Error('Choose a valid start timestamp.');
  return value;
}

export async function timestampOffsets(admin: Pick<Admin, 'fetchTopicOffsetsByTimestamp' | 'fetchTopicOffsets'>, topic: string, timestamp: number) {
  // Snapshot the end first: a partition with no matching timestamp starts here,
  // so records arriving during the timestamp lookup are still consumed.
  const ends = await admin.fetchTopicOffsets(topic);
  const offsets = await admin.fetchTopicOffsetsByTimestamp(topic, timestamp);
  return ends.map(end => {
    const found = offsets.find(o => o.partition === end.partition);
    return { topic, partition: end.partition, offset: found && BigInt(found.offset) >= BigInt(0) ? found.offset : end.offset };
  });
}

export function seekOnFirstJoin(consumer: Pick<Consumer, 'on' | 'events' | 'seek'>, offsets: { topic: string; partition: number; offset: string }[]) {
  let initialized = false;
  return consumer.on(consumer.events.GROUP_JOIN, () => {
    if (initialized) return;
    initialized = true;
    for (const offset of offsets) consumer.seek(offset);
  });
}
