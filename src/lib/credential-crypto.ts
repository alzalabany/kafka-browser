import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key() {
  const bytes = Buffer.from(process.env.KAFKA_CREDENTIALS_KEY || '', 'base64');
  if (bytes.length !== 32) throw new Error('Credential encryption key is not configured');
  return bytes;
}
export function encryptCredentials(value: unknown, owner: string, id: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(JSON.stringify([owner,id])));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { version:1, iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), ciphertext:encrypted.toString('base64') };
}
export function decryptCredentials<T>(value: ReturnType<typeof encryptCredentials>, owner: string, id: string): T {
  if (value.version !== 1) throw new Error('Unsupported credential format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(value.iv,'base64'));
  decipher.setAAD(Buffer.from(JSON.stringify([owner,id])));
  decipher.setAuthTag(Buffer.from(value.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64')), decipher.final()]).toString('utf8'));
}
