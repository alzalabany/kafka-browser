import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConnection } from './connection-form';
import { readTimestamp, timestampOffsets, seekOnFirstJoin } from './stream-position';
import { appendMessage, toJsonl } from './messages';
import type { Credentials, Message } from './types';
import type { Consumer } from 'kafkajs';

const saved: Credentials = {id:'saved',name:'Cluster',mode:'sasl',host:'localhost',port:9093,mechanism:'plain',username:'user',password:'secret',ca:'saved-ca',key:'',cert:''};
const form = (values: Record<string, string>) => { const f = new FormData(); for (const [k,v] of Object.entries(values)) f.set(k,v); return f; };
const fields = {name:'Updated',mode:'sasl',host:'localhost',port:'9093',username:'new-user',mechanism:'scram-sha-256'};

test('editing preserves identity and blank secrets; replacements override them', async () => {
  const draft = form(fields);
  const edited = await readConnection(draft, saved);
  assert.equal(edited.id, saved.id);
  assert.equal(edited.password, saved.password);
  assert.equal(edited.ca, saved.ca);
  assert.equal(edited.username, 'new-user');
  draft.set('password','replacement');
  draft.set('ca',new File(['replacement-ca'],'ca.pem'));
  const replaced = await readConnection(draft, saved);
  assert.equal(replaced.password,'replacement');
  assert.equal(replaced.ca,'replacement-ca');
  assert.equal(saved.password,'secret');
});
test('switching auth modes requires fresh credentials and drops old secrets', async () => {
  const draft = form({...fields,mode:'ssl'});
  await assert.rejects(readConnection(draft,saved), /access key/);
  draft.set('key',new File(['new-key'],'key.pem'));
  draft.set('cert',new File(['new-cert'],'cert.pem'));
  const ssl = await readConnection(draft,saved);
  assert.equal(ssl.password,''); assert.equal(ssl.ca,''); assert.equal(ssl.key,'new-key');
  const withoutCa = await readConnection(form({...fields,mode:'ssl',clearCa:'on'}), {...ssl,ca:'private-ca'});
  assert.equal(withoutCa.ca,''); assert.equal(withoutCa.cert,'new-cert');
});
test('service URI overrides host and port; missing new credentials fail', async () => {
  const edited = await readConnection(form({...fields,uri:'broker.example:25073'}), saved);
  assert.equal(edited.host,'broker.example'); assert.equal(edited.port,25073);
  await assert.rejects(readConnection(form(fields)), /username and password/);
});
test('timestamp validates explicit position and millisecond precision', () => {
  assert.equal(readTimestamp('timestamp','1700000000123'),1700000000123);
  assert.equal(readTimestamp('timestamp','0'),0);
  assert.equal(readTimestamp('latest',null),undefined);
  for (const value of [null,'','NaN','-1','1.5','8640000000000001']) assert.throws(() => readTimestamp('timestamp',value));
  assert.throws(() => readTimestamp('invalid',null));
});
test('timestamp offsets handle no matches and offsets larger than JS safe integers', async () => {
  const offsets = await timestampOffsets({
    fetchTopicOffsets: async () => [{partition:0,offset:'9007199254740999',high:'9007199254740999',low:'0'}, {partition:1,offset:'24',high:'24',low:'0'}],
    fetchTopicOffsetsByTimestamp: async () => [{partition:0,offset:'9007199254740993'},{partition:1,offset:'-1'}],
  },'orders',1700000000000);
  assert.deepEqual(offsets,[{topic:'orders',partition:0,offset:'9007199254740993'},{topic:'orders',partition:1,offset:'24'}]);
});
test('timestamp seek happens on first join without rewinding on rebalances', () => {
  let joined: (() => void) | undefined;
  const seeks: unknown[] = [];
  const consumer = {events:{GROUP_JOIN:'join'},on:(_event: string, listener: () => void) => {joined=listener;return () => {};},seek:(offset: unknown) => seeks.push(offset)} as unknown as Consumer;
  const offsets = [{topic:'orders',partition:0,offset:'42'}];
  seekOnFirstJoin(consumer,offsets);
  assert.deepEqual(seeks,[]); joined!(); joined!(); assert.deepEqual(seeks,offsets);
});
const message = (id: number): Message => ({id:`0:${id}`,topic:'orders',partition:0,offset:String(id),timestamp:'1700000000000',key:null,value:'{"text":"one\\ntwo"}',headers:{}});
test('buffer is bounded, deduplicates offsets, and leaves paused snapshots intact', () => {
  const snapshot = [message(0)];
  let buffer = snapshot;
  for (let i=1;i<=1005;i++) buffer = appendMessage(buffer,message(i));
  assert.equal(buffer.length,1000); assert.equal(buffer[0].offset,'1005');
  assert.deepEqual(snapshot,[message(0)]);
  buffer = appendMessage(buffer,message(1005)); assert.equal(buffer.length,1000);
});
test('JSONL preserves nulls, strings, headers, and multiline values', () => {
  const rows = [message(1), {...message(2),value:null,headers:{trace:'id'}}];
  const exported = toJsonl(rows);
  assert.deepEqual(exported.trimEnd().split('\n').map(line => JSON.parse(line)),rows);
  assert.equal(toJsonl([]),'');
});
