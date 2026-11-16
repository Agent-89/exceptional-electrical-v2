'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reviewTimeEntryAction } from '@/app/hq/tech/actions';

export type TimeEntryReviewDefaults = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  breakMinutes: number;
  workedMinutes: number | null;
  billableMinutes: number | null;
};

function perthInputValue(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso)
    .toLocaleString('sv-SE', { timeZone: 'Australia/Perth', hour12: false })
    .replace(' ', 'T')
    .slice(0, 16);
}

type Draft = {
  billableMinutes: string;
  rejectionReason: string;
  startedAt: string;
  endedAt: string;
  breakMinutes: string;
  correctionNote: string;
};

type ReviewDecision = 'approve' | 'reject' | 'correct';

function draftFromEntry(entry: TimeEntryReviewDefaults): Draft {
  return {
    billableMinutes: String(entry.billableMinutes ?? entry.workedMinutes ?? 0),
    rejectionReason: '',
    startedAt: perthInputValue(entry.startedAt),
    endedAt: perthInputValue(entry.endedAt),
    breakMinutes: String(entry.breakMinutes),
    correctionNote: '',
  };
}

function entrySignature(entry: TimeEntryReviewDefaults): string {
  return [
    entry.id,
    entry.startedAt,
    entry.endedAt ?? '',
    entry.breakMinutes,
    entry.workedMinutes ?? '',
    entry.billableMinutes ?? '',
  ].join('|');
}

export default function TimeEntryReviewForm({
  entry,
  className,
  actionsClassName = 'ee-review-actions',
}: {
  entry: TimeEntryReviewDefaults;
  className?: string;
  actionsClassName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFromEntry(entry));
  const [chosenDecision, setChosenDecision] = useState<ReviewDecision | null>(null);

  const signature = entrySignature(entry);
  // After a successful save, parent refresh updates `entry` — resync draft only when clean.
  useEffect(() => {
    if (dirty) return;
    setDraft(draftFromEntry(entry));
  }, [signature, dirty, entry]);

  const onField = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDirty(true);
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setSuccess(null);
  }, []);

  const submitDecision = useCallback(
    (decision: ReviewDecision) => {
      if (pending) return;
      setChosenDecision(decision);
      setError(null);
      setSuccess(null);

      const data = new FormData();
      data.set('entry_id', entry.id);
      data.set('decision', decision);
      data.set('billable_minutes', draft.billableMinutes);
      data.set('rejection_reason', draft.rejectionReason);
      data.set('started_at', draft.startedAt);
      data.set('ended_at', draft.endedAt);
      data.set('break_minutes', draft.breakMinutes);
      data.set('correction_note', draft.correctionNote);

      startTransition(async () => {
        const result = await reviewTimeEntryAction(data);
        if (!result.ok) {
          setSuccess(null);
          setError(result.error || 'Unable to save time review.');
          // Keep draft + dirty so the user does not lose entered values.
          return;
        }
        setError(null);
        setSuccess(result.message || 'Saved.');
        setDirty(false);
        if (!result.noop) {
          // Clear only the one-shot note; times/billable resync from refreshed entry props.
          setDraft((prev) => ({ ...prev, correctionNote: '', rejectionReason: '' }));
        }
        router.refresh();
      });
    },
    [pending, entry.id, draft, router],
  );

  return (
    <form
      className={className ?? 'ee-edit-form'}
      onSubmit={(event) => {
        event.preventDefault();
        // Prefer the button that was just armed; fall back to native submitter.
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const fromSubmitter = submitter?.value;
        const decision =
          chosenDecision ||
          (fromSubmitter === 'approve' || fromSubmitter === 'reject' || fromSubmitter === 'correct'
            ? fromSubmitter
            : null);
        if (!decision) {
          setError('Choose Approve, Reject, or Save correction.');
          return;
        }
        submitDecision(decision);
      }}
    >
      <input type="hidden" name="entry_id" value={entry.id} />
      <input type="hidden" name="entry_signature" value={entrySignature(entry)} readOnly />
      <label>
        Billable minutes
        <input
          name="billable_minutes"
          type="number"
          min={0}
          value={draft.billableMinutes}
          onChange={(event) => onField('billableMinutes', event.target.value)}
        />
      </label>
      <label>
        Rejection reason
        <textarea
          name="rejection_reason"
          rows={2}
          maxLength={2000}
          value={draft.rejectionReason}
          onChange={(event) => onField('rejectionReason', event.target.value)}
        />
      </label>
      <label>
        Corrected start (Perth)
        <input
          type="datetime-local"
          name="started_at"
          value={draft.startedAt}
          onChange={(event) => onField('startedAt', event.target.value)}
        />
      </label>
      <label>
        Corrected end (Perth)
        <input
          type="datetime-local"
          name="ended_at"
          value={draft.endedAt}
          onChange={(event) => onField('endedAt', event.target.value)}
        />
      </label>
      <label>
        Break minutes
        <input
          type="number"
          name="break_minutes"
          min={0}
          value={draft.breakMinutes}
          onChange={(event) => onField('breakMinutes', event.target.value)}
        />
      </label>
      <label>
        Correction note
        <textarea
          name="correction_note"
          rows={2}
          maxLength={2000}
          placeholder="Required when saving a correction"
          value={draft.correctionNote}
          onChange={(event) => onField('correctionNote', event.target.value)}
        />
      </label>
      {error ? (
        <p className="ee-form-error" role="alert">
          {error}
        </p>
      ) : null}
      {success && !error ? (
        <p className="ee-form-success" role="status">
          {success}
        </p>
      ) : null}
      <div className={actionsClassName}>
        <button
          name="decision"
          value="approve"
          type="submit"
          disabled={pending}
          aria-busy={pending}
          onClick={() => setChosenDecision('approve')}
        >
          {pending && chosenDecision === 'approve' ? 'Saving…' : 'Approve'}
        </button>
        <button
          name="decision"
          value="reject"
          type="submit"
          disabled={pending}
          aria-busy={pending}
          onClick={() => setChosenDecision('reject')}
        >
          {pending && chosenDecision === 'reject' ? 'Saving…' : 'Reject'}
        </button>
        <button
          name="decision"
          value="correct"
          type="submit"
          disabled={pending}
          aria-busy={pending}
          onClick={() => setChosenDecision('correct')}
        >
          {pending && chosenDecision === 'correct' ? 'Saving…' : 'Save correction'}
        </button>
      </div>
    </form>
  );
}
