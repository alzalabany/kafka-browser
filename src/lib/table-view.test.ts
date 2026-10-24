import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_TABLE,fieldValue,cellText,tableTime,validPath} from './table-view';
import type {Message} from './types';
const message:Message={id:'1',topic:'orders',partition:0,offset:'1',timestamp:'1700000000000',key:'key',value:JSON.stringify({timestamp:1700000000,items:[{price:12}],object:{ok:true},empty:null,zero:0}),headers:{}};
test('columns read transformed values, nested arrays, and message metadata without evaluating code',()=>{
  assert.equal(fieldValue(message,'value.items[0].price'),12);
  assert.equal(fieldValue(message,'message.key'),'key');
  assert.equal(fieldValue({...message,value:'{"items":[{"price":24}]}'},'value.items[0].price'),24);
  assert.equal(fieldValue(message,'value.missing.field'),undefined);
  assert.equal(fieldValue(message,'value.toString'),undefined);
  assert.equal(validPath('value.timestamp; fetch("x")'),false);
  assert.equal(validPath('value.items[0].price'),true);
  assert.equal(fieldValue({...message,value:null},'value.timestamp'),undefined);
});
test('custom column formatting preserves nulls, zero, booleans and objects',()=>{
  assert.equal(cellText(undefined),'—');assert.equal(cellText(null),'null');assert.equal(cellText(0),'0');assert.equal(cellText(false),'false');assert.equal(cellText({ok:true}),'{"ok":true}');
});
test('time supports Kafka milliseconds, transformed Unix seconds, ISO dates, auto, and missing values',()=>{
  assert.ok(tableTime(message,DEFAULT_TABLE).title.startsWith('2023-11-14T22:13:20.000Z'));
  for(const timeFormat of ['auto','seconds'] as const)assert.ok(tableTime(message,{...DEFAULT_TABLE,timePath:'value.timestamp',timeFormat}).title.startsWith('2023-11-14T22:13:20.000Z'));
  const iso={...message,value:'{"timestamp":"2023-11-14T22:13:20Z"}'};
  assert.ok(tableTime(iso,{...DEFAULT_TABLE,timePath:'value.timestamp',timeFormat:'iso'}).title.startsWith('2023-11-14T22:13:20.000Z'));
  assert.equal(tableTime(message,{...DEFAULT_TABLE,timePath:'value.missing'}).text,'—');
  assert.equal(tableTime({...message,value:'{"timestamp":"invalid"}'},{...DEFAULT_TABLE,timePath:'value.timestamp',timeFormat:'auto'}).text,'—');
  assert.ok(tableTime(message,{...DEFAULT_TABLE,timePath:'value.zero'}).title.startsWith('1970-01-01T00:00:00.000Z'));
});
