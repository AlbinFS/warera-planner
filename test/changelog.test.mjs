import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANGELOG, unseen } from '../src/lib/changelog.js';

test('the changelog: unique ids, newest first; a browser sees what came after its last look', () => {
  assert.equal(new Set(CHANGELOG.map((e) => e.id)).size, CHANGELOG.length);
  assert.deepEqual([...CHANGELOG].sort((a, b) => b.date.localeCompare(a.date)).map((e) => e.id), CHANGELOG.map((e) => e.id));
  // A first visit (or an id no longer listed): just the newest entry.
  assert.deepEqual(unseen(null), CHANGELOG.slice(0, 1));
  assert.deepEqual(unseen('gone'), CHANGELOG.slice(0, 1));
  // Seen the newest: nothing to show.
  assert.deepEqual(unseen(CHANGELOG[0].id), []);
});
