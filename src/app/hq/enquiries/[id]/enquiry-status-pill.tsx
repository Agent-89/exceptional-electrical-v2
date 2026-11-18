'use client';

import {useEffect,useId,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {ChevronDown} from 'lucide-react';
import {
  ENQUIRY_STATUSES,
  enquiryStatusLabel,
  normalizeEnquiryStatus,
  type EnquiryStatus,
} from '@/lib/enquiry-status';
import {saveEnquiryStatus} from '../../actions';

export default function EnquiryStatusPill({
  enquiryId,
  initialStatus,
}: {
  enquiryId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<EnquiryStatus>(() => normalizeEnquiryStatus(initialStatus));
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setStatus(normalizeEnquiryStatus(initialStatus));
  }, [initialStatus]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function pick(next: EnquiryStatus) {
    setOpen(false);
    if (next === status || pending) return;
    setMessage('');
    startTransition(async () => {
      try {
        const result = await saveEnquiryStatus(enquiryId, next);
        if (!result.ok) {
          setMessage(result.message || 'Unable to save status');
          return;
        }
        setStatus(normalizeEnquiryStatus(result.status ?? next));
        router.refresh();
      } catch {
        setMessage('Unable to save status');
      }
    });
  }

  return (
    <div className="hq-status-pill" ref={rootRef}>
      <button
        type="button"
        className={`hq-status hq-status-${status} hq-status-pill-trigger`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Enquiry status: ${enquiryStatusLabel(status)}. Change status`}
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{pending ? 'Saving…' : enquiryStatusLabel(status)}</span>
        <ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
      {open ? (
        <ul id={listId} role="listbox" className="hq-status-pill-menu" aria-label="Enquiry statuses">
          {ENQUIRY_STATUSES.map((option) => (
            <li key={option} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option === status}
                className={`hq-status-pill-option${option === status ? ' is-selected' : ''}`}
                onClick={() => pick(option)}
              >
                {enquiryStatusLabel(option)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className="hq-status-pill-feedback" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
