# Kafka Browser

A small local Next.js Kafka developer tool. Requires Node.js 22+ and network access to your brokers.

```sh
npm install
npm run dev
```

Open http://localhost:3000. For a production build, run `npm run build` then `npm start`. Use a persistent Node server, not a static export or short-lived serverless function.

## Connections

Add a named connection using either a host:port service URI or separate host and port fields. The service URI takes precedence.

- SSL: upload a PEM access key and access certificate. Optionally upload a CA certificate for a private CA; otherwise Node's default trust is used.
- SASL over TLS: username, password, PEM CA certificate, and mechanism (PLAIN, SCRAM-SHA-256, SCRAM-SHA-512). Select the mechanism configured by your provider.

Saving automatically connects and loads all visible topics. Star topics to save favorites. Refresh discovers new topics. Delete a connection using the trash icon below its selector.

Use the settings icon beside the connection address to edit a saved connection. Empty password or certificate fields keep the saved values when the authentication mode stays the same. Switching modes requires new credentials. SSL connections can explicitly remove a saved custom CA and use system trust. **Test connection** checks the current form and topic access without saving changes; **Save changes** updates the same connection and preserves its favorites and filters.

## Messages

Choose a topic, choose latest, beginning, or timestamp, then start streaming. Latest waits for new messages after the consumer joins; beginning replays retained messages. Timestamp accepts a date/time in your browser's local timezone and seeks each partition to the first offset at or after that time. Partitions without a match wait for new records; messages older than the chosen timestamp are excluded. Each start clears the previous buffer. Stop disconnects the consumer. Each stream uses an independent temporary consumer group with auto commit disabled. Brokers may retain temporary group metadata until normal cleanup.

- Text search matches value, key, partition, and offset.
- JavaScript filter accepts an expression, such as `value.type === "order.created"` or `message.partition === 0 && value.total > 100`. `value` is parsed JSON when possible, otherwise a string (or null for a tombstone). `message` includes headers and metadata. Click Apply; Reset removes the filter. Expressions execute in your browser: use trusted code. Syntax and runtime failures appear in the UI.
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
