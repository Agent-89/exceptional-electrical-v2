'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reviewTimeEntryAction } from '@/app/field/actions';
import { formatDurationMinutes } from '@/lib/tech-time-format';
import {
  allowedReviewDecisions,
  buildCorrectionTiming,
  inferBillableMode,
  type BillableMode,
  type ReviewTimeDecision,
} from '@/lib/review-time-entry';

export type TimeEntryReviewDefaults = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  breakMinutes: number;
  workedMinutes: number | null;
  billableMinutes: number | null;
  status?: string;
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
  billableMode: BillableMode;
  rejectionReason: string;
  startedAt: string;
  endedAt: string;
  breakMinutes: string;
  correctionNote: string;
};

function draftFromEntry(entry: TimeEntryReviewDefaults): Draft {
  const worked = entry.workedMinutes ?? 0;
  const mode = inferBillableMode(entry.billableMinutes, entry.workedMinutes);
  return {
    billableMinutes: String(entry.billableMinutes ?? worked),
    billableMode: mode,
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
    entry.status ?? '',
  ].join('|');
}

export default function TimeEntryReviewForm({
  entry,
  className,
  actionsClassName = 'ee-review-actions',
  onDirtyChange,
  onCancel,
  onSaved,
}: {
  entry: TimeEntryReviewDefaults;
  className?: string;
  actionsClassName?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel?: () => void;
  onSaved?: (result: {
    decision: ReviewTimeDecision;
    message: string;
    noop?: boolean;
  }) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFromEntry(entry));
  const [chosenDecision, setChosenDecision] = useState<ReviewTimeDecision | null>(null);

  const decisions = useMemo(
    () => allowedReviewDecisions(entry.status ?? 'submitted'),
    [entry.status],
  );

  const signature = entrySignature(entry);
  useEffect(() => {
    if (dirty) return;
    setDraft(draftFromEntry(entry));
  }, [signature, dirty, entry]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const markDirty = useCallback(() => {
    setDirty(true);
    setError(null);
    setSuccess(null);
  }, []);

  const timingPreview = useMemo(
    () => buildCorrectionTiming(draft.startedAt, draft.endedAt, draft.breakMinutes),
    [draft.startedAt, draft.endedAt, draft.breakMinutes],
  );
  const previewWorked = timingPreview.ok ? timingPreview.timing.workedMinutes : null;
  const previewElapsed = timingPreview.ok ? timingPreview.timing.elapsedMinutes : null;

  const syncTimingFields = useCallback(
    (patch: Partial<Pick<Draft, 'startedAt' | 'endedAt' | 'breakMinutes'>>) => {
      markDirty();
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        const timing = buildCorrectionTiming(next.startedAt, next.endedAt, next.breakMinutes);
        if (timing.ok && next.billableMode === 'auto') {
          next.billableMinutes = String(timing.timing.workedMinutes);
        }
        return next;
      });
    },
    [markDirty],
  );

  const onBillableChange = useCallback(
    (value: string) => {
      markDirty();
      setDraft((prev) => {
        const timing = buildCorrectionTiming(prev.startedAt, prev.endedAt, prev.breakMinutes);
        const worked = timing.ok ? timing.timing.workedMinutes : null;
        const numeric = Math.max(0, Number(value) || 0);
        const mode: BillableMode =
          worked != null && numeric === worked ? 'auto' : 'manual';
        return { ...prev, billableMinutes: value, billableMode: mode };
      });
    },
    [markDirty],
  );

  const resetBillableToWorked = useCallback(() => {
    markDirty();
    setDraft((prev) => {
      const timing = buildCorrectionTiming(prev.startedAt, prev.endedAt, prev.breakMinutes);
      const worked = timing.ok ? timing.timing.workedMinutes : 0;
      return { ...prev, billableMode: 'auto', billableMinutes: String(worked) };
    });
  }, [markDirty]);

  const submitDecision = useCallback(
    (decision: ReviewTimeDecision) => {
      if (pending) return;
      setChosenDecision(decision);
      setError(null);
      setSuccess(null);

      if (decision === 'correct' && !timingPreview.ok) {
        setError(timingPreview.error);
        return;
      }

      const data = new FormData();
      data.set('entry_id', entry.id);
      data.set('decision', decision);
      data.set('billable_minutes', draft.billableMinutes);
      data.set('billable_mode', draft.billableMode);
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
          return;
        }
        const message = result.message || 'Saved.';
        setError(null);
        setSuccess(message);
        setDirty(false);
        if (!result.noop) {
          setDraft((prev) => ({ ...prev, correctionNote: '', rejectionReason: '' }));
        }
        // Collapse only after the server confirms success — parent decides by decision.
        onSaved?.({ decision, message, noop: result.noop });
        router.refresh();
      });
    },
    [pending, entry.id, draft, router, timingPreview, onSaved],
  );

  const handleCancel = useCallback(() => {
    if (dirty) {
      const ok =
        typeof window === 'undefined' ||
        window.confirm('Discard unsaved time changes for this entry?');
      if (!ok) return;
    }
    setDraft(draftFromEntry(entry));
    setDirty(false);
    setError(null);
    setSuccess(null);
    onCancel?.();
  }, [dirty, entry, onCancel]);

  return (
    <form
      className={className ?? 'ee-edit-form ee-time-inline-form'}
      onSubmit={(event) => {
        event.preventDefault();
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
      <input type="hidden" name="billable_mode" value={draft.billableMode} readOnly />

      <label>
        Corrected start (Perth)
        <input
          type="datetime-local"
          name="started_at"
          value={draft.startedAt}
          onChange={(event) => syncTimingFields({ startedAt: event.target.value })}
        />
      </label>
      <label>
        Corrected end (Perth)
        <input
          type="datetime-local"
          name="ended_at"
          value={draft.endedAt}
          onChange={(event) => syncTimingFields({ endedAt: event.target.value })}
        />
      </label>
      <label>
        Break minutes
        <input
          type="number"
          name="break_minutes"
          min={0}
          value={draft.breakMinutes}
          onChange={(event) => syncTimingFields({ breakMinutes: event.target.value })}
        />
      </label>

      <div className="ee-time-calc" aria-live="polite">
        <p>
          <strong>Worked</strong>{' '}
          {previewWorked == null ? '—' : formatDurationMinutes(previewWorked)}
          {previewElapsed != null ? (
            <span className="ee-muted"> · Elapsed {formatDurationMinutes(previewElapsed)}</span>
          ) : null}
        </p>
        {!timingPreview.ok ? (
          <p className="ee-form-error" role="alert">
            {timingPreview.error}
          </p>
        ) : null}
      </div>

      <label>
        Billable minutes
        <input
          name="billable_minutes"
          type="number"
          min={0}
          value={draft.billableMinutes}
          onChange={(event) => onBillableChange(event.target.value)}
        />
      </label>
      <div className="ee-billable-mode">
        <span className={draft.billableMode === 'manual' ? 'ee-billable-manual' : 'ee-muted'}>
          {draft.billableMode === 'manual'
            ? 'Manual override — will not auto-update when times change'
            : 'Auto — matches worked time'}
        </span>
        {draft.billableMode === 'manual' ? (
          <button type="button" className="ee-text-action" onClick={resetBillableToWorked}>
            Reset to worked time
          </button>
        ) : null}
      </div>

      {decisions.includes('reject') ? (
        <label>
          Rejection reason
          <textarea
            name="rejection_reason"
            rows={2}
            maxLength={2000}
            value={draft.rejectionReason}
            onChange={(event) => {
              markDirty();
              setDraft((prev) => ({ ...prev, rejectionReason: event.target.value }));
            }}
          />
        </label>
      ) : null}
      {decisions.includes('correct') ? (
        <label>
          Correction note
          <textarea
            name="correction_note"
            rows={2}
            maxLength={2000}
            placeholder="Required when saving a correction"
            value={draft.correctionNote}
            onChange={(event) => {
              markDirty();
              setDraft((prev) => ({ ...prev, correctionNote: event.target.value }));
            }}
          />
        </label>
      ) : null}
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
        {decisions.includes('approve') ? (
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
        ) : null}
        {decisions.includes('reject') ? (
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
        ) : null}
        {decisions.includes('correct') ? (
          <button
            name="decision"
            value="correct"
            type="submit"
            disabled={pending || !timingPreview.ok}
            aria-busy={pending}
            onClick={() => setChosenDecision('correct')}
          >
            {pending && chosenDecision === 'correct' ? 'Saving…' : 'Save correction'}
          </button>
        ) : null}
        {onCancel ? (
          <button type="button" className="ee-review-cancel" onClick={handleCancel} disabled={pending}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
