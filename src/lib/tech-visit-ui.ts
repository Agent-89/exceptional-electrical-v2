/**
 * Presentation helpers for the technician visit screen.
 * Pure UI-state mapping — does not change timer or visit business rules.
 */

export type TimerUiPhase = 'not_started' | 'working' | 'on_break' | 'finished';

export type TimerPrimaryAction = 'start' | 'take_break' | 'resume' | 'finish';

export const TIMER_ACTION_LABELS: Record<TimerPrimaryAction, string> = {
  start: 'Start Work',
  take_break: 'Take Break',
  resume: 'Resume Work',
  finish: 'Finish Work',
};

export const TIMER_PENDING_LABELS: Record<TimerPrimaryAction, string> = {
  start: 'Starting…',
  take_break: 'Starting break…',
  resume: 'Resuming…',
  finish: 'Finishing…',
};

/** Map live timer entry + finish redirect flag to a screen phase. */
export function resolveTimerUiPhase(input: {
  activeStatus: string | null | undefined;
  timeRecorded: boolean;
}): TimerUiPhase {
  if (input.activeStatus === 'active') return 'working';
  if (input.activeStatus === 'on_break') return 'on_break';
  if (input.timeRecorded) return 'finished';
  return 'not_started';
}

/** Primary timer buttons for the current phase (order = left → right). */
export function timerPrimaryActions(phase: TimerUiPhase): TimerPrimaryAction[] {
  switch (phase) {
    case 'not_started':
      return ['start'];
    case 'working':
      return ['take_break', 'finish'];
    case 'on_break':
      return ['resume', 'finish'];
    case 'finished':
      return [];
  }
}

export function timerPhaseStatusLabel(phase: TimerUiPhase): string {
  switch (phase) {
    case 'not_started':
      return 'Not started';
    case 'working':
      return 'Working';
    case 'on_break':
      return 'On break';
    case 'finished':
      return 'Time recorded';
  }
}

/** Primary elapsed label under the large timer digits. */
export function timerWorkCaption(phase: TimerUiPhase): string {
  switch (phase) {
    case 'not_started':
      return 'Work time';
    case 'working':
      return 'Work time elapsed';
    case 'on_break':
      return 'Work time so far';
    case 'finished':
      return 'Work time recorded';
  }
}

export function timerBreakCaption(phase: TimerUiPhase): string {
  if (phase === 'on_break') return 'Break time (running)';
  if (phase === 'working') return 'Break time';
  if (phase === 'finished') return 'Break time';
  return 'Break time';
}

export function isPrimaryTimerAction(phase: TimerUiPhase, action: TimerPrimaryAction): boolean {
  if (phase === 'working') return action === 'finish';
  if (phase === 'on_break') return action === 'resume';
  if (phase === 'not_started') return action === 'start';
  return false;
}
