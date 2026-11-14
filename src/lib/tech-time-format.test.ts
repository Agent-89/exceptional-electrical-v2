import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeWorkedMinutes,
  elapsedWholeMinutes,
  formatDurationMinutes,
} from './tech-time-format.ts';

describe('elapsedWholeMinutes', () => {
  it('floors partial minutes', () => {
    assert.equal(
      elapsedWholeMinutes('2026-11-14T01:00:00.000Z', '2026-11-14T01:00:59.000Z'),
      0,
    );
    assert.equal(
      elapsedWholeMinutes('2026-11-14T01:00:00.000Z', '2026-11-14T02:30:00.000Z'),
      90,
    );
  });
});

describe('computeWorkedMinutes', () => {
  it('subtracts break duration and never goes negative', () => {
    assert.equal(
      computeWorkedMinutes('2026-11-14T01:00:00.000Z', '2026-11-14T03:00:00.000Z', 15),
      105,
    );
    assert.equal(
      computeWorkedMinutes('2026-11-14T01:00:00.000Z', '2026-11-14T01:10:00.000Z', 30),
      0,
    );
  });
});

describe('formatDurationMinutes', () => {
  it('formats hours and minutes', () => {
    assert.equal(formatDurationMinutes(45), '45m');
    assert.equal(formatDurationMinutes(75), '1h 15m');
    assert.equal(formatDurationMinutes(0), '0m');
  });
});
