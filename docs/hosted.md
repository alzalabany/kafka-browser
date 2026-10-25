# Hosted company workspace

The app runs on DigitalOcean App Platform; Firebase Authentication handles Google sign-in and Firestore stores application data. Developers only need a browser. App Platform builds directly from GitHub using Node.js 24; Docker is not needed for deployment.

## Access and sharing

- Every data and Kafka API verifies a Firebase session cookie. Only verified Google accounts with an exact domain in `ALLOWED_EMAIL_DOMAINS` are admitted (initially `amanacapital.com`). Google's account-picker domain hint is convenience only; the server enforces access.
- Connections belong to the company domain. Every company member can use, edit, and delete them. Passwords and certificate contents are never included in connection-list responses.
- Filters and transformers default to Personal. Choose Company in their editor to save a company copy. Company rules are visible, editable, and deletable by all company members. Moving between scopes creates a separate copy; the original remains. Only run shared JavaScript you trust: transformers execute in the signed-in browser.
- The sidebar's **View settings sharing** selector switches between Personal and Company favorites, active rules, and table layouts. Company views can select only company rules. The active connection is always personal. Settings use last-write-wins; refresh to see edits made by another member.
- Existing local SQLite data is not automatically uploaded. Re-add the connections you want to share. Local mode remains available with `KAFKA_BROWSER_MODE=local` (the default).

## Firebase setup

Project: `amana-kafka-browser`. Its default Firestore database is in `europe-west3`, Standard edition with the free tier. Google sign-in is enabled. The Firebase web configuration is public configuration; the service account and credential encryption key are secrets.

Deploy the deny-all browser rules with:

```sh
firebase deploy --only firestore:rules --project amana-kafka-browser
```

The Next.js server uses a dedicated runtime service account with `roles/datastore.user` and `roles/firebaseauth.admin` on this project. The latter permits creating and verifying Firebase session cookies. Do not use a project-owner key. Store its JSON in DigitalOcean's encrypted `FIREBASE_SERVICE_ACCOUNT_JSON` variable, available at runtime only.

Credentials are encrypted with AES-256-GCM before Firestore storage, with authentication bound to their company and connection ID. Generate one key and keep a secure backup:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set that value as runtime secret `KAFKA_CREDENTIALS_KEY`. Keep it stable across deployments. Losing or replacing it makes existing saved connections unreadable; rotation requires re-encrypting them first. Certificate bundles must fit within the app's 500 KB saved-record limit.

## DigitalOcean deployment

Use [.do/app.yaml](../.do/app.yaml) as the App Platform specification. It selects a single 1 GiB instance in Frankfurt, a standalone Next.js server on port 8080, `/api/health` checks, and automatic deployments from `master`. Review the current instance price before creating the app. Firestore is durable; no local volume or managed SQL database is needed.

Replace the four configuration placeholders: Firebase web API key, runtime service-account JSON, credential encryption key, and allowed Kafka brokers. Secrets must be **SECRET** variables with **RUN_TIME** scope; never commit a populated specification. `APP_ORIGIN` binds to DigitalOcean's `APP_URL`; if you later add a custom domain, set this to its exact HTTPS origin (without a trailing slash).

`KAFKA_ALLOWED_HOSTS` is an administrator-controlled, comma-separated allowlist. It applies to both bootstrap and metadata-advertised Kafka brokers. Exact hosts and patterns such as `*.your-cluster.example.com` are supported, optionally followed by `:port`. Use a narrow cluster-specific list. It protects the hosted service from arbitrary outbound network connections. Kafka itself must allow inbound connections from App Platform; private-only brokers require suitable network access. Broker TLS verification remains enabled.

After DigitalOcean assigns the app URL, add its hostname under **Firebase Authentication → Settings → Authorized domains**. Keep only origins you use. The default Firebase `authDomain` is already provided by Firebase Hosting; no frontend hosting deployment is necessary.

With an ignored `.env.hosted` configured, `node --env-file=.env.hosted scripts/render-app-spec.mjs` creates an ignored, populated `artifacts/app-hosted.yaml` for deployment. This file contains secrets. Use `doctl apps spec validate artifacts/app-hosted.yaml` to validate it and, after reviewing the plan and cost, `doctl apps create --spec artifacts/app-hosted.yaml`. Do not print the populated file into CI logs.

Sessions use HttpOnly, SameSite=Strict cookies, secure on HTTPS, and last five days. Login has a double-submit CSRF token and recent-Google-login check; mutations enforce `APP_ORIGIN`. Revoked or disabled accounts are checked at API entry. Each user can run two streams per app instance; streams close after 30 minutes or session expiry and must be restarted. Logging out closes that user's streams on the current instance. Keep one instance initially; multi-instance/global stream accounting and revocation of already-open streams are not distributed.

`/api/health` validates runtime configuration without exposing secrets or charging a Firestore read on every health check. It does not prove Firebase credentials or broker reachability; verify sign-in and a connection after deployment.

## Local hosted-mode verification

Copy `.env.example` to an ignored environment file, fill it with your project's values, and set `APP_ORIGIN=http://localhost:3100`. Then:

```sh
npm ci
npm run build:hosted
PORT=3100 HOSTNAME=127.0.0.1 node --env-file=.env.hosted .next/standalone/server.js
```

Add localhost to Firebase's authorized domains for local Google login. Local HTTP is allowed only for loopback origins; public production origins require HTTPS.

CI tests company/personal persistence against the Firestore emulator with Java 21. To run that verification locally with Firebase CLI and Java 21 installed:

```sh
firebase emulators:exec --only firestore --project demo-kafka-browser "npx tsx --test src/lib/hosted-store.test.ts"
```

Normal `npm test` runs authentication, CSRF, domain matching, credential encryption, stream limits, and existing message tests. The storage integration test is skipped outside an emulator unless explicitly enabled for the new Firebase project.
