"use client";

import { useEffect, useRef, useState } from 'react';
import { Filter, Plus, Settings2, X, Braces } from 'lucide-react';
import { compileMessageRules } from '@/lib/message-pipeline';
import type { Preset } from '@/lib/presets';
import type { RuleSelection } from '@/lib/rule-selection';
import { useHostedWorkspace } from './auth-gate';

type Editor = {kind:'filter'|'transform';name:string;search:string;js:string;transform:string;id?:string;scope?:'personal'|'company'};
type Props = {presets:Preset[]; defaultScope?:'personal'|'company'; selection:RuleSelection; disabled:boolean; locked:boolean; scopeLabel:string; onChange:(selection:RuleSelection)=>void; onPresets:(presets:Preset[])=>void};
async function api(options?:RequestInit,suffix='') {
  const response=await fetch(`/api/presets${suffix}`,options);const result=await response.json();
  if(!response.ok)throw new Error(result.error || 'Could not save rule');return result;
}
export default function RulesSidebar({presets,defaultScope='personal',selection,disabled,locked,scopeLabel,onChange,onPresets}: Props) {
  const hosted=useHostedWorkspace();
  const [editor,setEditor]=useState<Editor|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const dialog=useRef<HTMLDivElement>(null);const editorOpen=editor!==null;
  const transformers=presets.filter(p=>p.kind==='transform'),filters=presets.filter(p=>p.kind==='filter');
  const selectedTransform=transformers.some(p=>p.id===selection.transformId)?selection.transformId:null;
  const open=(kind:Editor['kind'],preset?:Preset)=>{setError('');setEditor(preset?{...preset}:{kind,name:'',search:'',js:'',transform:'return value;',...(hosted?{scope:defaultScope}:{})});};
  useEffect(()=>{
    if(!editorOpen)return;const before=document.activeElement as HTMLElement|null;const element=dialog.current;
    element?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setEditor(null);}
      if(event.key!=='Tab'||!element)return;
      const items=Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)'));
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',keydown);return()=>{document.removeEventListener('keydown',keydown);before?.focus();};
  },[editorOpen]);
  const save=async()=>{
    if(!editor||locked||disabled)return;setError('');
    const validation=compileMessageRules(editor.kind==='filter'?{search:editor.search,js:editor.js}:{transform:editor.transform})([]);
    if(validation.transformError||validation.filterError){setError(validation.transformError||validation.filterError);return;}
    setBusy(true);
    try{await api({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(editor)});onPresets(await api());setEditor(null);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const remove=async()=>{
    if(!editor?.id||locked||disabled)return;setBusy(true);setError('');
    try{await api({method:'DELETE'},`?id=${encodeURIComponent(editor.id)}&scope=${editor.id.startsWith('company_')?'company':'personal'}`);onPresets(await api());setEditor(null);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <>
    <aside className="rules-sidebar" aria-label="Filters and transforms">
      <div className="rules-header"><span className="eyebrow">MESSAGE PROCESSING</span><h2>Filters & transforms</h2><p className="scope-label" title={scopeLabel}>{scopeLabel}</p></div>
      <div className="pipeline-order"><span>1 Transform</span><span>→</span><span>2 Filters</span><span>→</span><span>View</span></div>
      <section className="rule-card"><div className="rule-list-header"><Braces size={16}/><h3>Transformer</h3><button className="icon" aria-label="Add transformer" disabled={disabled||locked} onClick={()=>open('transform')}><Plus size={15}/></button></div><p className="rule-list-help">Choose one, or none.</p>
        <label className="saved-rule-row"><input type="radio" name="transformer" aria-label="No transformer" checked={!selectedTransform} disabled={disabled||locked} onChange={()=>onChange({...selection,transformId:null})}/><span>None</span></label>
        {transformers.map(p=><div className="saved-rule-row" key={p.id}><label><input type="radio" name="transformer" aria-label={`Transformer: ${p.name}`} checked={selectedTransform===p.id} disabled={disabled||locked} onChange={()=>onChange({...selection,transformId:p.id})}/><span title={p.name}>{p.name}{p.scope === 'company'&&<small className="rule-company">Company</small>}</span></label><button className="icon" aria-label={`Edit transformer: ${p.name}`} disabled={disabled||locked} onClick={()=>open('transform',p)}><Settings2 size={13}/></button></div>)}
        {!transformers.length&&<p className="rules-note">Add a named transformer to reuse it across topics.</p>}
      </section>
      <section className="rule-card"><div className="rule-list-header"><Filter size={16}/><h3>Filters</h3><button className="icon" aria-label="Add filter" disabled={disabled||locked} onClick={()=>open('filter')}><Plus size={15}/></button></div><p className="rule-list-help">Enable any number. All must match.</p>
        {filters.map(p=><div className="saved-rule-row" key={p.id}><label><input type="checkbox" aria-label={`Filter: ${p.name}`} checked={selection.filterIds.includes(p.id)} disabled={disabled||locked} onChange={e=>onChange({...selection,filterIds:e.target.checked?[...selection.filterIds,p.id]:selection.filterIds.filter(id=>id!==p.id)})}/><span title={p.name}>{p.name}{p.scope === 'company'&&<small className="rule-company">Company</small>}</span></label><button className="icon" aria-label={`Edit filter: ${p.name}`} disabled={disabled||locked} onClick={()=>open('filter',p)}><Settings2 size={13}/></button></div>)}
        {!filters.length&&<p className="rules-note">No saved filters yet. Use + to add one.</p>}
      </section>
      {locked&&<p className="rules-note">Stop the all-topic search to change rules.</p>}
      <p className="rules-note">Selections are remembered for this connection and topic. New topics start with no active rules. Rule definitions are shared across topics.</p>
      <div className="rules-bottom"><span className="tiny-dot"/> Auto-saved for this topic</div>
    </aside>
    {editor&&<div className="modal-backdrop rules-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)setEditor(null);}}><div ref={dialog} className="modal rule-modal" role="dialog" aria-modal="true" aria-labelledby="rule-dialog-title">
      <div className="modal-title"><div><span className="eyebrow">SAVED RULE</span><h2 id="rule-dialog-title">{editor.id?'Edit':'Add'} {editor.kind==='filter'?'filter':'transformer'}</h2></div><button className="icon" aria-label="Close rule editor" disabled={busy} onClick={()=>setEditor(null)}><X size={19}/></button></div>
      <p className="editor-description">Rules are shared across connections and topics. Saving a rule does not activate it. {editor.id&&'Edits affect every topic using this rule; a new name saves a separate rule.'}</p>
      <fieldset disabled={busy}><label>Name<input aria-label="Rule name" maxLength={100} value={editor.name} placeholder="e.g. Unwrap payload" onChange={e=>setEditor({...editor,name:e.target.value})}/></label>
      {hosted&&<label>Sharing<select aria-label="Rule sharing" value={editor.scope || 'personal'} onChange={e=>setEditor({...editor,scope:e.target.value as 'personal'|'company'})}><option value="personal">Personal — only me</option><option value="company">Company — everyone in my company</option></select><small>Changing sharing saves a separate copy. Company rules can be edited or deleted by company members. Only use shared JavaScript you trust.</small></label>}
      {editor.kind==='filter'?<><label>Text search<input aria-label="Filter text search" value={editor.search} placeholder="Value, key, topic, partition, or offset…" onChange={e=>setEditor({...editor,search:e.target.value})}/></label><label>JavaScript condition<textarea aria-label="Filter JavaScript" spellCheck={false} rows={5} value={editor.js} placeholder={'value.type === "order.created"'} onChange={e=>setEditor({...editor,js:e.target.value})}/></label><p className="editor-help">Text and JavaScript must both match. All enabled filters must match the transformed value.</p></>:<><label>JavaScript function body<textarea aria-label="Transform JavaScript" spellCheck={false} rows={8} value={editor.transform} onChange={e=>setEditor({...editor,transform:e.target.value})}/></label><p className="editor-help">Use <code>value</code> and <code>message</code>. Return a value to display, or <code>undefined</code> to hide it. Use synchronous, trusted code.</p></>}
      {error&&<div className="error" role="alert">{error}</div>}
      <div className="modal-footer"><div>{editor.id&&<button className="secondary" onClick={()=>void remove()}>Delete rule</button>}</div><div className="modal-actions"><button className="secondary" onClick={()=>setEditor(null)}>Cancel</button><button className="primary" disabled={disabled||locked||!editor.name.trim()} onClick={()=>void save()}>{busy?'Saving…':'Save rule'}</button></div></div></fieldset>
    </div></div>}
  </>;
}
