import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatJobNumber,
  mapsDirectionsUrl,
  perthDayBounds,
  perthDayKey,
} from './perth-day.ts';

describe('perthDayKey', () => {
  it('formats a known Perth calendar day across the UTC date line', () => {
    // 2026-11-14 23:30 UTC == 2026-11-15 07:30 Perth
    assert.equal(perthDayKey('2026-11-14T23:30:00.000Z'), '2026-11-15');
    // 2026-11-14 15:59 UTC == 2026-11-14 23:59 Perth
    assert.equal(perthDayKey('2026-11-14T15:59:00.000Z'), '2026-11-14');
  });
});

describe('perthDayBounds', () => {
  it('returns exclusive end at next Perth midnight', () => {
    const { start, end } = perthDayBounds('2026-11-14');
    assert.equal(start.toISOString(), '2026-11-13T16:00:00.000Z');
    assert.equal(end.toISOString(), '2026-11-14T16:00:00.000Z');
  });

  it('rejects invalid day keys', () => {
    assert.throws(() => perthDayBounds('14-11-2026'));
  });
});

describe('format helpers', () => {
  it('pads job numbers and builds maps URLs', () => {
    assert.equal(formatJobNumber(42), 'JB00042');
    assert.ok(mapsDirectionsUrl('2 Marine Terrace, Cottesloe').includes('Marine'));
  });
});
