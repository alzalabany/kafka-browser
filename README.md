<div align="center">

# Kafka Browser

### See what’s flowing. Find what matters.

A Kafka workspace for developers who want to read real events, untangle payloads, and understand what changed.

[Get started](#get-started) · [Explore the features](#built-for-the-debugging-session) · [Host for your team](docs/hosted.md) · [Full guide](docs/reference.md)

</div>

---

Your event is somewhere in Kafka. The topic is quiet, the payload is nested, and the interesting part is buried in a stream of noise.

**Kafka Browser brings it into focus.** Connect your cluster, preview recent messages, reshape the payload, and filter down to the event you need—all in your browser.

## Built for the debugging session

| When you need to… | Kafka Browser helps you… |
| --- | --- |
| Check a quiet topic | Load the **last N messages per partition**, then follow new events. |
| Find an event without knowing its topic | **Search across topics** with text and JavaScript filters. |
| Make sense of nested payloads | Apply a **JavaScript transformer** before filtering and display. |
| Spot what changed | Select two messages for a **recursive JSON diff**. |
| Keep useful fields in view | Add **custom table columns** and use a payload field as the timestamp. |
| Reuse a good debugging setup | Save named filters and transformers, with selections remembered per connection and topic. |
| Share context with the team | Share connections, rules, favorites, and table layouts in an optional **company workspace**. |

### Go from connection to insight

1. **Connect.** Add SSL certificates or SASL credentials over TLS. Browse topics and star your regulars.
2. **Choose your starting point.** Follow live traffic, replay retained history, jump to a timestamp, or preview the last N messages per partition.
3. **Shape the view.** Select one transformer and combine multiple filters. Inspect pretty JSON, raw text, keys, headers, partitions, and offsets.
4. **Take the evidence.** Compare two messages, copy a value, or export the filtered view as JSONL.

Pause the view when something catches your eye; resume when you’re ready. The live buffer holds up to 1,000 messages.

### Your payload. Your JavaScript.

Unwrap an event envelope with a saved transformer:

```js
return value.payload;
```

Then add a filter for the events you care about:

```js
value.type === "order.created" && value.total > 100
```

**Transform → Filter → Inspect.** Filters, diffs, and exports use the transformed value. The inspector keeps the original Kafka value available, and your rules never rewrite records in Kafka.

## Get started

### Keep it running locally

Run the container in the background with persistent SQLite storage:

```sh
docker run -d --name kafka-browser --init --restart unless-stopped \
  -p 127.0.0.1:8097:3000 \
  -v kafka-browser-data:/data \
  ghcr.io/alzalabany/kafka-browser:latest
```

Open **[localhost:8097](http://localhost:8097)**, add your connection, and start exploring. The image includes no saved credentials. Your connections and settings survive container replacements through the named volume.

Prefer Compose? From this repository:

```sh
docker compose up -d --no-build --pull always
```

### Run from source

With **Node.js 24** installed:

```sh
npm install
npm run dev -- --hostname 127.0.0.1
```

Open **[localhost:3000](http://localhost:3000)**. Local mode works without a Firebase project or Google sign-in.

## Work solo. Or bring your team.

**Local workspace:** SQLite saves connections, favorites, rules, and layouts on your machine. No app account needed.

**Company workspace:** Self-host with Firebase Google sign-in and Firestore persistence. Restrict access to your company’s email domains, share cluster connections, and choose which rules and view settings stay personal or become shared.

See the **[hosted setup guide](docs/hosted.md)** for authentication, configuration, and DigitalOcean App Platform deployment. Hosting requires your own infrastructure setup.

## A few useful details

- **Connections:** SSL client certificates or SASL over TLS with PLAIN, SCRAM-SHA-256, and SCRAM-SHA-512.
- **Search:** Reads Kafka records as a sequential scan; it isn’t an indexed search engine.
- **Persistence:** Saves workspace configuration, not streamed messages.
- **Local credentials:** Stored unencrypted in SQLite. Keep the data volume private and bind local mode to localhost.
- **JavaScript rules:** Execute in your browser. Use code you trust.

## Go deeper

- [Full guide](docs/reference.md): streaming, replay, transforms, filters, table settings, Docker updates, and backups.
- [Hosted company workspaces](docs/hosted.md): Google login, sharing, and deployment configuration.
- [Releases](https://github.com/alzalabany/kafka-browser/releases): release notes and published image details.
- [Report an issue](https://github.com/alzalabany/kafka-browser/issues): bugs, ideas, and rough edges.

Built with **Next.js · KafkaJS · SQLite · Firebase**.
