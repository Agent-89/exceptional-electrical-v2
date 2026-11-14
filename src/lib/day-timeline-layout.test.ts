import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeVisibleWindow,
  hourLabel,
  layoutOverlappingSlots,
  perthMinutesOnDay,
  shiftPerthDayKey,
} from './day-timeline-layout.ts';

describe('perthMinutesOnDay', () => {
  it('maps Perth wall-clock minutes for a known instant', () => {
    // 2026-11-14 01:30 UTC == 09:30 Perth
    assert.equal(perthMinutesOnDay('2026-11-14T01:30:00.000Z', '2026-11-14'), 9 * 60 + 30);
  });

  it('clamps cross-midnight ends to day bounds', () => {
    assert.equal(perthMinutesOnDay('2026-11-13T16:00:00.000Z', '2026-11-14'), 0); // Perth midnight
    assert.equal(perthMinutesOnDay('2026-11-14T16:00:00.000Z', '2026-11-14'), 24 * 60);
  });
});

describe('layoutOverlappingSlots', () => {
  it('places overlapping appointments in separate lanes', () => {
    const layout = layoutOverlappingSlots([
      { id: 'a', startMinutes: 9 * 60, endMinutes: 11 * 60 },
      { id: 'b', startMinutes: 10 * 60, endMinutes: 12 * 60 },
      { id: 'c', startMinutes: 13 * 60, endMinutes: 14 * 60 },
    ]);
    assert.equal(layout.get('a')?.count, 2);
    assert.equal(layout.get('b')?.count, 2);
    assert.notEqual(layout.get('a')?.index, layout.get('b')?.index);
    assert.equal(layout.get('c')?.count, 1);
  });

  it('handles empty days', () => {
    assert.equal(layoutOverlappingSlots([]).size, 0);
  });
});

describe('computeVisibleWindow', () => {
  it('pads around appointments and avoids a full empty 24h span', () => {
    const window = computeVisibleWindow([{ startMinutes: 9 * 60, endMinutes: 10 * 60 }], null, {
      padMinutes: 60,
      minSpanMinutes: 6 * 60,
    });
    assert.ok(window.startMinutes <= 8 * 60);
    assert.ok(window.endMinutes >= 11 * 60);
    assert.ok(window.endMinutes - window.startMinutes >= 6 * 60);
    assert.ok(window.endMinutes - window.startMinutes < 24 * 60);
  });
});

describe('helpers', () => {
  it('formats hour labels and shifts Perth day keys', () => {
    assert.equal(hourLabel(0), '12 am');
    assert.equal(hourLabel(13), '1 pm');
    assert.equal(shiftPerthDayKey('2026-11-14', 1), '2026-11-15');
    assert.equal(shiftPerthDayKey('2026-11-14', -1), '2026-11-13');
  });
});
