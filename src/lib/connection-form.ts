import type { Credentials } from './types';

// Empty secret inputs keep the existing secret when editing the same auth mode.
export async function readConnection(form: FormData, existing?: Credentials): Promise<Credentials> {
  const str = (key: string) => String(form.get(key) || '').trim();
  const pem = async (key: string) => {
    const file = form.get(key);
    if (!(file instanceof File) || !file.size) return '';
    if (file.size > 1024 * 1024) throw new Error('Certificate files must be smaller than 1 MB.');
    return file.text();
  };
  const mode = str('mode');
  const mechanism = str('mechanism') || 'plain';
  if (!['ssl', 'sasl'].includes(mode) || !['plain', 'scram-sha-256', 'scram-sha-512'].includes(mechanism)) throw new Error('Invalid authentication mode.');
  let host = str('host'), port = Number(str('port'));
  if (str('uri')) {
    const uri = new URL(str('uri').includes('://') ? str('uri') : `https://${str('uri')}`);
    host = uri.hostname;
    port = Number(uri.port);
  }
  if (!host || /[\s/]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !str('name')) throw new Error('Enter a name and a valid host and port (or service URI).');
  const previous = existing?.mode === mode ? existing : undefined;
  const c = {
    id: existing?.id || crypto.randomUUID(), name: str('name'), mode, host, port, mechanism,
    username: mode === 'sasl' ? str('username') : '',
    password: mode === 'sasl' ? String(form.get('password') || '') || previous?.password || '' : '',
    ca: str('clearCa') === 'on' && mode === 'ssl' ? '' : await pem('ca') || previous?.ca || '',
    cert: mode === 'ssl' ? await pem('cert') || previous?.cert || '' : '',
    key: mode === 'ssl' ? await pem('key') || previous?.key || '' : '',
  } as Credentials;
  if (mode === 'ssl' && (!c.key || !c.cert)) throw new Error('Upload the access key and access certificate.');
  if (mode === 'sasl' && (!c.username || !c.password || !c.ca)) throw new Error('Enter username and password, and upload the CA certificate.');
  return c;
}
