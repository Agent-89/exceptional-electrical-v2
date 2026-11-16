'use client';

import { useTransition } from 'react';
import { unlinkQuoteConfirmMessage } from '@/lib/job-quotes';
import { unlinkQuoteFromJob } from '../job-quote-actions';

export default function UnlinkJobQuoteButton({
  jobId,
  quoteId,
  quoteNumber,
  isPrimary,
}: {
  jobId: string;
  quoteId: string;
  quoteNumber: string;
  isPrimary: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="ee-text-action"
      disabled={pending}
      onClick={() => {
        const confirmed = window.confirm(
          unlinkQuoteConfirmMessage({ quoteNumber, isPrimary }),
        );
        if (!confirmed) return;
        const formData = new FormData();
        formData.set('job_id', jobId);
        formData.set('quote_id', quoteId);
        formData.set('confirm_unlink', 'yes');
        startTransition(() => {
          void unlinkQuoteFromJob(formData);
        });
      }}
    >
      {pending ? 'Unlinking…' : 'Unlink'}
    </button>
  );
}
