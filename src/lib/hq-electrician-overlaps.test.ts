import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  HQ_ELECTRICIAN_OVERLAP_MESSAGE,
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

  it('keeps the production hard-block copy stable for create and edit paths', () => {
    assert.match(HQ_ELECTRICIAN_OVERLAP_MESSAGE, /overlapping HQ visit/i);
  });
});
