import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff, parse } from './diff';
test('parses JSON, plain text, and tombstones', () => {
  assert.deepEqual(parse('{"a":1}'), {a:1});
  assert.equal(parse('hello'), 'hello');
  assert.equal(parse(null), null);
});
test('compares nested values, additions, removals, and arrays', () => {
  assert.deepEqual(diff({a:1,n:{x:true},items:[1,2],gone:0}, {a:2,n:{x:true},items:[1,3,4],new:null}), [
    {path:'$.a', before:1, after:2, kind:'changed'},
    {path:'$.items[1]',before:2,after:3,kind:'changed'},
    {path:'$.items[2]',before:undefined,after:4,kind:'added'},
    {path:'$.gone',before:0,after:undefined,kind:'removed'},
    {path:'$.new',before:undefined,after:null,kind:'added'},
  ]);
});
test('handles raw strings, nulls, and identical values', () => {
  assert.deepEqual(diff({x:[1]}, {x:[1]}), []);
  assert.deepEqual(diff('a','b'), [{path:'$',before:'a',after:'b',kind:'changed'}]);
  assert.deepEqual(diff(null,{}), [{path:'$',before:null,after:{},kind:'changed'}]);
});
