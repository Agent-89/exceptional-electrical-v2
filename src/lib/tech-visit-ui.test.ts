import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPrimaryTimerAction,
  resolveTimerUiPhase,
  timerBreakCaption,
  timerPhaseStatusLabel,
  timerPrimaryActions,
  timerWorkCaption,
  TIMER_ACTION_LABELS,
} from './tech-visit-ui.ts';

describe('resolveTimerUiPhase', () => {
  it('shows not started when there is no active timer', () => {
    assert.equal(resolveTimerUiPhase({ activeStatus: null, timeRecorded: false }), 'not_started');
    assert.equal(resolveTimerUiPhase({ activeStatus: undefined, timeRecorded: false }), 'not_started');
  });

  it('shows working and on-break from live entry status', () => {
    assert.equal(resolveTimerUiPhase({ activeStatus: 'active', timeRecorded: false }), 'working');
    assert.equal(resolveTimerUiPhase({ activeStatus: 'on_break', timeRecorded: true }), 'on_break');
  });

  it('shows finished after time is recorded and no live timer remains', () => {
    assert.equal(resolveTimerUiPhase({ activeStatus: null, timeRecorded: true }), 'finished');
  });
});

describe('timerPrimaryActions', () => {
  it('exposes Start Work when idle', () => {
    assert.deepEqual(timerPrimaryActions('not_started'), ['start']);
    assert.equal(TIMER_ACTION_LABELS.start, 'Start Work');
  });

  it('exposes Take Break and Finish Work while working', () => {
    assert.deepEqual(timerPrimaryActions('working'), ['take_break', 'finish']);
    assert.equal(TIMER_ACTION_LABELS.take_break, 'Take Break');
    assert.equal(TIMER_ACTION_LABELS.finish, 'Finish Work');
    assert.equal(isPrimaryTimerAction('working', 'finish'), true);
    assert.equal(isPrimaryTimerAction('working', 'take_break'), false);
  });

  it('exposes Resume Work and Finish Work on break', () => {
    assert.deepEqual(timerPrimaryActions('on_break'), ['resume', 'finish']);
    assert.equal(TIMER_ACTION_LABELS.resume, 'Resume Work');
    assert.equal(isPrimaryTimerAction('on_break', 'resume'), true);
  });

  it('hides timer actions once finished', () => {
    assert.deepEqual(timerPrimaryActions('finished'), []);
    assert.equal(timerPhaseStatusLabel('finished'), 'Time recorded');
  });

  it('labels work and break captions by phase', () => {
    assert.equal(timerWorkCaption('working'), 'Work time elapsed');
    assert.equal(timerBreakCaption('on_break'), 'Break time (running)');
    assert.equal(timerWorkCaption('finished'), 'Work time recorded');
  });
});
