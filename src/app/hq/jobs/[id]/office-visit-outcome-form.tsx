'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import HqToast, { type HqToastMessage } from '@/app/hq/hq-toast';
import {
  officeUpdateVisitOutcomeAction,
  type TechFieldActionResult,
} from '@/app/field/actions';
import {
  VISIT_OUTCOME_LABELS,
  VISIT_OUTCOME_STATUSES,
  type VisitOutcomeStatus,
} from '@/lib/tech-visit-report';

type Props = {
  appointmentId: string;
  fieldStatus: string;
  completionNote: string | null;
  outstanding: string | null;
  issues: string | null;
  followUp: boolean;
};

function defaultOutcome(fieldStatus: string): VisitOutcomeStatus {
  if (fieldStatus === 'work_completed' || fieldStatus === 'unable_to_complete' || fieldStatus === 'in_progress') {
    return fieldStatus;
  }
  return 'in_progress';
}

export default function OfficeVisitOutcomeForm({
  appointmentId,
  fieldStatus,
  completionNote,
  outstanding,
  issues,
  followUp,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<HqToastMessage | null>(null);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<VisitOutcomeStatus>(defaultOutcome(fieldStatus));
  const [expectedStatus] = useState(fieldStatus);
  const [expectedCompletion] = useState(completionNote ?? '');
  const [expectedOutstanding] = useState(outstanding ?? '');
  const [expectedIssues] = useState(issues ?? '');
  const [expectedFollowUp] = useState(followUp);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);

    const fd = new FormData();
    fd.set('appointment_id', appointmentId);
    fd.set('field_status', outcome);
    fd.set('completion_note', expectedCompletion);
    fd.set('outstanding_work', expectedOutstanding);
    fd.set('issues', expectedIssues);
    if (expectedFollowUp) fd.set('follow_up_required', 'yes');
    fd.set('expected_field_status', expectedStatus);
    fd.set('expected_completion_note', expectedCompletion);
    fd.set('expected_outstanding_work', expectedOutstanding);
    fd.set('expected_issues', expectedIssues);
    if (expectedFollowUp) fd.set('expected_follow_up_required', 'yes');

    try {
      const result: TechFieldActionResult = await officeUpdateVisitOutcomeAction(fd);
      if (!result.ok) {
        setToast({ id: Date.now(), tone: 'error', text: result.error });
        return;
      }
      setToast({
        id: Date.now(),
        tone: 'success',
        text: result.noop ? result.message || 'Visit outcome already up to date' : 'Visit outcome saved',
      });
      startTransition(() => router.refresh());
    } catch {
      setToast({
        id: Date.now(),
        tone: 'error',
        text: 'Unable to update visit outcome. Please try again.',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <HqToast toast={toast} onDismiss={() => setToast(null)} />
      <form onSubmit={onSubmit} className="ee-edit-form" style={{ marginTop: 12 }}>
        <label>
          Set shared visit outcome
          <select
            name="field_status"
            value={outcome}
            disabled={pending}
            onChange={(e) => setOutcome(e.target.value as VisitOutcomeStatus)}
          >
            {VISIT_OUTCOME_STATUSES.map((status) => (
              <option key={status} value={status}>
                {VISIT_OUTCOME_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <button className="hq-detail-action-primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save visit outcome'}
        </button>
      </form>
    </>
  );
}
