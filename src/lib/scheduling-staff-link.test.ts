import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { interpretSchedulingStaffRows } from './scheduling-staff-link.ts';

describe('interpretSchedulingStaffRows', () => {
  it('requires exactly one active mapping', () => {
    assert.deepEqual(interpretSchedulingStaffRows([]), { ok: false, reason: 'missing' });
    assert.deepEqual(
      interpretSchedulingStaffRows([
        { id: 'a', full_name: 'Sam', active: true },
        { id: 'b', full_name: 'Sam 2', active: true },
      ]),
      { ok: false, reason: 'duplicate' },
    );
    assert.deepEqual(
      interpretSchedulingStaffRows([{ id: 'a', full_name: 'Sam', active: false }]),
      { ok: false, reason: 'inactive' },
    );
    assert.deepEqual(
      interpretSchedulingStaffRows([{ id: 'a', full_name: 'Sam Rivera', active: true }]),
      { ok: true, staffId: 'a', fullName: 'Sam Rivera' },
    );
  });
});
