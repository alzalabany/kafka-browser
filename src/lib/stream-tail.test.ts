import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTailCount, readTimestamp, tailOffsets } from './stream-position';

test('tail count validates bounds while other start positions ignore it', () => {
  assert.equal(readTailCount('tail', '10'), 10);
  assert.equal(readTailCount('tail', '1000'), 1000);
  assert.equal(readTimestamp('tail', null), undefined);
  assert.equal(readTailCount('latest', 'bad'), undefined);
  for (const count of [null, '', '0', '-1', '1001', '1.5', 'NaN', 'Infinity']) assert.throws(() => readTailCount('tail', count));
});

test('tail seeks every partition at its retained bound and preserves 64-bit offsets', async () => {
  const offsets = await tailOffsets({fetchTopicOffsets: async topic => {
    assert.equal(topic, 'inactive-topic');
    return [
      {partition:0, offset:'9007199254740999', high:'9007199254740999', low:'0'},
      {partition:1, offset:'44', high:'44', low:'40'},
      {partition:2, offset:'0', high:'0', low:'0'},
    ];
  }}, 'inactive-topic', 10);
  assert.deepEqual(offsets, [
    {topic:'inactive-topic', partition:0, offset:'9007199254740989'},
    {topic:'inactive-topic', partition:1, offset:'40'},
    {topic:'inactive-topic', partition:2, offset:'0'},
  ]);
});
