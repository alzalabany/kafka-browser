import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Credentials } from './types';

const directory = process.env.KAFKA_BROWSER_DATA_DIR || path.join(process.cwd(), 'data');
mkdirSync(directory, { recursive: true });
const db = new Database(path.join(directory, 'kafka-browser.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, config TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
export function connections(): Credentials[] { return (db.prepare('SELECT config FROM connections').all() as {config: string}[]).map(r => JSON.parse(r.config)); }
export function connection(id: string) { return connections().find(c => c.id === id); }
export function saveConnection(c: Credentials) { db.prepare('INSERT OR REPLACE INTO connections VALUES (?, ?)').run(c.id, JSON.stringify(c)); }
export function deleteConnection(id: string) { db.prepare('DELETE FROM connections WHERE id = ?').run(id); db.prepare('DELETE FROM state WHERE key = ?').run(id); }
export function getState(key: string) { const row = db.prepare('SELECT value FROM state WHERE key = ?').get(key) as { value: string } | undefined; return row ? JSON.parse(row.value) : {}; }
export function setState(key: string, value: unknown) { db.prepare('INSERT OR REPLACE INTO state VALUES (?, ?)').run(key, JSON.stringify(value)); }
