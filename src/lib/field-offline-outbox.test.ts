import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOutboxItem, formDataToPayload, payloadToFormData } from './field-offline/outbox.ts';

describe('field offline outbox helpers', () => {
  it('creates ordered outbox items with payload copies', () => {
    const now = new Date('2026-11-18T00:00:00.000Z');
    const item = createOutboxItem({
      id: 'fixed',
      now,
      staffId: 'staff-1',
      appointmentId: 'appt-1',
      action: 'start_work',
      payload: { appointment_id: 'appt-1' },
    });
    assert.equal(item.id, 'fixed');
    assert.equal(item.createdAt, '2026-11-18T00:00:00.000Z');
    assert.equal(item.action, 'start_work');
    assert.deepEqual(item.payload, { appointment_id: 'appt-1' });
    assert.equal(item.attempts, 0);
  });

  it('round-trips FormData string fields', () => {
    const fd = new FormData();
    fd.set('appointment_id', 'a1');
    fd.set('completion_note', 'done');
    const payload = formDataToPayload(fd);
    assert.deepEqual(payload, { appointment_id: 'a1', completion_note: 'done' });
    const again = payloadToFormData(payload);
    assert.equal(again.get('appointment_id'), 'a1');
    assert.equal(again.get('completion_note'), 'done');
  });
});
