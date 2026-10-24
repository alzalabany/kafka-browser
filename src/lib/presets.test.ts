import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { presetStore, readPreset } from './presets';

test('named presets persist independently, update without duplication, and delete', () => {
  const db = new Database(':memory:');
  try {
    const store = presetStore(db);
    const filter = store.save({kind:'filter',name:' Orders ',search:'order-7',js:'value.ok'});
    const transform = store.save({kind:'transform',name:'Orders',transform:'return value.payload;'});
    const updated = store.save({kind:'filter',name:'Orders',search:'order-8',js:'value.ready'});
    assert.equal(updated.id,filter.id);
    const reopened = presetStore(db);
    assert.equal(reopened.list().length,2);
    assert.deepEqual(reopened.list().find(p => p.id === filter.id),updated);
    assert.equal(reopened.list().find(p => p.id === transform.id)?.transform,'return value.payload;');
    assert.equal(store.remove(filter.id),true);
    assert.equal(store.remove(filter.id),false);
    assert.deepEqual(store.list(),[transform]);
  } finally { db.close(); }
});

test('presets validate names and content and store only the selected rule kind', () => {
  for (const input of [null,{}, {name:' ',kind:'filter'},{name:'x'.repeat(101),kind:'filter'},{name:'X',kind:'bad'}, {name:'X',kind:'filter',js:4}]) assert.throws(() => readPreset(input));
  assert.deepEqual(readPreset({name:'Simple',kind:'filter',transform:'ignore'}),{name:'Simple',kind:'filter',search:'',js:'',transform:''});
  assert.deepEqual(readPreset({name:'Unwrap',kind:'transform',search:'ignore',js:'ignore',transform:'return value.payload;'}),{name:'Unwrap',kind:'transform',search:'',js:'',transform:'return value.payload;'});
});
