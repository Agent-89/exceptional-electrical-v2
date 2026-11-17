import assert from 'node:assert/strict';
import test from 'node:test';
import { STAFF_COLOR_PALETTE, staffColor } from './staff-color.ts';

test('staffColor prefers avatar_color when it is a valid hex colour', () => {
  assert.equal(staffColor('abc', '#F5A54C'), '#F5A54C');
});

test('staffColor falls back to a stable palette colour', () => {
  const a = staffColor('staff-1');
  assert.equal(a, staffColor('staff-1', null));
  assert.equal(a, staffColor('staff-1', ''));
  assert.ok((STAFF_COLOR_PALETTE as readonly string[]).includes(a));
});

test('staffColor ignores invalid avatar_color values', () => {
  assert.equal(staffColor('staff-1', 'red; background:url(x)'), staffColor('staff-1'));
});
