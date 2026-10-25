import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export type Preset = { id: string; name: string; kind: 'filter' | 'transform'; search: string; js: string; transform: string; scope?:'personal'|'company' };

export function readPreset(input: unknown): Omit<Preset, 'id'> {
  if (!input || typeof input !== 'object') throw new Error('Invalid preset');
  const value = input as Record<string, unknown>;
  if (value.scope !== undefined && value.scope !== 'personal' && value.scope !== 'company') throw new Error('Invalid rule sharing scope');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 100) throw new Error('Enter a preset name (1–100 characters).');
  if (value.kind !== 'filter' && value.kind !== 'transform') throw new Error('Invalid preset kind');
  for (const key of ['search', 'js', 'transform']) if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > 100_000)) throw new Error('Invalid preset content');
  return {name:value.name.trim(), kind:value.kind, search:value.kind === 'filter' ? value.search as string || '' : '', js:value.kind === 'filter' ? value.js as string || '' : '', transform:value.kind === 'transform' ? value.transform as string || '' : '', ...(value.scope ? {scope:value.scope as 'personal'|'company'} : {})};
}

export function presetStore(db: Database.Database) {
  db.exec('CREATE TABLE IF NOT EXISTS presets (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL, UNIQUE(kind, name))');
  return {
    list: () => (db.prepare('SELECT id, content FROM presets ORDER BY name COLLATE NOCASE').all() as {id:string;content:string}[]).map(row => ({...JSON.parse(row.content),id:row.id}) as Preset),
    save: (input: unknown): Preset => {
      const value = readPreset(input);
      const existing = db.prepare('SELECT id FROM presets WHERE kind = ? AND name = ?').get(value.kind,value.name) as {id:string} | undefined;
      const id = existing?.id || randomUUID();
      db.prepare('INSERT INTO presets VALUES (?, ?, ?, ?) ON CONFLICT(kind,name) DO UPDATE SET content = excluded.content').run(id,value.name,value.kind,JSON.stringify(value));
      return {...value,id};
    },
    remove: (id: string) => db.prepare('DELETE FROM presets WHERE id = ?').run(id).changes > 0,
  };
}
