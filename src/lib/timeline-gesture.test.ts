import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  initialGestureArmed,
  pointerDistance,
  shouldActivateDrag,
  shouldArmMouseDrag,
  shouldCancelGestureWithoutButtons,
  shouldSuppressClickAfterDrag,
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
