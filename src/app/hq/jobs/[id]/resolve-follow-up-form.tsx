'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { resolveFollowUpAction } from '@/app/field/actions';

export default function FollowUpActions({
  jobId,
  appointmentId,
  nextVisitId,
  nextVisitLabel,
}: {
  jobId: string;
  appointmentId: string;
  nextVisitId: string | null;
  nextVisitLabel: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolve(mode: 'linked_visit' | 'office_cleared', linkedId?: string | null) {
    if (pending) return;
    setError(null);
    const data = new FormData();
    data.set('job_id', jobId);
    data.set('appointment_id', appointmentId);
    data.set('resolution_mode', mode);
    if (mode === 'linked_visit' && linkedId) {
      data.set('linked_appointment_id', linkedId);
    }
    startTransition(async () => {
      const result = await resolveFollowUpAction(data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="ee-follow-up-actions">
      <div className="ee-follow-up-actions-row">
        {nextVisitId ? (
          <button
            type="button"
            className="hq-detail-action-primary"
            disabled={pending}
            onClick={() => resolve('linked_visit', nextVisitId)}
          >
            {pending ? 'Linking…' : 'Link next follow-up'}
          </button>
        ) : (
          <Link className="hq-detail-action-primary" href={`/hq/schedule?job=${encodeURIComponent(jobId)}`}>
            Schedule follow-up
          </Link>
        )}
        <button
          type="button"
          className="hq-detail-action-secondary"
          disabled={pending}
          onClick={() => resolve('office_cleared')}
        >
          No follow-up needed
        </button>
      </div>
      {nextVisitId && nextVisitLabel ? (
        <p className="ee-muted" style={{ margin: '6px 0 0' }}>
          Next visit: {nextVisitLabel}
        </p>
      ) : null}
      {error ? (
        <p className="ee-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
