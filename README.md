# Kafka Browser

## Run in the background with Docker

```sh
docker run -d --name kafka-browser --init --restart unless-stopped -p 127.0.0.1:8097:3000 -v kafka-browser-data:/data ghcr.io/alzalabany/kafka-browser:latest
```

The command runs detached, so you can close your terminal. Docker restarts it after Docker or your machine restarts, unless you explicitly stop it. On Docker Desktop, enable **Start Docker Desktop when you sign in** for automatic startup.

Open http://localhost:8097 and add your Kafka connection. Upload your own certificate/key files in the app; the image contains no saved connections or credentials. SQLite, uploaded credentials, presets, selections, and table settings persist in the named `kafka-browser-data` volume across container replacements. Binding to `127.0.0.1` keeps this single-user tool local. If port 8097 is busy, choose another host port, for example `-p 127.0.0.1:8098:3000`.

Manage it anytime:

```sh
docker stop kafka-browser       # stop until you start it again
docker start kafka-browser      # resume
docker logs --tail 100 kafka-browser
```

To update (keeps the data volume):

```sh
docker pull ghcr.io/alzalabany/kafka-browser:latest
docker stop kafka-browser
docker rm kafka-browser
docker run -d --name kafka-browser --init --restart unless-stopped -p 127.0.0.1:8097:3000 -v kafka-browser-data:/data ghcr.io/alzalabany/kafka-browser:latest
```

Or, from this repository, use the included Compose file:

```sh
docker compose up -d --no-build --pull always
```

`KAFKA_BROWSER_PORT` changes the host port; `KAFKA_BROWSER_IMAGE` selects another image tag. To build from source, run `docker compose up -d --build` or `docker build -t alzalabany/kafka-browser:local .`. The production container runs as the unprivileged `node` user with a health check at `/api/health`. It needs network access to all advertised Kafka brokers. For Kafka running on the host, use `host.docker.internal` on Docker Desktop rather than `localhost` (Linux Docker Engine can add `--add-host=host.docker.internal:host-gateway`).

Back up the data volume before upgrading. It contains credentials in unencrypted SQLite; protect it like other local secrets. Do not share a data volume between multiple running app instances. `docker compose down` keeps the Compose volume; `docker compose down -v` permanently removes it.

## Releases and CI

The **CI** workflow runs lint, TypeScript checks, tests, and a production build on pull requests and pushes to `master`.

To release, update the version in `package.json` and `package-lock.json`, commit and push it, then push a matching version tag:

```sh
npm version patch
git push origin master --follow-tags
```

`npm version patch` creates a version commit and tag (use `minor`, `major`, or an explicit version when appropriate). The **Release** workflow validates that the tag matches `package.json`, builds and checks the Docker image for Linux AMD64 and ARM64, publishes to `ghcr.io/alzalabany/kafka-browser`, and creates a GitHub release with generated change notes and the image digest only after publishing succeeds. Stable releases get `latest`, `vX.Y.Z`, and `X.Y.Z` image tags. Prereleases such as `v0.2.0-beta.1` do not move `latest`. To retry a release, use **Actions → Release → Run workflow** and enter the existing tag.

GHCR uses the built-in GitHub token; no registry secret is needed. GitHub packages initially default to private: after the first publication, change the package visibility to public in its package settings if you want anonymous pulls. Then users can run:

```sh
docker run -d --name kafka-browser --init --restart unless-stopped -p 127.0.0.1:8097:3000 -v kafka-browser-data:/data ghcr.io/alzalabany/kafka-browser:latest
```

To also publish to Docker Hub, add repository Actions variable **DOCKERHUB_USERNAME** (the account that owns the destination repository) and Actions secret **DOCKERHUB_TOKEN** (a Docker Hub access token with write permission). Releases then publish the same images to `<DOCKERHUB_USERNAME>/kafka-browser`. Without both settings, Docker Hub is skipped. Browser/desktop Docker logins are not available to GitHub runners.

Local SQLite data, certificate files, environment files, screenshots, and Git history are excluded from the Docker build context with an allowlist. Images are built independently for each target platform so the SQLite native addon matches its architecture.

## Run from source

A small local Next.js Kafka developer tool. Requires Node.js 22+ and network access to your brokers.

```sh
npm install
npm run dev
```

Open http://localhost:3000. For production, use the Docker image above. A manual `npm run build` creates `.next/standalone`; copy `public` and `.next/static` into that folder (preserving their paths), then start with `node .next/standalone/server.js`. Use a persistent Node server, not a static export or short-lived serverless function.

## Connections

Add a named connection using either a host:port service URI or separate host and port fields. The service URI takes precedence.

- SSL: upload a PEM access key and access certificate. Optionally upload a CA certificate for a private CA; otherwise Node's default trust is used.
- SASL over TLS: username, password, PEM CA certificate, and mechanism (PLAIN, SCRAM-SHA-256, SCRAM-SHA-512). Select the mechanism configured by your provider.

Saving automatically connects and loads all visible topics. Star topics to save favorites. Refresh discovers new topics. Delete a connection using the trash icon below its selector.

Use the settings icon beside the connection address to edit a saved connection. Empty password or certificate fields keep the saved values when the authentication mode stays the same. Switching modes requires new credentials. SSL connections can explicitly remove a saved custom CA and use system trust. **Test connection** checks the current form and topic access without saving changes; **Save changes** updates the same connection and preserves its favorites and filters.

## Message table

