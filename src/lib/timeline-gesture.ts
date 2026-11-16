/** Pure helpers for schedule timeline drag/click separation. */

export const TIMELINE_DRAG_ARM_PX = 8;
export const TIMELINE_DRAG_ACTIVATE_PX = 6;

export type TimelineGestureKind = 'move' | 'start' | 'end';

export type TimelineGestureState = {
  id: string;
  kind: TimelineGestureKind;
  pointerId: number;
  armed: boolean;
  active: boolean;
  touch: boolean;
  anchorX: number;
  anchorY: number;
};

export function pointerDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** Mouse/pen start unarmed so a click can open details; touch arms after long-press. */
export function initialGestureArmed(pointerType: string): boolean {
  return pointerType === 'touch' ? false : false;
}

export function shouldArmMouseDrag(distancePx: number, armed: boolean, touch: boolean): boolean {
  if (armed || touch) return false;
  return distancePx >= TIMELINE_DRAG_ARM_PX;
}

export function shouldActivateDrag(distancePx: number, armed: boolean, active: boolean): boolean {
  if (!armed || active) return false;
  return distancePx >= TIMELINE_DRAG_ACTIVATE_PX;
}

/** Orphaned gestures (lost pointerup after modal open) must not keep dragging. */
export function shouldCancelGestureWithoutButtons(
  pointerType: string,
  buttons: number,
  armed: boolean,
): boolean {
  if (!armed) return false;
  if (pointerType === 'touch') return false;
  return buttons === 0;
}

export function shouldSuppressClickAfterDrag(active: boolean): boolean {
  return active;
}
