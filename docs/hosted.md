# Hosted company workspace

Run Kafka Browser on DigitalOcean App Platform with Firebase Google sign-in and Firestore persistence. The server authenticates with the signed-in user's Firebase tokens. **No Google service-account key, ADC file, or organization-policy exception is required.**

## How authentication works

1. The browser signs in using Firebase Google login and sends the ID token and refresh token to the same-origin server over HTTPS.
2. The server verifies the ID token signature with Google's public certificates and checks the current user with Firebase's user-authenticated account API. It requires a verified Google identity from an allowed email domain.
3. Both tokens are encrypted in an HttpOnly, Secure, SameSite=Strict cookie. The browser Firebase SDK uses in-memory persistence and signs out after handing the session to the server.
4. The server uses the user's ID token for Firestore REST requests. Firestore Security Rules enforce company membership and personal ownership independently of the server.
5. Expired ID tokens refresh on the next API request. Refresh does not extend the five-day session limit. Current account state and revocation time are checked on each authenticated request. Logging out clears the cookie and stops that user's streams on the current instance.

Kafka passwords and certificates stay encrypted in Firestore using AES-256-GCM. Only the server has the encryption key and decrypts credentials to connect to brokers. Company members can read the encrypted connection documents through Firestore directly, as permitted by the same company rules; plaintext credentials are never returned by connection-list APIs.

Direct Firestore access follows Firebase ID-token expiry (normally one hour); Security Rules do not query Firebase account revocation state. The application server checks current account state on every API request, while an already-issued token may continue to authorize direct Firestore requests until it expires.

## Firebase setup

Company project: `kafka-browser`. Its free-tier Standard Firestore database is in `me-central2`, matching company location policy.

- Enable Google in **Authentication → Sign-in method**.
- Add `kafka.amana-dev.com` to **Authentication → Settings → Authorized domains**.
- Keep `FIREBASE_AUTH_DOMAIN=kafka-browser.firebaseapp.com`; the Google popup callback uses Firebase's hosted auth handler.
- Deploy the checked-in Security Rules using an operator's company login:

```sh
firebase deploy --only firestore:rules --project kafka-browser --account momen.zalabany@amanacapital.com
```

The rules admit verified Google accounts from `amanacapital.com`. Company connection IDs retain the existing SHA-256 domain namespace so existing encrypted connections need no migration. Personal documents use `users/{Firebase UID}`. When allowing another domain, update **both** the server's `ALLOWED_EMAIL_DOMAINS` and the explicit domain/company-ID mapping in `firestore.rules`; expanding only the environment variable will not grant Firestore access.

## DigitalOcean configuration

The deployed custom domain is `https://kafka.amana-dev.com`. Use [.do/app.yaml](../.do/app.yaml) as a template for a new app; preserve existing app sizing and network settings when updating an existing deployment.

Set these environment variables:

| Variable | Value |
| --- | --- |
| `KAFKA_BROWSER_MODE` | `hosted` |
| `APP_ORIGIN` | `https://kafka.amana-dev.com` |
| `FIREBASE_PROJECT_ID` | `kafka-browser` |
| `FIREBASE_AUTH_DOMAIN` | `kafka-browser.firebaseapp.com` |
| `FIREBASE_WEB_APP_ID` | Firebase web app ID |
| `FIREBASE_WEB_API_KEY` | Firebase public web API key |
| `ALLOWED_EMAIL_DOMAINS` | `amanacapital.com` |
| `KAFKA_ALLOWED_HOSTS` | Allowed broker hosts, or `*` to allow all |
| `KAFKA_CREDENTIALS_KEY` | Stable base64-encoded 32-byte encryption key; **encrypted, runtime only** |

Use the existing encryption key when upgrading: replacing it makes stored connections unreadable and invalidates sessions. For a new installation, generate one with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Never commit the key or a populated app specification. Do not deploy `FIREBASE_SERVICE_ACCOUNT_JSON`, `GOOGLE_APPLICATION_CREDENTIALS`, local ADC, or emulator variables. The runtime explicitly refuses privileged Google API credentials in its token verifier and rejects emulator configuration in production.

For a fresh app, `node --env-file=.env.hosted scripts/render-app-spec.mjs` renders an ignored specification containing the runtime secret. Review cost before creating paid infrastructure. A persistent Node server is required for Kafka streaming; static hosting and short-lived functions are unsuitable. Keep one app instance initially.

## Sharing and access

- Company members can use, edit, and delete company connections and shared rules.
- Rules default to Personal. Choose Company in the editor to create a shared copy; changing scope preserves the original.
- **View settings sharing** switches personal/company favorites, selected rules, and table layouts. Company layouts can select only company rules. The active connection remains personal.
- Settings use last-write-wins; refresh to see another member's changes.
- JavaScript rules run in the browser. Only use code you trust.
- Streams are limited to two per user per instance, and end after 30 minutes or the current ID token's expiry. Restart to continue. Logout cancellation is per instance.

## Upgrading from Admin SDK storage

Existing Firebase Admin session cookies require sign-in again. Company connections and shared settings keep their existing paths and encryption key.

Personal paths changed from hashed UIDs to Firebase UIDs so Security Rules can enforce ownership. Run the one-time operator migration with local company ADC before deploying the new rules/app:

```sh
node --env-file=.env.hosted --import tsx scripts/migrate-user-paths.ts
```

The migration copies personal settings and presets for existing Firebase users, skips already-present destination documents, and retains old records as backup. Local operator credentials are used only for this administrative migration, never by the deployed application. Local SQLite settings are not automatically uploaded.

After deployment, verify `/api/health`, Google login, company topic access, personal isolation, refresh, and logout before disabling DigitalOcean maintenance mode. The standalone build copies its static assets using `npm run build:hosted`.