Open **Table settings** above the message list to choose its time field and additional columns. Fields are read from the transformed message using paths such as `value.timestamp`, `value.symbol`, `value.items[0].price`, or `message.key`. The default time field is Kafka `message.timestamp` in Unix milliseconds. Choose seconds, milliseconds, ISO, or auto detection for custom time fields (auto treats numeric values below 100 billion as seconds). Missing or invalid time values show —. Custom column values preserve null/zero/false and display objects as JSON. Add, reorder, or remove up to 20 columns; the table scrolls horizontally as needed. **Save table** persists the layout separately for each connection/topic, including all-topic search. Cancel discards edits; Reset to defaults changes the draft until saved. Table settings only affect display, not filters, diffs, or exported records.

## Messages

The right sidebar lists saved **Transformers** as radio buttons (including **None**) and saved **Filters** as checkboxes. One transformer and any number of filters can be active. All checked filters must match, after the selected transform runs. Selections are saved in SQLite separately for every connection/topic pair; new topics and connections default to no rules. All-topic search has its own selection for each connection. Switching topics or reloading restores the selection. Stop an all-topic search before changing rules.

Use **+** to add a named transformer or filter, or its settings icon to edit it in a modal. Rule definitions are shared across connections and topics; their activation is not. A filter stores text search plus a JavaScript condition; a transformer stores a function body. **Save rule** saves without activating it. Reusing the same name updates that rule; a new name creates another rule. Deleting a rule removes it from the shared list and prevents it from running wherever previously selected. Cancel leaves the saved definition unchanged.

**Search all topics** in the sidebar opens a cross-topic message search. Enable named text/JavaScript filters in the right sidebar, choose a start position, and click **Start search**. It subscribes to all currently accessible application topics (excluding names starting with `__`). From beginning scans retained history; timestamp seeks each topic's partitions; latest watches new messages. Each result shows its source topic, and topic names are searchable too. Filtering (after the optional transform) happens before buffering, so unrelated traffic does not evict matching records. The latest 1,000 matches are retained. The scanned count shows progress; the search continues watching until stopped, rather than reporting historical completion. Stop to change the applied search/filter/transform and start again for a fresh scan. New topics are discovered on the next start. This is a sequential Kafka scan, not an indexed search; scanning many retained records may take time. No Kafka records are modified and no offsets are automatically committed.

Choose a topic, choose latest, beginning, timestamp, or **Last N per partition**, then start streaming. Latest waits for new messages after the consumer joins; beginning replays retained messages. Timestamp accepts a date/time in your browser's local timezone and seeks each partition to the first offset at or after that time. Partitions without a match wait for new records; messages older than the chosen timestamp are excluded. **Last N per partition** defaults to 10 (valid range 1–1,000): it snapshots each partition's end offset and replays the last N retained offsets, then follows new messages, so inactive topics can be previewed immediately. It also works across all topics. A multi-partition topic can return more than N messages in total; compacted or transactional offset gaps can return fewer. Filters apply after replay, and the normal 1,000-message buffer limit still applies. Each start clears the previous buffer. Stop disconnects the consumer. Each stream uses an independent temporary consumer group with auto commit disabled. Brokers may retain temporary group metadata until normal cleanup.

- Text search matches value, key, partition, and offset.
- The **Transformer** runs a JavaScript function body before display and filtering. `value` is parsed JSON or the original string/null; `message` is a copy of the original message and metadata. For example, `return value.payload;` unwraps an envelope, or `return JSON.parse(value);` decodes a JSON string. Use statements and an explicit `return`; returning `undefined` hides the message, while `null` displays a null value. Save the named rule, then select its radio button to apply it to buffered and incoming messages. Choose **None** to restore original values. The code is stored as a shared named rule; the selected rule is remembered per connection/topic. Transformed values are used in filters, diffs, copy, and JSONL exports; the inspector also exposes the original Kafka value. Syntax errors are shown immediately; individual failing messages are skipped with an error count. Return synchronous strings or JSON-serializable values; async results are unsupported. Code runs in the browser and should be trusted and free of side effects, since buffer updates can run it again. Kafka records are never modified.
- JavaScript filter accepts an expression, such as `value.type === "order.created"` or `message.partition === 0 && value.total > 100`. `value` is parsed JSON when possible, otherwise a string (or null for a tombstone). `message` includes headers and metadata. Save the named rule, then check it in the sidebar. Uncheck it to bypass its text and JavaScript conditions without losing them. Expressions execute in your browser: use trusted code. Syntax and runtime failures appear in the UI.
- Select one message to inspect pretty JSON or raw text, key, headers, timestamp, partition, and offset.
- Select two messages for a recursive value delta, from first selected to second selected. Arrays are compared by index; text is compared as a whole value. Click a selected row to deselect it.
- The buffer keeps the latest 1,000 messages in arrival order. Messages are not persisted.
- **Pause view** freezes the current list and inspector while streaming continues into the bounded buffer. The received count shows activity while paused. **Resume view** shows the latest buffer; records beyond the 1,000-message limit may have been dropped. Clearing messages or starting a new stream resets pause.
- **Copy value** copies the single selected message in the current JSON/raw format.
- **Export JSONL** downloads the messages matching the active filters, in displayed order, with raw values, keys, headers, and metadata. While paused it exports the frozen view. Each line is a complete JSON object; tombstones remain null.

SQLite stores connections (including passwords and certificate contents), favorites, selected topic/connection, and applied filters in `data/kafka-browser.sqlite`. This directory is gitignored. Set `KAFKA_BROWSER_DATA_DIR` to change its location. Back up the directory to preserve settings. Credentials remain server-side and are omitted from connection-list responses; they are stored unencrypted on disk. This is a local, single-user tool without authentication: use a trusted machine and bind to localhost with `npm run dev -- --hostname 127.0.0.1`.

## Checks

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Live broker verification requires a reachable Kafka cluster and valid credentials. Uploaded certificates are validated by Node TLS when connecting; TLS verification is enabled.
