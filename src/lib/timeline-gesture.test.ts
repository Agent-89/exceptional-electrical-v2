import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  createTapRange,
  initialGestureArmed,
  normalizeCreateRange,
  pointerDistance,
  shouldActivateDrag,
  shouldArmMouseDrag,
  shouldCancelGestureWithoutButtons,
  shouldSuppressClickAfterDrag,
  snapTimelineMinutes,
  TIMELINE_CREATE_DEFAULT_MINUTES,
  TIMELINE_CREATE_MIN_MINUTES,
  TIMELINE_DRAG_ACTIVATE_PX,
  TIMELINE_DRAG_ARM_PX,
} from './timeline-gesture.ts';

describe('timeline gesture click vs drag', () => {
  it('starts mouse gestures unarmed so a click can open appointment details', () => {
    assert.equal(initialGestureArmed('mouse'), false);
    assert.equal(initialGestureArmed('pen'), false);
    assert.equal(initialGestureArmed('touch'), false);
  });

  it('arms mouse drag only after the movement threshold', () => {
    assert.equal(shouldArmMouseDrag(TIMELINE_DRAG_ARM_PX - 1, false, false), false);
    assert.equal(shouldArmMouseDrag(TIMELINE_DRAG_ARM_PX, false, false), true);
    assert.equal(shouldArmMouseDrag(20, true, false), false);
    assert.equal(shouldArmMouseDrag(20, false, true), false);
  });

  it('activates drag only while armed and past the activate threshold', () => {
    assert.equal(shouldActivateDrag(TIMELINE_DRAG_ACTIVATE_PX, true, false), true);
    assert.equal(shouldActivateDrag(TIMELINE_DRAG_ACTIVATE_PX - 1, true, false), false);
    assert.equal(shouldActivateDrag(20, false, false), false);
    assert.equal(shouldActivateDrag(20, true, true), false);
  });

  it('cancels orphaned mouse gestures when no buttons remain pressed', () => {
    assert.equal(shouldCancelGestureWithoutButtons('mouse', 0, true), true);
    assert.equal(shouldCancelGestureWithoutButtons('mouse', 1, true), false);
    assert.equal(shouldCancelGestureWithoutButtons('touch', 0, true), false);
    assert.equal(shouldCancelGestureWithoutButtons('mouse', 0, false), false);
  });

  it('suppresses the click only after a real drag', () => {
    assert.equal(shouldSuppressClickAfterDrag(true), true);
    assert.equal(shouldSuppressClickAfterDrag(false), false);
    assert.ok(pointerDistance(0, 0, 3, 4) === 5);
  });
});

describe('timeline empty-lane create ranges', () => {
  const START = 6 * 60;
  const END = 20 * 60;

  it('snaps minutes to the 15-minute grid', () => {
    assert.equal(snapTimelineMinutes(487), 480);
    assert.equal(snapTimelineMinutes(488), 495);
  });

  it('opens a 60-minute tap draft from the snapped minute', () => {
    const range = createTapRange(9 * 60 + 7, START, END);
    assert.deepEqual(range, { start: 9 * 60, end: 9 * 60 + TIMELINE_CREATE_DEFAULT_MINUTES });
  });

  it('clamps tap drafts that would run past the day end', () => {
    const range = createTapRange(19 * 60 + 45, START, END);
    assert.equal(range.end, END);
    assert.equal(range.end - range.start, TIMELINE_CREATE_DEFAULT_MINUTES);
  });

  it('normalizes drag ranges with a 15-minute minimum', () => {
    const short = normalizeCreateRange(10 * 60, 10 * 60 + 5, START, END);
    assert.equal(short.end - short.start, TIMELINE_CREATE_MIN_MINUTES);

    const dragged = normalizeCreateRange(14 * 60 + 10, 11 * 60 + 5, START, END);
    assert.deepEqual(dragged, { start: 11 * 60, end: 14 * 60 + 15 });
  });
});
