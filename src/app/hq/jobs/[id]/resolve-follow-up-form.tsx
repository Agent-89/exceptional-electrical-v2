'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolveFollowUpAction } from '@/app/hq/tech/actions';

type LinkOption = {
  id: string;
  label: string;
};

export default function ResolveFollowUpForm({
  jobId,
  appointmentId,
  linkOptions,
}: {
  jobId: string;
  appointmentId: string;
  linkOptions: LinkOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'office_cleared' | 'linked_visit'>('office_cleared');
  const [linkedId, setLinkedId] = useState(linkOptions[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <form
      className="ee-edit-form ee-follow-up-resolve"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        setError(null);
        setSuccess(null);
        const data = new FormData();
        data.set('job_id', jobId);
        data.set('appointment_id', appointmentId);
        data.set('resolution_mode', mode);
        data.set('resolution_note', note);
        if (mode === 'linked_visit' && linkedId) data.set('linked_appointment_id', linkedId);
        startTransition(async () => {
          const result = await resolveFollowUpAction(data);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSuccess(result.message || 'Resolved.');
          setNote('');
          router.refresh();
        });
      }}
    >
      <strong>Resolve further visit</strong>
      <p className="ee-muted" style={{ margin: 0 }}>
        Keeps the original technician report. Does not create a new appointment.
      </p>
      <label>
        Resolution
        <select
          value={mode}
          disabled={pending}
          onChange={(event) => setMode(event.target.value as 'office_cleared' | 'linked_visit')}
        >
          <option value="office_cleared">Mark resolved (no further visit needed)</option>
          <option value="linked_visit">Link an existing follow-up appointment</option>
        </select>
      </label>
      {mode === 'linked_visit' ? (
        <label>
          Follow-up appointment
          {linkOptions.length ? (
            <select
              value={linkedId}
              disabled={pending}
              onChange={(event) => setLinkedId(event.target.value)}
            >
              {linkOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="ee-muted">Schedule a later visit on this job first, then link it here.</span>
          )}
        </label>
      ) : null}
      <label>
        Resolution note
        <textarea
          rows={2}
          maxLength={2000}
          value={note}
          disabled={pending}
          placeholder="Why is this further visit cleared or covered?"
          onChange={(event) => setNote(event.target.value)}
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
      <button
        className="hq-detail-action-primary"
        type="submit"
        disabled={pending || (mode === 'linked_visit' && !linkOptions.length)}
      >
        {pending ? 'Saving…' : 'Resolve further visit'}
      </button>
    </form>
  );
}
