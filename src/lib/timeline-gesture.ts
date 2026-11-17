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

/** Empty-lane create: tap uses a 60-minute block; drag uses the selected span. */
export const TIMELINE_CREATE_DEFAULT_MINUTES = 60;
export const TIMELINE_CREATE_MIN_MINUTES = 15;
export const TIMELINE_CREATE_TOUCH_HOLD_MS = 450;

export function snapTimelineMinutes(value: number, step = 15): number {
  return Math.round(value / step) * step;
}

export function clampTimelineMinutes(value: number, start: number, end: number): number {
  return Math.max(start, Math.min(end, value));
}

export function normalizeCreateRange(
  a: number,
  b: number,
  boundsStart: number,
  boundsEnd: number,
  minDuration = TIMELINE_CREATE_MIN_MINUTES,
): { start: number; end: number } {
  let start = clampTimelineMinutes(Math.min(a, b), boundsStart, boundsEnd);
  let end = clampTimelineMinutes(Math.max(a, b), boundsStart, boundsEnd);
  start = snapTimelineMinutes(start);
  end = snapTimelineMinutes(end);
  if (end - start < minDuration) end = Math.min(boundsEnd, start + minDuration);
  if (end - start < minDuration) start = Math.max(boundsStart, end - minDuration);
  return { start, end };
}

export function createTapRange(
  minute: number,
  boundsStart: number,
  boundsEnd: number,
  duration = TIMELINE_CREATE_DEFAULT_MINUTES,
): { start: number; end: number } {
  const snapped = snapTimelineMinutes(clampTimelineMinutes(minute, boundsStart, boundsEnd));
  let start = snapped;
  let end = snapped + duration;
  if (end > boundsEnd) {
    end = boundsEnd;
    start = Math.max(boundsStart, end - duration);
  }
  return normalizeCreateRange(start, end, boundsStart, boundsEnd, TIMELINE_CREATE_MIN_MINUTES);
}
