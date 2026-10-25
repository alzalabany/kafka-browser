import { Kafka, logLevel, type SASLOptions } from 'kafkajs';
import type { Credentials } from './types';
import net from 'node:net';
import tls from 'node:tls';
import { validateBroker } from './broker-policy';
export function kafka(c: Credentials) {
  validateBroker(c.host,c.port);
  return new Kafka({ clientId: 'kafka-browser', brokers: [`${c.host}:${c.port}`], logLevel: logLevel.NOTHING,
    socketFactory: ({host,port,ssl,onConnect}) => {
      // Applies to bootstrap AND metadata-advertised brokers, not just saved input.
      validateBroker(host,port);
      return ssl ? tls.connect({host,port,...ssl,servername:host},onConnect) : net.connect({host,port},onConnect);
    },
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
