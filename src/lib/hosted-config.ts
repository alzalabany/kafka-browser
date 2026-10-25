export const hosted = () => process.env.KAFKA_BROWSER_MODE === 'hosted';

export function requireHostedConfig() {
  if (process.env.NODE_ENV==='production' && (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST)) throw new Error('Firebase emulators cannot be used in hosted production');
  for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_WEB_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_WEB_APP_ID', 'KAFKA_CREDENTIALS_KEY', 'APP_ORIGIN', 'KAFKA_ALLOWED_HOSTS', 'ALLOWED_EMAIL_DOMAINS']) {
    if (!process.env[key]?.trim()) throw new Error(`Hosted configuration missing: ${key}`);
  }
  if (Buffer.from(process.env.KAFKA_CREDENTIALS_KEY!, 'base64').length !== 32) throw new Error('KAFKA_CREDENTIALS_KEY must be a base64-encoded 32-byte key');
  const origin = new URL(process.env.APP_ORIGIN!);
  if (origin.origin !== process.env.APP_ORIGIN) throw new Error('APP_ORIGIN must be an origin without a path or trailing slash');
  if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(origin.hostname)) throw new Error('Hosted production requires HTTPS');
}

export function allowedIdentity(claims: { email?: string; email_verified?: boolean; firebase?: { sign_in_provider?: string } }) {
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS || '').split(',').map(domain => domain.trim().toLowerCase()).filter(Boolean);
  const email = claims.email?.toLowerCase().split('@');
  return claims.email_verified === true && claims.firebase?.sign_in_provider === 'google.com' && Boolean(email?.length === 2 && email[0] && domains.includes(email[1]));
}
