import {parse} from './diff';
import type {Message} from './types';

export type TableColumn = {id:string;label:string;path:string};
export type TableView = {timePath:string;timeFormat:'auto'|'milliseconds'|'seconds'|'iso';columns:TableColumn[]};
export const DEFAULT_TABLE:TableView={timePath:'message.timestamp',timeFormat:'milliseconds',columns:[]};
export function validPath(path:string) {
  return /^(value|message)(\.[A-Za-z_$][\w$]*|\[\d+\])*$/.test(path.trim());
}
export function fieldValue(message:Message,path:string):unknown {
  if(!validPath(path))return undefined;
  const parts=path.trim().replace(/\[(\d+)\]/g,'.$1').split('.');
  let value:unknown=parts.shift()==='value'?parse(message.value):message;
  for(const part of parts){
    if(value===null||typeof value!=='object'||!Object.hasOwn(value,part))return undefined;
    value=(value as Record<string,unknown>)[part];
  }
  return value;
}
export function cellText(value:unknown):string {
  if(value===undefined)return '—';
  if(value===null)return 'null';
  return typeof value==='string'?value:typeof value==='object'?JSON.stringify(value):String(value);
}
export function tableTime(message:Message,view:TableView) {
  const value=fieldValue(message,view.timePath);
  if(value===null||value===undefined||value===''||!['string','number'].includes(typeof value))return {text:'—',title:'Missing or invalid timestamp'};
  let time:number;
  if(view.timeFormat==='iso')time=typeof value==='string'?Date.parse(value):NaN;
  else if(view.timeFormat==='seconds')time=Number(value)*1000;
  else if(view.timeFormat==='milliseconds')time=Number(value);
  else {
    const numeric=Number(value);
    time=Number.isFinite(numeric)?Math.abs(numeric)<100_000_000_000?numeric*1000:numeric:Date.parse(String(value));
  }
  const date=new Date(time);
  if(!Number.isFinite(date.getTime()))return {text:'—',title:`Invalid timestamp: ${String(value)}`};
  return {text:date.toLocaleTimeString(),title:`${date.toISOString()} · ${view.timePath}`};
}
