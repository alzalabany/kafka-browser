import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processMessages } from './message-pipeline';
import { parse, diff } from './diff';
import { toJsonl } from './messages';
import type { Message } from './types';

const message = (id: string, value: string | null): Message => ({id,topic:'orders',partition:0,offset:id,timestamp:'1700000000000',key:'order',value,headers:{trace:'original'}});
test('disabled rules retain configuration but skip execution and syntax checks', () => {
  const original = message('1','{"total":10}');
  const rules = {transform:'return {',js:'broken(',search:'no-match',transformEnabled:false,filterEnabled:false};
  const result = processMessages([original],rules);
  assert.equal(result.transformError,''); assert.equal(result.filterError,'');
  assert.deepEqual(result.visible,[original]);
  assert.equal(rules.transform,'return {');
});
test('filter and transformer enable independently and default to previous behavior', () => {
  const original = message('1','{"total":10}');
  assert.equal(processMessages([original],{transform:'return value.total * 2;',transformEnabled:false,js:'value.total === 10'}).visible.length,1);
  assert.equal(processMessages([original],{transform:'return value.total * 2;',filterEnabled:false,search:'no-match',js:'false'}).visible[0].value,'20');
  assert.equal(processMessages([original],{transform:'return value.total * 2;',js:'value === 20'}).visible.length,1);
});
test('transforms JSON before text/JS filters, diffs, and exports', () => {
  const originals = [message('1','{"payload":{"total":10}}'),message('2','{"payload":{"total":20}}')];
  const result = processMessages(originals,{transform:'return value.payload;',search:'total',js:'value.total >= 20'});
  assert.equal(result.visible.length,1);
  assert.equal(result.visible[0].value,'{"total":20}');
  assert.equal(JSON.parse(toJsonl(result.visible)).value,'{"total":20}');
  assert.deepEqual(diff(parse(result.transformed[0].value),parse(result.transformed[1].value)),[{path:'$.total',before:10,after:20,kind:'changed'}]);
  assert.equal(originals[0].value,'{"payload":{"total":10}}');
});
test('supports statements, string decoding, null, and dropping messages', () => {
  const result = processMessages([message('1','hello'),message('2',null),message('3','skip')],{transform:'if (value === "skip") return undefined; if (value === null) return null; const upper = value.toUpperCase(); return upper;'});
  assert.deepEqual(result.visible.map(m => m.value),['HELLO',null]);
  assert.equal(result.transformError,'');
});
test('user code cannot mutate original metadata or payload', () => {
  const original = message('1','{"count":1}');
  const result = processMessages([original],{transform:'message.headers.trace = "changed"; message.id = "changed"; value.count++; return value;',js:'(message.headers.trace = "filtered", true)'});
  assert.equal(original.headers.trace,'original');
  assert.equal(original.value,'{"count":1}');
  assert.equal(result.visible[0].id,'1');
  assert.equal(result.visible[0].headers.trace,'original');
  assert.equal(result.visible[0].value,'{"count":2}');
});
test('syntax errors show up with an empty buffer and resetting restores originals', () => {
  assert.match(processMessages([],{transform:'return {'}).transformError,/Syntax error/);
  const original = message('1','hello');
  assert.equal(processMessages([original],{transform:''}).visible[0],original);
});
test('runtime errors skip only broken messages; unsupported return types are reported', () => {
  const result = processMessages([message('1',null),message('2','{"payload":"ok"}')],{transform:'return value.payload;'});
  assert.equal(result.visible[0].value,'ok');
  assert.match(result.transformError,/1 message skipped.*Message 1/);
  for (const code of ['return Promise.resolve(value);','return Promise.reject(new Error("async failure"));','return 1n;','const x={}; x.self=x; return x;','return () => 1;']) {
    const failed = processMessages([message('1','hello')],{transform:code});
    assert.equal(failed.visible.length,0); assert.ok(failed.transformError);
  }
});
