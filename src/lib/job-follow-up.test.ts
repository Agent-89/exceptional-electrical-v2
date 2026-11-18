import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatFollowUpResolutionActivityNote,
  isFollowUpOutstanding,
  pickNextFollowUpAppointment,
  validateFollowUpResolution,
} from './job-follow-up.ts';

describe('isFollowUpOutstanding', () => {
  it('is outstanding only while flagged and unresolved', () => {
    assert.equal(
      isFollowUpOutstanding({
        id: 'a',
        startsAt: '2026-11-16T01:00:00.000Z',
        followUp: true,
      }),
      true,
    );
    assert.equal(
      isFollowUpOutstanding({
        id: 'a',
        startsAt: '2026-11-16T01:00:00.000Z',
        followUp: true,
        followUpResolvedAt: '2026-11-16T05:00:00.000Z',
      }),
      false,
    );
    assert.equal(
      isFollowUpOutstanding({
        id: 'a',
        startsAt: '2026-11-16T01:00:00.000Z',
        followUp: false,
      }),
      false,
    );
  });
});

describe('validateFollowUpResolution', () => {
  const candidates = [
    {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0101',
      startsAt: '2026-11-17T01:00:00.000Z',
      status: 'scheduled',
    },
  ];

  it('requires a later appointment when linking', () => {
    const missingLink = validateFollowUpResolution({
      mode: 'linked_visit',
      note: null,
      linkedAppointmentId: null,
      sourceAppointmentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0100',
      sourceStartsAt: '2026-11-16T01:00:00.000Z',
      candidateAppointments: candidates,
    });
    assert.equal(missingLink.ok, false);

    const ok = validateFollowUpResolution({
      mode: 'linked_visit',
      note: null,
      linkedAppointmentId: candidates[0].id,
      sourceAppointmentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0100',
      sourceStartsAt: '2026-11-16T01:00:00.000Z',
      candidateAppointments: candidates,
    });
    assert.equal(ok.ok, true);
  });

  it('allows office_cleared with no note and no linked visit', () => {
    const result = validateFollowUpResolution({
      mode: 'office_cleared',
      note: null,
      linkedAppointmentId: null,
      sourceAppointmentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0100',
      sourceStartsAt: '2026-11-16T01:00:00.000Z',
      candidateAppointments: candidates,
    });
    assert.deepEqual(result, {
      ok: true,
      mode: 'office_cleared',
      linkedAppointmentId: null,
    });
  });
});

describe('pickNextFollowUpAppointment', () => {
  it('picks the earliest later non-cancelled appointment', () => {
    const next = pickNextFollowUpAppointment({
      sourceAppointmentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0100',
      sourceStartsAt: '2026-11-16T01:00:00.000Z',
      candidates: [
        {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0102',
          startsAt: '2026-11-18T01:00:00.000Z',
          status: 'scheduled',
        },
        {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0101',
          startsAt: '2026-11-17T01:00:00.000Z',
          status: 'scheduled',
        },
        {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0103',
          startsAt: '2026-11-17T03:00:00.000Z',
          status: 'cancelled',
        },
      ],
    });
    assert.equal(next?.id, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0101');
  });
});

describe('formatFollowUpResolutionActivityNote', () => {
  it('summarises linked and cleared resolutions', () => {
    assert.match(
      formatFollowUpResolutionActivityNote({
        mode: 'linked_visit',
        visitLabel: '16 Nov, 9:00 am',
        linkedLabel: '17 Nov, 9:00 am',
        note: 'Return for switchboard.',
      }),
      /linking 17 Nov/,
    );
    assert.match(
      formatFollowUpResolutionActivityNote({
        mode: 'office_cleared',
        visitLabel: '16 Nov, 9:00 am',
        note: 'No further work needed.',
      }),
      /marked resolved/,
    );
  });
});
