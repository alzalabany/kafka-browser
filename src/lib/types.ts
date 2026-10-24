export type Connection = { id: string; name: string; mode: 'ssl' | 'sasl'; host: string; port: number; username: string; mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512' };
export type Credentials = Connection & { password: string; ca: string; cert: string; key: string };
export type Message = { id: string; topic: string; partition: number; offset: string; timestamp: string; key: string | null; value: string | null; headers: Record<string, string> };
