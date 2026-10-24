"use client";

import { useEffect, useState } from 'react';
import type { Preset } from '@/lib/presets';

type Props = { kind: Preset['kind']; search?: string; js?: string; transform?: string; disabled: boolean; onLoad: (preset: Preset) => void; draftOnly?: boolean };
async function request(options?: RequestInit, suffix = '') {
  const response = await fetch(`/api/presets${suffix}`, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save presets');
  return result;
}

export default function PresetControls(props: Props) {
  const [presets, setPresets] = useState<Preset[]>([]), [selected, setSelected] = useState(''), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { void request().then(setPresets).catch(e => setError(e.message)); }, []);
  const list = presets.filter(p => p.kind === props.kind), chosen = list.find(p => p.id === selected);
  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const saved: Preset = await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:props.kind,name,search:props.search,js:props.js,transform:props.transform})});
      setPresets(await request()); setSelected(saved.id); setName(saved.name); setNotice('Preset saved in local SQLite.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!chosen) return;
    setBusy(true); setError(''); setNotice('');
    try { await request({method:'DELETE'},`?id=${encodeURIComponent(chosen.id)}`); setPresets(await request()); setSelected(''); setName(''); setNotice('Preset deleted. Current rules are unchanged.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="preset-controls" aria-label={`Saved ${props.kind} presets`}>
    <div><select aria-label={`Saved ${props.kind} preset`} value={selected} disabled={busy} onChange={e => {setSelected(e.target.value);setName(list.find(p => p.id === e.target.value)?.name || '');setNotice('');}}><option value="">Choose saved {props.kind}…</option>{list.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <button className="secondary" disabled={!chosen || busy || props.disabled} onClick={() => {if (chosen) {props.onLoad(chosen);setNotice(props.draftOnly ? 'Preset loaded into editor. Save to apply.' : 'Preset loaded and applied.');}}}>{props.draftOnly ? 'Load into editor' : 'Load & apply'}</button>
      <button className="secondary" disabled={!chosen || busy} onClick={() => void remove()}>Delete preset</button>
    </div>
    <div><input aria-label={`${props.kind} preset name`} maxLength={100} placeholder="Preset name" value={name} onChange={e => setName(e.target.value)}/><button className="secondary" disabled={!name.trim() || busy} onClick={() => void save()}>{list.some(p => p.name === name.trim()) ? 'Update preset' : 'Save preset'}</button></div>
    <small>{props.kind === 'filter' ? 'Saves current text search and JavaScript draft.' : 'Saves the current transform draft.'} Reuse across connections. Saving does not apply changes.</small>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="preset-notice" role="status">{notice}</p>}
  </section>;
}
