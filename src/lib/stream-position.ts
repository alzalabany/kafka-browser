import type { Admin, Consumer } from 'kafkajs';

export function readTimestamp(from: string | null, timestamp: string | null) {
  if (!['latest', 'beginning', 'timestamp', 'tail'].includes(from || 'latest')) throw new Error('Invalid start position.');
  if (from !== 'timestamp') return undefined;
  const value = Number(timestamp);
  if (!timestamp || !Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) throw new Error('Choose a valid start timestamp.');
  return value;
}

export function readTailCount(from: string | null, count: string | null) {
  if (from !== 'tail') return undefined;
  const value = Number(count);
  if (!count || !Number.isInteger(value) || value < 1 || value > 1000) throw new Error('Choose a last-message count between 1 and 1,000.');
  return value;
}

export async function tailOffsets(admin: Pick<Admin, 'fetchTopicOffsets'>, topic: string, count: number) {
  const ends = await admin.fetchTopicOffsets(topic);
  return ends.map(end => {
    const candidate = BigInt(end.offset) - BigInt(count);
    const low = BigInt(end.low);
    return { topic, partition: end.partition, offset: String(candidate > low ? candidate : low) };
  });
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
