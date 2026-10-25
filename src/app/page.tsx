"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import RulesSidebar from './rules-sidebar';
import TableSettings from './table-settings';
import {DEFAULT_TABLE,fieldValue,cellText,tableTime,type TableView} from '@/lib/table-view';
import { Activity, ArrowRight, Check, Database, FileJson, Filter, GitCompareArrows, Hash, Plus, Radio, RefreshCw, Search, Settings2, Square, Star, Trash2, X } from 'lucide-react';
import type { Connection, Message } from '@/lib/types';
import { diff, parse } from '@/lib/diff';
import { appendMessage, toJsonl } from '@/lib/messages';
import { compileMessageRules, processMessages } from '@/lib/message-pipeline';
import type { Preset } from '@/lib/presets';
import { selectedRules, ruleScope, type TopicRules, type RuleSelection } from '@/lib/rule-selection';
import { SidebarAccount, useHostedWorkspace } from './auth-gate';

type Topic = { name: string; partitions: number };
type ViewState = { favorites?: string[]; topic?: string; allTopics?: boolean; topicRules?:TopicRules; tableViews?:Record<string,TableView> };
const NONE: RuleSelection = {transformId:null,filterIds:[]};
const pretty = (v: unknown) => v === undefined ? '(missing)' : JSON.stringify(v, null, 2);
async function api(url: string, options?: RequestInit) { const res = await fetch(url, options); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Request failed'); return data; }

export default function Home() {
  const hosted = useHostedWorkspace();
  const [viewScope,setViewScope]=useState<'personal'|'company'>('personal');
  const [connections, setConnections] = useState<Connection[]>([]), [active, setActive] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]), [state, setState] = useState<ViewState>({}), [loaded, setLoaded] = useState(false);
  const [topicSearch, setTopicSearch] = useState(''), [onlyFavorites, setOnlyFavorites] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState('Idle'), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false), [mode, setMode] = useState('ssl'), [saving, setSaving] = useState(false);
  const [from, setFrom] = useState('latest'), [format, setFormat] = useState('json');
  const [timestamp, setTimestamp] = useState('');
  const [tailCount, setTailCount] = useState('10');
  const [received, setReceived] = useState(0);
  const [paused, setPaused] = useState<{ messages: Message[]; received: number } | null>(null);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [testing, setTesting] = useState(false), [testStatus, setTestStatus] = useState('');
  const [formError, setFormError] = useState(''), [notice, setNotice] = useState('');
  const source = useRef<EventSource | null>(null), generation = useRef(0);
  const [presets,setPresets]=useState<Preset[]>([]),[presetsLoaded,setPresetsLoaded]=useState(false);
  const stateWrites=useRef<Promise<unknown>>(Promise.resolve());
  const persistView = useCallback((key:string,value:ViewState) => {
    stateWrites.current=stateWrites.current.catch(()=>{}).then(()=>api('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,value,scope:viewScope}),keepalive:true}));
    void stateWrites.current.catch(e=>setError((e as Error).message));
  },[viewScope]);
  const current = connections.find(c => c.id === active);
  const scope=ruleScope(state.topic,state.allTopics);
  const selection=state.topicRules?.[scope] || NONE;
  const tableView=state.tableViews?.[scope] || DEFAULT_TABLE;
  const tableGrid=tableView.columns.length?{gridTemplateColumns:`minmax(230px,1fr) 110px 130px ${tableView.columns.map(()=>'160px').join(' ')}`} : undefined;
  const saveTable=(view:TableView)=>{const next={...state,tableViews:{...state.tableViews,[scope]:view}};setState(next);persistView(active,next);};
  const availablePresets=useMemo(()=>viewScope==='company'?presets.filter(p=>p.scope==='company'):presets,[presets,viewScope]);
  const rules=useMemo(()=>selectedRules(availablePresets,selection),[availablePresets,selection]);
  const transformActive=Boolean(rules.transform?.trim());
  const searchingAll = Boolean(state.allTopics && (status === 'Live' || status === 'Connecting'));
  const stop = () => { source.current?.close(); source.current = null; setStatus('Stopped'); };
  const loadTopics = async (id: string) => { const run = ++generation.current; setLoading(true); setError(''); try { const list = await api(`/api/topics?connection=${id}`); if (generation.current === run) setTopics(list); } catch (e) { if (generation.current === run) setError((e as Error).message); } finally { if (generation.current === run) setLoading(false); } };
  useEffect(()=>{void api('/api/presets').then(list=>{setPresets(list);setPresetsLoaded(true);}).catch(e=>setError(e.message));},[]);
  useEffect(() => { void (async () => { try { const [list, app] = await Promise.all([api('/api/connections'), api('/api/state?key=app')]); setConnections(list); setActive(list.some((c: Connection) => c.id === app.active) ? app.active : list[0]?.id || ''); } catch (e) { setError((e as Error).message); } })(); return () => source.current?.close(); }, []);
  useEffect(() => {
    source.current?.close(); source.current = null;
    if (!active) return;
    let cancelled = false;
    // A connection change resets the external Kafka session and its local buffer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false); setTopics([]); setMessages([]); setSelected([]); setStatus('Idle'); setPaused(null); setReceived(0);
    void api(`/api/state?key=${active}&scope=${viewScope}`).then(s => { if (!cancelled) { setState(s); setLoaded(true); } }).catch(e => setError(e.message));
    void api('/api/state', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key:'app',value:{active}})});
    void loadTopics(active);
    return () => { cancelled = true; source.current?.close(); };
  }, [active,viewScope]);
  useEffect(() => { if (!loaded || !active) return; const timer=setTimeout(()=>persistView(active,state),350);return()=>clearTimeout(timer);
  },[state,active,loaded,viewScope,persistView]);
  const changeSelection=(nextSelection:RuleSelection)=>{
    const next={...state,topicRules:{...state.topicRules,[scope]:nextSelection}};
    setState(next);persistView(active,next);
  };
  const clearMessages = () => { setMessages([]); setSelected([]); setPaused(null); setReceived(0); setNotice(''); };
  const chooseTopic = (name: string) => { stop(); const next={...state,topic:name,allTopics:false};setState(next);persistView(active,next);clearMessages(); };
  const chooseAllTopics = () => { stop(); const next={...state,allTopics:true};setState(next);persistView(active,next);setFrom('beginning');clearMessages(); };
  const start = () => {
    if (!loaded || !presetsLoaded || (!state.topic && !state.allTopics)) return;
    const processIncoming = compileMessageRules(rules);
    const validation = processIncoming([]);
    if (validation.transformError || validation.filterError) { setError(validation.transformError || validation.filterError); return; }
    const time = new Date(timestamp).getTime();
    if (from === 'timestamp' && (!timestamp || !Number.isFinite(time) || time < 0)) { setError('Choose a valid start date and time.'); return; }
    if (from === 'tail' && (!Number.isInteger(Number(tailCount)) || Number(tailCount) < 1 || Number(tailCount) > 1000)) { setError('Choose a last-message count between 1 and 1,000.'); return; }
    stop(); clearMessages(); setError(''); setStatus('Connecting');
    const params = new URLSearchParams({connection:active, from});
    if (state.allTopics) params.set('scope','all'); else params.set('topic',state.topic!);
    if (from === 'timestamp') params.set('timestamp', String(time));
    if (from === 'tail') params.set('count', tailCount);
    const es = new EventSource(`/api/stream?${params}`); source.current = es;
    es.addEventListener('ready', () => setStatus('Live'));
    es.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      setReceived(n => n + 1);
      if (state.allTopics) {
        const result = processIncoming([message]);
        if (result.transformError || result.filterError) setError(result.transformError || result.filterError);
        if (!result.visible.length) return;
      }
      setMessages(old => appendMessage(old, message));
    });
    es.addEventListener('failure', event => { setError(JSON.parse(event.data).error); es.close(); setStatus('Error'); });
    es.onerror = () => { es.close(); setStatus('Error'); setError('Stream disconnected. Check the connection and start again.'); };
  };
  const displayed = paused?.messages ?? messages;
  const { transformed, visible, transformError, filterError } = useMemo(() => processMessages(displayed,rules),[displayed,rules]);
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
    link.download = `${(state.allTopics ? 'all-topics' : state.topic || 'messages').replace(/[^a-zA-Z0-9._-]/g,'_')}-${new Date().toISOString().replace(/[:.]/g,'-')}.jsonl`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Exported ${visible.length} filtered messages${paused ? ' from the paused view' : ''}.`);
  };
  const remove = async () => { if (!current || !confirm(`Delete ${current.name} and its saved settings?`)) return; stop(); try { await api(`/api/connections?id=${active}`,{method:'DELETE'}); const list = await api('/api/connections'); setConnections(list); setActive(list[0]?.id || ''); setTopics([]); setMessages([]); setState({}); } catch(e) {setError((e as Error).message);} };
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-icon"><Activity size={22}/></span> kafka<span className="brand-light">browser</span><span className="dev-tag">DEV</span></Link>
      <div className="side-label">WORKSPACE <span>{hosted?'COMPANY':'LOCAL'}</span></div>
      {hosted&&<label className="sharing-choice">Favorites, rule selections & table layouts<select aria-label="View settings sharing" value={viewScope} onChange={e=>setViewScope(e.target.value as 'personal'|'company')}><option value="personal">Personal settings</option><option value="company">Company settings (shared)</option></select><small>{viewScope==='company'?'Changes apply to everyone using company settings. Only company rules can be selected.':'Private to your account. Company connections remain shared.'}</small></label>}
      <div className="connection-box"><Database size={18}/><select aria-label="Connection" value={active} onChange={e => setActive(e.target.value)}><option value="" disabled>Select connection</option>{connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="icon" title="Add connection" onClick={() => openConnection()}><Plus size={17}/></button></div>
      {current && <div className="connection-meta"><span className="tiny-dot"/>{current.mode.toUpperCase()} · {current.host}:{current.port}<button className="icon" title="Edit/test connection" onClick={() => openConnection(current)}><Settings2 size={12}/></button><button className="icon" title="Delete connection" onClick={remove}><Trash2 size={12}/></button></div>}
      <div className="side-heading"><span>TOPICS <b>{topics.length}</b></span><button className="icon" title="Refresh topics" disabled={!active || loading} onClick={() => void loadTopics(active)}><RefreshCw size={14} className={loading ? 'spin' : ''}/></button></div>
      <div className="search-box"><Search size={15}/><input aria-label="Search topics" placeholder="Find a topic…" value={topicSearch} onChange={e => setTopicSearch(e.target.value)}/><kbd>⌕</kbd></div>
      <div className="topic-tabs"><button className={!onlyFavorites ? 'active' : ''} onClick={() => setOnlyFavorites(false)}>All topics</button><button className={onlyFavorites ? 'active' : ''} onClick={() => setOnlyFavorites(true)}><Star size={12}/> Favorites</button></div>
      <button className={`all-topic-search ${state.allTopics ? 'active' : ''}`} disabled={!active || !loaded} onClick={chooseAllTopics}><Search size={15}/> Search all topics</button><div className="topic-list">{topics.filter(t => t.name.toLowerCase().includes(topicSearch.toLowerCase()) && (!onlyFavorites || state.favorites?.includes(t.name))).map(t => <div key={t.name} className={`topic-row ${!state.allTopics && state.topic === t.name ? 'selected' : ''}`}><button className="topic-name" onClick={() => chooseTopic(t.name)}><Hash size={15}/><span>{t.name}</span></button><button className={`icon favorite ${state.favorites?.includes(t.name) ? 'on' : ''}`} title="Toggle favorite" onClick={() => setState(s => ({...s,favorites:s.favorites?.includes(t.name) ? s.favorites.filter(n => n !== t.name) : [...s.favorites || [],t.name]}))}><Star size={14}/></button></div>)}{!topics.length && <p className="side-empty">{loading ? 'Connecting to your cluster…' : active ? 'No topics loaded.' : 'Add a connection to explore your topics.'}</p>}</div>
      <button className="new-connection" onClick={() => openConnection()}><Plus size={16}/> Add connection</button>
      {hosted?<SidebarAccount/>:<div className="sidebar-footer"><span className="tiny-dot"/> SQLite persistence <span>v0.1</span></div>}
    </aside>
    <main>
      <section className="workspace">
        <div className="page-heading"><div><div className="eyebrow">KAFKA EXPLORER</div><h1>{state.allTopics ? 'Search all topics' : state.topic || 'Your events, in focus.'}</h1><p>{state.allTopics ? 'Find matching messages across your cluster.' : state.topic ? 'Inspect your stream. Find the signal.' : 'Connect a cluster and see what’s flowing through your topics.'}</p></div><span className={`status ${status === 'Live' ? 'live' : ''}`}><span className="tiny-dot"/>{status}</span></div>
        {error && <div className="error" role="alert">{error}<button className="icon" onClick={() => setError('')}><X size={15}/></button></div>}
        {!state.topic && !state.allTopics ? <div className="welcome"><div className="welcome-art"><Radio size={38}/><span className="orbit one"/><span className="orbit two"/></div><span className="eyebrow">A CLEAR VIEW INTO YOUR CLUSTER</span><h2>Small tool. Live insights.</h2><p>Browse topics, follow messages as they arrive,<br/>and compare exactly what changed.</p><button className="primary" onClick={() => active ? void loadTopics(active) : openConnection()}>{active ? 'Refresh topics' : 'Add your first connection'}<ArrowRight size={16}/></button><div className="feature-strip"><span><Database size={16}/> Saved locally</span><span><Filter size={16}/> JavaScript filters</span><span><GitCompareArrows size={16}/> Message diffs</span></div></div> : <>
          <div className="stream-bar"><div className="section-title"><Radio size={17}/><b>{state.allTopics ? 'Cross-topic search' : 'Message stream'}</b><span className="count">{messages.length}</span></div><div className="stream-actions"><select aria-label="Start position" value={from} disabled={status === 'Live' || status === 'Connecting'} onChange={e => setFrom(e.target.value)}><option value="latest">From latest</option><option value="beginning">From beginning</option><option value="timestamp">From timestamp</option><option value="tail">Last N per partition</option></select>{from === 'tail' && <input className="timestamp-input" aria-label="Last messages per partition" title="Replay up to N retained offsets per partition, then follow live. Compacted topics may have fewer messages." type="number" min="1" max="1000" step="1" value={tailCount} disabled={status === 'Live' || status === 'Connecting'} onChange={e => setTailCount(e.target.value)}/>}{from === 'timestamp' && <input className="timestamp-input" aria-label="Start timestamp (local time)" title="Start timestamp in your local timezone" type="datetime-local" step="1" value={timestamp} disabled={status === 'Live' || status === 'Connecting'} onChange={e => setTimestamp(e.target.value)}/>}{status === 'Live' || status === 'Connecting' ? <button className="stop" onClick={stop}><Square size={12} fill="currentColor"/> {state.allTopics ? 'Stop search' : 'Stop streaming'}</button> : <button className="primary" onClick={start}><Radio size={14}/> {state.allTopics ? 'Start search' : 'Start streaming'}</button>}</div></div>
          {from === 'tail' && <div className="all-search-info"><span>Replays the last {tailCount} offsets from each partition, then follows new messages. Multi-partition topics can show more than {tailCount} messages; compacted topics can show fewer. Filters apply after replay.</span></div>}
          {state.allTopics && <details className="all-search-info scan-help"><summary>{received.toLocaleString()} messages scanned · {messages.length.toLocaleString()} matches buffered</summary><span>Searches all accessible application topics (excluding __ internal topics). Choose “From beginning” to scan retained history, or a timestamp to narrow the scan. Keeps the latest 1,000 matches and continues watching new messages. Stop to change filters or transforms, then start a fresh search. Newly created topics are included on restart.</span></details>}
          <div className="message-tools"><div><TableSettings key={`${active}:${scope}`} view={tableView} disabled={!active||!loaded} onSave={saveTable}/><button className="secondary" disabled={!messages.length && !paused} onClick={() => setPaused(p => p ? null : {messages:[...messages],received})}>{paused ? 'Resume view' : 'Pause view'}</button>{paused && <span className="muted">View paused · {received - paused.received} received since pause · latest 1,000 retained</span>}</div><div><button className="icon" title="Clear messages" onClick={clearMessages}><Trash2 size={15}/></button><button className="secondary" disabled={picked.length !== 1} onClick={() => void copyValue()}>Copy value</button><button className="secondary" disabled={!visible.length} onClick={exportMessages}>Export JSONL ({visible.length})</button></div></div>
          {notice && <p className="action-notice" role="status">{notice}</p>}
          {transformError && <div className="error" role="alert">Transform error: {transformError}</div>}
          {filterError && <div className="error">Filter error: {filterError}</div>}
          <div className={`messages-layout ${picked.length ? 'has-selection' : ''}`}><section className="messages"><div className="message-table-scroll"><div className="message-table-content" style={tableView.columns.length?{minWidth:500+tableView.columns.length*160}:undefined}><div className="table-header" style={tableGrid}><span>MESSAGE</span><span>PARTITION / OFFSET</span><span title={tableView.timePath}>TIME</span>{tableView.columns.map(c=><span key={c.id} title={c.path}>{c.label}</span>)}</div><div className="message-list">{visible.map(m => <button key={m.id} className={`message-row ${selected.includes(m.id) ? 'picked' : ''}`} style={tableGrid} onClick={() => setSelected(s => s.includes(m.id) ? s.filter(id => id !== m.id) : [...s.slice(-1),m.id])}><span className="message-preview"><span className="checkbox">{selected.includes(m.id) && <Check size={11}/>}</span><FileJson size={16}/><span><b>{m.key || (m.value === null ? 'Tombstone' : 'Message')}</b>{state.allTopics && <small className="source-topic" title={m.topic}>{m.topic}</small>}<code>{m.value ?? 'null'}</code></span></span><span className="mono">{m.partition} <span className="muted">/ {m.offset}</span></span><span className="mono muted" title={tableTime(m,tableView).title}>{tableTime(m,tableView).text}</span>{tableView.columns.map(c=>{const text=cellText(fieldValue(m,c.path));return <span className="custom-cell mono" key={c.id} title={text}>{text}</span>;})}</button>)}{!visible.length && <div className="empty-messages"><Radio size={29}/><h3>{displayed.length ? 'No matching messages' : state.allTopics && received ? 'No matches yet' : 'Ready when you are'}</h3><p>{displayed.length ? 'Adjust your filters to see more of the stream.' : state.allTopics ? searchingAll ? 'Scanning across topics. Matches will appear here.' : 'Enter a search or JavaScript filter, then start searching.' : 'Start streaming to see incoming messages here.'}</p></div>}</div></div></div><div className="table-footer"><span>{visible.length} shown{paused ? ' (paused)' : ''} · {messages.length} buffered <span className="muted">/ 1,000 max</span></span><span>Select 2 messages to compare</span></div></section>
          <section className="inspector"><div className="inspector-heading"><b>{picked.length === 2 ? 'Message delta' : 'Message inspector'}</b><div className="format-toggle"><button className={format === 'json' ? 'active' : ''} onClick={() => setFormat('json')}>JSON</button><button className={format === 'raw' ? 'active' : ''} onClick={() => setFormat('raw')}>Raw</button></div></div>{picked.length === 0 ? <div className="inspector-empty"><Settings2 size={25}/><h3>A closer look</h3><p>Select a message to inspect its value,<br/>headers, and metadata.</p></div> : picked.length === 2 ? <div className="detail"><div className="detail-label">FIRST SELECTED → SECOND SELECTED</div><p className="mono muted">{picked[0].id} → {picked[1].id}</p>{!changes.length && <p className="success">Values are identical.</p>}{changes.map((c,i) => <div className="change" key={i}><b>{c.path}</b><span className="change-kind">{c.kind}</span><pre className="removed">− {pretty(c.before)}</pre><pre className="added">+ {pretty(c.after)}</pre></div>)}</div> : <div className="detail"><div className="metadata"><span>Topic <b>{picked[0].topic}</b></span><span>Partition <b>{picked[0].partition}</b></span><span>Offset <b>{picked[0].offset}</b></span><span>Key <b>{picked[0].key ?? 'null'}</b></span><span>Timestamp <b>{new Date(Number(picked[0].timestamp)).toLocaleString()}</b></span></div><div className="detail-label">{transformActive ? 'TRANSFORMED VALUE' : 'VALUE'}</div><pre>{format === 'json' ? pretty(parse(picked[0].value)) : picked[0].value ?? 'null'}</pre>{transformActive && <details className="original-value"><summary>Original Kafka value</summary><pre>{displayed.find(m => m.id === picked[0].id)?.value ?? 'null'}</pre></details>}<div className="detail-label">HEADERS</div><pre>{pretty(picked[0].headers)}</pre></div>}</section></div>
        </>}
        <footer className="workspace-footer"><span><span className="tiny-dot"/> Your workspace, on your machine.</span><span>Built for the moments between deployments.</span></footer>
      </section>
    </main>
    <RulesSidebar key={`${active}:${scope}:${viewScope}`} presets={availablePresets} defaultScope={viewScope} selection={selection} disabled={!active || !loaded || !presetsLoaded || (!state.topic && !state.allTopics)} locked={searchingAll} scopeLabel={`${current?.name || 'Connection'} · ${state.allTopics ? 'All topics' : state.topic || 'Select a topic'}`} onChange={changeSelection} onPresets={setPresets}/>
    {modal && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="connection-title"><div className="modal-title"><div><span className="eyebrow">{editing ? 'EDIT CONNECTION' : 'NEW CONNECTION'}</span><h2 id="connection-title">{editing ? 'Update your cluster' : 'Connect your cluster'}</h2></div><button className="icon" aria-label="Close" disabled={saving || testing} onClick={() => setModal(false)}><X size={19}/></button></div><p className="muted">Credentials and settings are stored in local SQLite.</p><form key={editing?.id || 'new'} onSubmit={save} onChange={() => setTestStatus('')}><fieldset disabled={saving || testing}><input type="hidden" name="id" value={editing?.id || ''}/><label>Connection name<input name="name" placeholder="e.g. Development cluster" defaultValue={editing?.name || ''} required/></label><div className="mode-toggle"><button type="button" className={mode === 'ssl' ? 'active' : ''} onClick={() => setMode('ssl')}>SSL · Certificate</button><button type="button" className={mode === 'sasl' ? 'active' : ''} onClick={() => setMode('sasl')}>SASL · Password</button></div><input type="hidden" name="mode" value={mode}/><label>Service URI <span>optional, overrides host and port</span><input name="uri" placeholder="db-kafka.example.com:25062"/></label><div className="form-grid"><label>Host<input name="host" placeholder="db-kafka.example.com" defaultValue={editing?.host || ''}/></label><label>Port<input name="port" type="number" min="1" max="65535" defaultValue={editing?.mode === mode ? editing.port : mode === 'ssl' ? 25062 : 25073} key={mode}/></label></div>{mode === 'ssl' ? <div className="form-grid"><label>Access key<input name="key" type="file" required={editing?.mode !== mode}/></label><label>Access certificate<input name="cert" type="file" required={editing?.mode !== mode}/></label></div> : <><div className="form-grid"><label>Username<input name="username" placeholder="doadmin" defaultValue={editing?.username || ''} required autoComplete="off"/></label><label>Password<input name="password" type="password" required={editing?.mode !== mode} placeholder={editing?.mode === mode ? 'Leave blank to keep saved password' : ''} autoComplete="new-password"/></label></div><label>SASL mechanism<select name="mechanism" defaultValue={editing?.mechanism || 'plain'}><option value="plain">PLAIN</option><option value="scram-sha-256">SCRAM-SHA-256</option><option value="scram-sha-512">SCRAM-SHA-512</option></select></label></>}<label>CA certificate {mode === 'ssl' && <span>optional · system trust by default</span>}<input name="ca" type="file" required={mode === 'sasl' && editing?.mode !== mode}/></label>{editing?.mode === mode && <p className="saved-secret-note">Leave password and certificate uploads empty to keep saved credentials.</p>}{editing?.mode === 'ssl' && mode === 'ssl' && <label className="clear-ca"><input type="checkbox" name="clearCa"/> Remove saved CA and use system trust</label>}{formError && <div className="error" role="alert">{formError}</div>}{testStatus && <p className="test-success" role="status">{testStatus}</p>}<div className="modal-footer"><span>PEM certificate files · TLS verified</span><div className="modal-actions"><button className="secondary" type="submit" name="action" value="test" disabled={saving || testing}>{testing ? 'Testing…' : 'Test connection'}</button><button className="primary" type="submit" name="action" value="save" disabled={saving || testing}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save & connect'}<ArrowRight size={15}/></button></div></div></fieldset></form></section></div>}
  </div>;
}

