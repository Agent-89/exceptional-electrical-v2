import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  HQ_ELECTRICIAN_OVERLAP_MESSAGE,
  buildOverlapConflictLines,
  formatHqElectricianOverlapMessage,
  hasElectricianOverlap,
} from './hq-electrician-overlaps.ts';

describe('hasElectricianOverlap', () => {
  it('returns false when no staff or no overlapping bookings', () => {
    assert.equal(hasElectricianOverlap([], [{appointment_id: 'a', staff_id: 's1'}]), false);
    assert.equal(hasElectricianOverlap(['s1'], []), false);
  });

  it('detects when a proposed electrician is already on an overlapping visit', () => {
    assert.equal(
      hasElectricianOverlap(
        ['s1', 's2'],
        [
          {appointment_id: 'other', staff_id: 's9'},
          {appointment_id: 'other', staff_id: 's2'},
        ],
      ),
      true,
    );
  });

  it('ignores overlapping visits that do not share crew', () => {
    assert.equal(
      hasElectricianOverlap(['s1'], [{appointment_id: 'other', staff_id: 's2'}]),
      false,
    );
  });
});

describe('formatHqElectricianOverlapMessage', () => {
  it('keeps the production hard-block copy stable when details are unavailable', () => {
    assert.match(formatHqElectricianOverlapMessage([]), /overlapping HQ visit/i);
    assert.equal(formatHqElectricianOverlapMessage([]), HQ_ELECTRICIAN_OVERLAP_MESSAGE);
  });

  it('includes electrician, appointment and Perth time details without internals', () => {
    const lines = buildOverlapConflictLines({
      staffIds: ['s1'],
      staffNames: new Map([['s1', 'Alex Electrician']]),
      bookedOnOverlaps: [{appointment_id: 'v1', staff_id: 's1'}],
      visits: [
        {
          id: 'v1',
          starts_at: '2026-11-16T01:00:00.000Z',
          ends_at: '2026-11-16T03:00:00.000Z',
          job_number: 42,
          job_title: 'Switchboard upgrade',
          customer_name: 'Demo Customer',
        },
      ],
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].staffName, 'Alex Electrician');
    assert.match(lines[0].visitLabel, /JB00042/);
    assert.match(lines[0].visitLabel, /Switchboard upgrade/);
    const message = formatHqElectricianOverlapMessage(lines);
    assert.match(message, /Alex Electrician/);
    assert.match(message, /JB00042/);
    assert.match(message, /Google Calendar override does not bypass/);
    assert.doesNotMatch(message, /stack|supabase|uuid|password/i);
  });
});
