import { hosted } from './hosted-config';

export function validateBroker(host:string,port:number) {
  if (!hosted()) return;
  const entries = (process.env.KAFKA_ALLOWED_HOSTS || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
  const normalized = host.toLowerCase().replace(/\.$/,'');
  const accepted = entries.some(entry => {
    const [pattern,allowedPort] = entry.split(':');
    if (allowedPort && Number(allowedPort) !== port) return false;
    return pattern.startsWith('*.') ? normalized.endsWith(pattern.slice(1)) && normalized !== pattern.slice(2) : normalized === pattern;
  });
  if (!accepted) throw new Error('This broker is not in the administrator’s KAFKA_ALLOWED_HOSTS allowlist');
}
