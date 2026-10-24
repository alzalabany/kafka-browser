"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, Check, ChevronRight, Circle, Database, FileJson, Filter, GitCompareArrows, Hash, Plus, Radio, RefreshCw, Search, Settings2, Square, Star, Trash2, X } from 'lucide-react';
import type { Connection, Message } from '@/lib/types';
import { diff, parse } from '@/lib/diff';
import { appendMessage, toJsonl } from '@/lib/messages';
import { processMessages } from '@/lib/message-pipeline';

type Topic = { name: string; partitions: number };
type ViewState = { favorites?: string[]; topic?: string; search?: string; js?: string; transform?: string };
const pretty = (v: unknown) => v === undefined ? '(missing)' : JSON.stringify(v, null, 2);
async function api(url: string, options?: RequestInit) { const res = await fetch(url, options); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Request failed'); return data; }

export default function Home() {
  const [connections, setConnections] = useState<Connection[]>([]), [active, setActive] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]), [state, setState] = useState<ViewState>({}), [loaded, setLoaded] = useState(false);
  const [topicSearch, setTopicSearch] = useState(''), [onlyFavorites, setOnlyFavorites] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState('Idle'), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false), [mode, setMode] = useState('ssl'), [saving, setSaving] = useState(false);
  const [from, setFrom] = useState('latest'), [format, setFormat] = useState('json'), [jsDraft, setJsDraft] = useState(''), [showJs, setShowJs] = useState(false);
  const [timestamp, setTimestamp] = useState('');
  const [transformDraft, setTransformDraft] = useState('return value;'), [showTransform, setShowTransform] = useState(false);
  const [received, setReceived] = useState(0);
  const [paused, setPaused] = useState<{ messages: Message[]; received: number } | null>(null);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [testing, setTesting] = useState(false), [testStatus, setTestStatus] = useState('');
  const [formError, setFormError] = useState(''), [notice, setNotice] = useState('');
  const source = useRef<EventSource | null>(null), generation = useRef(0);
  const current = connections.find(c => c.id === active);
  const stop = () => { source.current?.close(); source.current = null; setStatus('Stopped'); };
  const loadTopics = async (id: string) => { const run = ++generation.current; setLoading(true); setError(''); try { const list = await api(`/api/topics?connection=${id}`); if (generation.current === run) setTopics(list); } catch (e) { if (generation.current === run) setError((e as Error).message); } finally { if (generation.current === run) setLoading(false); } };
  useEffect(() => { void (async () => { try { const [list, app] = await Promise.all([api('/api/connections'), api('/api/state?key=app')]); setConnections(list); setActive(list.some((c: Connection) => c.id === app.active) ? app.active : list[0]?.id || ''); } catch (e) { setError((e as Error).message); } })(); return () => source.current?.close(); }, []);
  useEffect(() => {
    source.current?.close(); source.current = null;
    if (!active) return;
    let cancelled = false;
    // A connection change resets the external Kafka session and its local buffer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false); setTopics([]); setMessages([]); setSelected([]); setStatus('Idle'); setPaused(null); setReceived(0);
    void api(`/api/state?key=${active}`).then(s => { if (!cancelled) { setState(s); setJsDraft(s.js || ''); setTransformDraft(s.transform || 'return value;'); setLoaded(true); } }).catch(e => setError(e.message));
    void api('/api/state', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key:'app',value:{active}})});
    void loadTopics(active);
    return () => { cancelled = true; source.current?.close(); };
  }, [active]);
  useEffect(() => { if (!loaded || !active) return; const timer = setTimeout(() => { void api('/api/state', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:active,value:state})}).catch(e => setError(e.message)); }, 350); return () => clearTimeout(timer); }, [state, active, loaded]);
  const clearMessages = () => { setMessages([]); setSelected([]); setPaused(null); setReceived(0); setNotice(''); };
  const chooseTopic = (name: string) => { stop(); setState(s => ({...s,topic:name})); clearMessages(); };
  const start = () => {
    if (!state.topic) return;
    const time = new Date(timestamp).getTime();
    if (from === 'timestamp' && (!timestamp || !Number.isFinite(time) || time < 0)) { setError('Choose a valid start date and time.'); return; }
    stop(); clearMessages(); setError(''); setStatus('Connecting');
    const params = new URLSearchParams({connection:active, topic:state.topic, from});
    if (from === 'timestamp') params.set('timestamp', String(time));
    const es = new EventSource(`/api/stream?${params}`); source.current = es;
    es.addEventListener('ready', () => setStatus('Live'));
    es.addEventListener('message', event => { const message = JSON.parse(event.data); setMessages(old => appendMessage(old, message)); setReceived(n => n + 1); });
    es.addEventListener('failure', event => { setError(JSON.parse(event.data).error); es.close(); setStatus('Error'); });
    es.onerror = () => { es.close(); setStatus('Error'); setError('Stream disconnected. Check the connection and start again.'); };
  };
  const displayed = paused?.messages ?? messages;
  const { transformed, visible, transformError, filterError } = useMemo(() => processMessages(displayed, {search:state.search,js:state.js,transform:state.transform}), [displayed,state.search,state.js,state.transform]);
  const picked = selected.map(id => transformed.find(m => m.id === id)).filter((m): m is Message => Boolean(m));
  const changes = picked.length === 2 ? diff(parse(picked[0].value), parse(picked[1].value)) : [];
  const openConnection = (connection: Connection | null = null) => { setEditing(connection); setMode(connection?.mode || 'ssl'); setFormError(''); setTestStatus(''); setModal(true); };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const isTest = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'test';
    setFormError(''); setTestStatus('');
    if (isTest) setTesting(true); else setSaving(true);
    try {
      if (isTest) {
        const result = await api('/api/connections/test', {method:'POST',body:form});
        setTestStatus(`Connected successfully · ${result.topics} topics visible. No changes saved.`);
      } else {
        const data = await api('/api/connections', {method:editing ? 'PUT' : 'POST',body:form});
        setConnections(await api('/api/connections')); setModal(false);
        if (data.id === active) { stop(); clearMessages(); void loadTopics(active); }
        else setActive(data.id);
      }
    } catch (e) {setFormError((e as Error).message);} finally {setSaving(false);setTesting(false);}
  };
  const copyValue = async () => {
    if (picked.length !== 1) return;
    try { await navigator.clipboard.writeText(format === 'json' ? pretty(parse(picked[0].value)) : picked[0].value ?? 'null'); setNotice('Message value copied.'); }
    catch { setError('Could not access the clipboard. Check browser clipboard permissions.'); }
  };
  const exportMessages = () => {
    const url = URL.createObjectURL(new Blob([toJsonl(visible)], {type:'application/x-ndjson'}));
    const link = document.createElement('a'); link.href = url;
    link.download = `${(state.topic || 'messages').replace(/[^a-zA-Z0-9._-]/g,'_')}-${new Date().toISOString().replace(/[:.]/g,'-')}.jsonl`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Exported ${visible.length} filtered messages${paused ? ' from the paused view' : ''}.`);
  };
  const remove = async () => { if (!current || !confirm(`Delete ${current.name} and its saved settings?`)) return; stop(); try { await api(`/api/connections?id=${active}`,{method:'DELETE'}); const list = await api('/api/connections'); setConnections(list); setActive(list[0]?.id || ''); setTopics([]); setMessages([]); setState({}); } catch(e) {setError((e as Error).message);} };
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-icon"><Activity size={22}/></span> kafka<span className="brand-light">browser</span><span className="dev-tag">DEV</span></Link>
      <div className="side-label">WORKSPACE <span>LOCAL</span></div>
      <div className="connection-box"><Database size={18}/><select aria-label="Connection" value={active} onChange={e => setActive(e.target.value)}><option value="" disabled>Select connection</option>{connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="icon" title="Add connection" onClick={() => openConnection()}><Plus size={17}/></button></div>
      {current && <div className="connection-meta"><span className="tiny-dot"/>{current.mode.toUpperCase()} · {current.host}:{current.port}<button className="icon" title="Edit/test connection" onClick={() => openConnection(current)}><Settings2 size={12}/></button><button className="icon" title="Delete connection" onClick={remove}><Trash2 size={12}/></button></div>}
      <div className="side-heading"><span>TOPICS <b>{topics.length}</b></span><button className="icon" title="Refresh topics" disabled={!active || loading} onClick={() => void loadTopics(active)}><RefreshCw size={14} className={loading ? 'spin' : ''}/></button></div>
      <div className="search-box"><Search size={15}/><input aria-label="Search topics" placeholder="Find a topic…" value={topicSearch} onChange={e => setTopicSearch(e.target.value)}/><kbd>⌕</kbd></div>
      <div className="topic-tabs"><button className={!onlyFavorites ? 'active' : ''} onClick={() => setOnlyFavorites(false)}>All topics</button><button className={onlyFavorites ? 'active' : ''} onClick={() => setOnlyFavorites(true)}><Star size={12}/> Favorites</button></div>
      <div className="topic-list">{topics.filter(t => t.name.toLowerCase().includes(topicSearch.toLowerCase()) && (!onlyFavorites || state.favorites?.includes(t.name))).map(t => <div key={t.name} className={`topic-row ${state.topic === t.name ? 'selected' : ''}`}><button className="topic-name" onClick={() => chooseTopic(t.name)}><Hash size={15}/><span>{t.name}</span></button><button className={`icon favorite ${state.favorites?.includes(t.name) ? 'on' : ''}`} title="Toggle favorite" onClick={() => setState(s => ({...s,favorites:s.favorites?.includes(t.name) ? s.favorites.filter(n => n !== t.name) : [...s.favorites || [],t.name]}))}><Star size={14}/></button></div>)}{!topics.length && <p className="side-empty">{loading ? 'Connecting to your cluster…' : active ? 'No topics loaded.' : 'Add a connection to explore your topics.'}</p>}</div>
      <button className="new-connection" onClick={() => openConnection()}><Plus size={16}/> Add connection</button>
      <div className="sidebar-footer"><span className="tiny-dot"/> SQLite persistence <span>v0.1</span></div>
    </aside>
    <main>
      <header className="topbar"><div>Workspace <ChevronRight size={14}/><span>{current?.name || 'Overview'}</span></div><span className="local-badge"><Circle size={7} fill="currentColor"/> Local development</span></header>
      <section className="workspace">
        <div className="page-heading"><div><div className="eyebrow">KAFKA EXPLORER</div><h1>{state.topic || 'Your events, in focus.'}</h1><p>{state.topic ? 'Inspect your stream. Find the signal.' : 'Connect a cluster and see what’s flowing through your topics.'}</p></div><span className={`status ${status === 'Live' ? 'live' : ''}`}><span className="tiny-dot"/>{status}</span></div>
        {error && <div className="error" role="alert">{error}<button className="icon" onClick={() => setError('')}><X size={15}/></button></div>}
        {!state.topic ? <div className="welcome"><div className="welcome-art"><Radio size={38}/><span className="orbit one"/><span className="orbit two"/></div><span className="eyebrow">A CLEAR VIEW INTO YOUR CLUSTER</span><h2>Small tool. Live insights.</h2><p>Browse topics, follow messages as they arrive,<br/>and compare exactly what changed.</p><button className="primary" onClick={() => active ? void loadTopics(active) : openConnection()}>{active ? 'Refresh topics' : 'Add your first connection'}<ArrowRight size={16}/></button><div className="feature-strip"><span><Database size={16}/> Saved locally</span><span><Filter size={16}/> JavaScript filters</span><span><GitCompareArrows size={16}/> Message diffs</span></div></div> : <>
          <div className="stream-bar"><div className="section-title"><Radio size={17}/><b>Message stream</b><span className="count">{messages.length}</span></div><div className="stream-actions"><select aria-label="Start position" value={from} disabled={status === 'Live' || status === 'Connecting'} onChange={e => setFrom(e.target.value)}><option value="latest">From latest</option><option value="beginning">From beginning</option><option value="timestamp">From timestamp</option></select>{from === 'timestamp' && <input className="timestamp-input" aria-label="Start timestamp (local time)" title="Start timestamp in your local timezone" type="datetime-local" step="1" value={timestamp} disabled={status === 'Live' || status === 'Connecting'} onChange={e => setTimestamp(e.target.value)}/>}{status === 'Live' || status === 'Connecting' ? <button className="stop" onClick={stop}><Square size={12} fill="currentColor"/> Stop streaming</button> : <button className="primary" onClick={start}><Radio size={14}/> Start streaming</button>}</div></div>
          <div className="filter-bar"><div className="search-box"><Search size={16}/><input aria-label="Filter messages" placeholder="Filter by value, key, partition, or offset…" value={state.search || ''} onChange={e => setState(s => ({...s,search:e.target.value}))}/></div><button className={`secondary ${state.js ? 'enabled' : ''}`} onClick={() => setShowJs(!showJs)}><span className="js-icon">JS</span> JavaScript filter {state.js && <span className="tiny-dot"/>}</button><button className="icon" title="Clear messages" onClick={clearMessages}><Trash2 size={16}/></button></div>
          <div className="message-tools"><div><button className="secondary" disabled={!messages.length && !paused} onClick={() => setPaused(p => p ? null : {messages:[...messages],received})}>{paused ? 'Resume view' : 'Pause view'}</button>{paused && <span className="muted">View paused · {received - paused.received} received since pause · latest 1,000 retained</span>}</div><div><button className="secondary" disabled={picked.length !== 1} onClick={() => void copyValue()}>Copy value</button><button className="secondary" disabled={!visible.length} onClick={exportMessages}>Export JSONL ({visible.length})</button></div></div>
          {notice && <p className="action-notice" role="status">{notice}</p>}
          {showJs && <div className="js-panel"><label>Filter expression <span>value = parsed JSON or string · message = metadata</span></label><div><input aria-label="JavaScript expression" value={jsDraft} onChange={e => setJsDraft(e.target.value)} placeholder={'value.type === "order.created"'}/><button className="primary" onClick={() => setState(s => ({...s,js:jsDraft}))}>Apply</button><button className="secondary" onClick={() => {setJsDraft('');setState(s => ({...s,js:''}));}}>Reset</button></div><small>Runs locally in your browser. Use trusted expressions; return true to show a message.</small></div>}
          {filterError && <div className="error">Filter error: {filterError}</div>}
          <div className="messages-layout"><section className="messages"><div className="table-header"><span>MESSAGE</span><span>PARTITION / OFFSET</span><span>TIME</span></div><div className="message-list">{visible.map(m => <button key={m.id} className={`message-row ${selected.includes(m.id) ? 'picked' : ''}`} onClick={() => setSelected(s => s.includes(m.id) ? s.filter(id => id !== m.id) : [...s.slice(-1),m.id])}><span className="message-preview"><span className="checkbox">{selected.includes(m.id) && <Check size={11}/>}</span><FileJson size={16}/><span><b>{m.key || (m.value === null ? 'Tombstone' : 'Message')}</b><code>{m.value ?? 'null'}</code></span></span><span className="mono">{m.partition} <span className="muted">/ {m.offset}</span></span><span className="mono muted">{new Date(Number(m.timestamp)).toLocaleTimeString()}</span></button>)}{!visible.length && <div className="empty-messages"><Radio size={29}/><h3>{displayed.length ? 'No matching messages' : 'Ready when you are'}</h3><p>{displayed.length ? 'Adjust your filters to see more of the stream.' : 'Start streaming to see incoming messages here.'}</p></div>}</div><div className="table-footer"><span>{visible.length} shown{paused ? ' (paused)' : ''} · {messages.length} buffered <span className="muted">/ 1,000 max</span></span><span>Select 2 messages to compare</span></div></section>
          <section className="inspector"><div className="inspector-heading"><b>{picked.length === 2 ? 'Message delta' : 'Message inspector'}</b><div className="format-toggle"><button className={format === 'json' ? 'active' : ''} onClick={() => setFormat('json')}>JSON</button><button className={format === 'raw' ? 'active' : ''} onClick={() => setFormat('raw')}>Raw</button></div></div>{picked.length === 0 ? <div className="inspector-empty"><Settings2 size={25}/><h3>A closer look</h3><p>Select a message to inspect its value,<br/>headers, and metadata.</p></div> : picked.length === 2 ? <div className="detail"><div className="detail-label">FIRST SELECTED → SECOND SELECTED</div><p className="mono muted">{picked[0].id} → {picked[1].id}</p>{!changes.length && <p className="success">Values are identical.</p>}{changes.map((c,i) => <div className="change" key={i}><b>{c.path}</b><span className="change-kind">{c.kind}</span><pre className="removed">− {pretty(c.before)}</pre><pre className="added">+ {pretty(c.after)}</pre></div>)}</div> : <div className="detail"><div className="metadata"><span>Partition <b>{picked[0].partition}</b></span><span>Offset <b>{picked[0].offset}</b></span><span>Key <b>{picked[0].key ?? 'null'}</b></span><span>Timestamp <b>{new Date(Number(picked[0].timestamp)).toLocaleString()}</b></span></div><div className="detail-label">VALUE</div><pre>{format === 'json' ? pretty(parse(picked[0].value)) : picked[0].value ?? 'null'}</pre><div className="detail-label">HEADERS</div><pre>{pretty(picked[0].headers)}</pre></div>}</section></div>
        </>}
        <footer className="workspace-footer"><span><span className="tiny-dot"/> Your workspace, on your machine.</span><span>Built for the moments between deployments.</span></footer>
      </section>
    </main>
    {modal && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="connection-title"><div className="modal-title"><div><span className="eyebrow">{editing ? 'EDIT CONNECTION' : 'NEW CONNECTION'}</span><h2 id="connection-title">{editing ? 'Update your cluster' : 'Connect your cluster'}</h2></div><button className="icon" aria-label="Close" disabled={saving || testing} onClick={() => setModal(false)}><X size={19}/></button></div><p className="muted">Credentials and settings are stored in local SQLite.</p><form key={editing?.id || 'new'} onSubmit={save} onChange={() => setTestStatus('')}><fieldset disabled={saving || testing}><input type="hidden" name="id" value={editing?.id || ''}/><label>Connection name<input name="name" placeholder="e.g. Development cluster" defaultValue={editing?.name || ''} required/></label><div className="mode-toggle"><button type="button" className={mode === 'ssl' ? 'active' : ''} onClick={() => setMode('ssl')}>SSL · Certificate</button><button type="button" className={mode === 'sasl' ? 'active' : ''} onClick={() => setMode('sasl')}>SASL · Password</button></div><input type="hidden" name="mode" value={mode}/><label>Service URI <span>optional, overrides host and port</span><input name="uri" placeholder="db-kafka.example.com:25062"/></label><div className="form-grid"><label>Host<input name="host" placeholder="db-kafka.example.com" defaultValue={editing?.host || ''}/></label><label>Port<input name="port" type="number" min="1" max="65535" defaultValue={editing?.mode === mode ? editing.port : mode === 'ssl' ? 25062 : 25073} key={mode}/></label></div>{mode === 'ssl' ? <div className="form-grid"><label>Access key<input name="key" type="file" required={editing?.mode !== mode}/></label><label>Access certificate<input name="cert" type="file" required={editing?.mode !== mode}/></label></div> : <><div className="form-grid"><label>Username<input name="username" placeholder="doadmin" defaultValue={editing?.username || ''} required autoComplete="off"/></label><label>Password<input name="password" type="password" required={editing?.mode !== mode} placeholder={editing?.mode === mode ? 'Leave blank to keep saved password' : ''} autoComplete="new-password"/></label></div><label>SASL mechanism<select name="mechanism" defaultValue={editing?.mechanism || 'plain'}><option value="plain">PLAIN</option><option value="scram-sha-256">SCRAM-SHA-256</option><option value="scram-sha-512">SCRAM-SHA-512</option></select></label></>}<label>CA certificate {mode === 'ssl' && <span>optional · system trust by default</span>}<input name="ca" type="file" required={mode === 'sasl' && editing?.mode !== mode}/></label>{editing?.mode === mode && <p className="saved-secret-note">Leave password and certificate uploads empty to keep saved credentials.</p>}{editing?.mode === 'ssl' && mode === 'ssl' && <label className="clear-ca"><input type="checkbox" name="clearCa"/> Remove saved CA and use system trust</label>}{formError && <div className="error" role="alert">{formError}</div>}{testStatus && <p className="test-success" role="status">{testStatus}</p>}<div className="modal-footer"><span>PEM certificate files · TLS verified</span><div className="modal-actions"><button className="secondary" type="submit" name="action" value="test" disabled={saving || testing}>{testing ? 'Testing…' : 'Test connection'}</button><button className="primary" type="submit" name="action" value="save" disabled={saving || testing}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save & connect'}<ArrowRight size={15}/></button></div></div></fieldset></form></section></div>}
  </div>;
}

