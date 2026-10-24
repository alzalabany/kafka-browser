import { Kafka, logLevel, type SASLOptions } from 'kafkajs';
import type { Credentials } from './types';
export function kafka(c: Credentials) {
  return new Kafka({ clientId: 'kafka-browser', brokers: [`${c.host}:${c.port}`], logLevel: logLevel.NOTHING,
    connectionTimeout: 10000, requestTimeout: 15000, retry: { retries: 1 },
    ssl: { rejectUnauthorized: true, ...(c.ca ? { ca: [c.ca] } : {}), ...(c.mode === 'ssl' ? { key: c.key, cert: c.cert } : {}) },
    ...(c.mode === 'sasl' ? { sasl: { mechanism: c.mechanism, username: c.username, password: c.password } as SASLOptions } : {}),
  });
}
export async function topics(c: Credentials) {
  const admin = kafka(c).admin();
  try { await admin.connect(); const result = await admin.fetchTopicMetadata(); return result.topics.map(t => ({ name: t.name, partitions: t.partitions.length })).sort((a,b) => a.name.localeCompare(b.name)); }
  finally { await admin.disconnect(); }
}
