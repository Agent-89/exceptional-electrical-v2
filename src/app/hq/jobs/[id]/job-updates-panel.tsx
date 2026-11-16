'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  buildJobUpdateCards,
  countJobUpdateAssets,
  type JobUpdateNote,
  type JobUpdatePhoto,
} from '@/lib/job-updates';
import { addOfficeJobUpdateAction } from '@/app/hq/tech/actions';
import HqToast, { type HqToastMessage } from '../../hq-toast';

function perthWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Perth',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function JobUpdatesPanel({
  jobId,
  notes,
  photos,
}: {
  jobId: string;
  notes: JobUpdateNote[];
  photos: JobUpdatePhoto[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<HqToastMessage | null>(null);
  const dismiss = useCallback(() => setToast(null), []);
  const cards = useMemo(() => buildJobUpdateCards(notes, photos), [notes, photos]);
  const counts = useMemo(() => countJobUpdateAssets(notes, photos), [notes, photos]);
  const documents = photos.filter((photo) => !photo.contentType.toLowerCase().startsWith('image/'));

  return (
    <section className="hq-panel ee-compact-panel" id="notes-photos">
      <div className="ee-section-title">
        <div>
          <span className="ee-eyebrow">UPDATES</span>
          <h2>Notes and photos</h2>
        </div>
        <span className="ee-muted">
          {counts.notes} note{counts.notes === 1 ? '' : 's'} · {counts.photos} photo
          {counts.photos === 1 ? '' : 's'}
          {counts.documents ? ` · ${counts.documents} document${counts.documents === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      <details className="ee-expand ee-job-row" open>
        <summary>
          <span className="ee-job-row-main">
            <strong>Add update</strong>
            <span className="ee-muted">Note only, photos only, or a note with photos</span>
          </span>
          <span className="ee-expand-mark" aria-hidden="true">
            ＋
          </span>
        </summary>
        <div className="ee-job-row-body">
          <form
            className="ee-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (pending) return;
              const form = event.currentTarget;
              const data = new FormData(form);
              startTransition(async () => {
                const result = await addOfficeJobUpdateAction(data);
                if (result.ok) {
                  setToast({ id: Date.now(), tone: 'success', text: result.message });
                  form.reset();
                  router.refresh();
                } else {
                  setToast({
                    id: Date.now(),
                    tone: 'error',
                    text: result.error || 'Unable to save update.',
                  });
                }
              });
            }}
          >
            <input type="hidden" name="job_id" value={jobId} />
            <label>
              Note (optional if photos are attached)
              <textarea name="body" maxLength={4000} rows={3} placeholder="What should the team know?" />
            </label>
            <label>
              Visibility
              <select name="visibility" defaultValue="office_only">
                <option value="office_only">Office only</option>
                <option value="shared">Shared with technicians</option>
              </select>
            </label>
            <label>
              Photos (optional)
              <input name="photos" type="file" accept="image/*" multiple capture="environment" />
            </label>
            <p className="ee-muted" style={{ margin: 0 }}>
              You can save a note, photos, or both. Linked note+photo grouping activates after the
              approved database update; until then photos still save safely.
            </p>
            <button className="hq-detail-action-primary" type="submit" disabled={pending} aria-busy={pending}>
              {pending ? 'Saving…' : 'Save update'}
            </button>
          </form>
        </div>
      </details>

      {cards.length ? (
        <div className="ee-update-feed">
          {cards.map((card) => (
            <article className="ee-update-card" key={card.id}>
              <header>
                {card.kind === 'note' ? (
                  <strong>
                    {card.note.authorName ?? 'Staff'} ·{' '}
                    {card.note.visibility === 'office_only' ? 'Office only' : 'Shared'}
                  </strong>
                ) : (
                  <strong>
                    {card.photos[0]?.uploadedByName ?? 'Staff'} · Photo
                    {card.photos.length > 1 ? 's' : ''}
                  </strong>
                )}
                <small>{perthWhen(card.createdAt)}</small>
              </header>
              {card.kind === 'note' ? <p>{card.note.body}</p> : null}
              {card.photos.length ? (
                <div className="ee-photo-grid">
                  {card.photos.map((photo) =>
                    photo.signedUrl ? (
                      <figure key={photo.id}>
                        <a
                          href={photo.signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={
                            [
                              photo.caption,
                              photo.uploadedByName ? `Uploaded by ${photo.uploadedByName}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Job photo'
                          }
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.signedUrl} alt={photo.caption || 'Job photo'} />
                        </a>
                        <figcaption className="ee-muted">
                          {photo.uploadedByName ?? 'Unknown uploader'}
                          {photo.caption ? ` · ${photo.caption}` : ''}
                        </figcaption>
                      </figure>
                    ) : null,
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="ee-muted">No notes or photos yet.</p>
      )}

      {documents.length ? (
        <details className="ee-expand ee-job-row">
          <summary>
            <span className="ee-job-row-main">
              <strong>Documents</strong>
              <span className="ee-muted">{documents.length} on file</span>
            </span>
            <span className="ee-expand-mark" aria-hidden="true">
              ＋
            </span>
          </summary>
          <div className="ee-job-row-body">
            {documents.map((file) => (
              <div className="ee-visit" key={file.id}>
                <strong>{file.caption || 'Document'}</strong>
                <span>
                  {file.uploadedByName ?? 'Unknown uploader'}
                  {file.contentType ? ` · ${file.contentType}` : ''}
                </span>
                {file.signedUrl ? (
                  <a href={file.signedUrl} target="_blank" rel="noopener noreferrer">
                    Open document ↗
                  </a>
                ) : (
                  <span>Preview unavailable</span>
                )}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <HqToast toast={toast} onDismiss={dismiss} />
    </section>
  );
}
