/** Unified job notes + photo updates for the office More tab. */

export type JobUpdateNote = {
  id: string;
  body: string;
  authorName: string | null;
  visibility: string;
  createdAt: string;
};

export type JobUpdatePhoto = {
  id: string;
  signedUrl: string | null;
  caption: string | null;
  uploadedByName: string | null;
  contentType: string;
  createdAt: string;
  jobNoteId?: string | null;
};

export type JobUpdateCard =
  | {
      kind: 'note';
      id: string;
      createdAt: string;
      note: JobUpdateNote;
      photos: JobUpdatePhoto[];
    }
  | {
      kind: 'photos';
      id: string;
      createdAt: string;
      photos: JobUpdatePhoto[];
    };

function isImage(contentType: string): boolean {
  return contentType.trim().toLowerCase().startsWith('image/');
}

/**
 * Build a single feed:
 * - notes with linked photos (via job_note_id) become one card
 * - standalone notes stay note-only cards
 * - unlinked photos become photo cards
 * Existing records without job_note_id continue to render correctly.
 */
export function buildJobUpdateCards(
  notes: JobUpdateNote[],
  photos: JobUpdatePhoto[],
): JobUpdateCard[] {
  const imagePhotos = photos.filter((photo) => isImage(photo.contentType));
  const linked = new Map<string, JobUpdatePhoto[]>();
  const standalone: JobUpdatePhoto[] = [];

  for (const photo of imagePhotos) {
    const noteId = photo.jobNoteId?.trim() || null;
    if (noteId) {
      const list = linked.get(noteId) ?? [];
      list.push(photo);
      linked.set(noteId, list);
      continue;
    }
    standalone.push(photo);
  }

  const cards: JobUpdateCard[] = [];

  for (const note of notes) {
    const attached = (linked.get(note.id) ?? []).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    linked.delete(note.id);
    cards.push({
      kind: 'note',
      id: `note-${note.id}`,
      createdAt: note.createdAt,
      note,
      photos: attached,
    });
  }

  // Photos pointing at a missing/deleted note still show as photo cards.
  for (const orphaned of linked.values()) {
    for (const photo of orphaned) {
      cards.push({
        kind: 'photos',
        id: `photo-${photo.id}`,
        createdAt: photo.createdAt,
        photos: [photo],
      });
    }
  }

  for (const photo of standalone) {
    cards.push({
      kind: 'photos',
      id: `photo-${photo.id}`,
      createdAt: photo.createdAt,
      photos: [photo],
    });
  }

  return cards.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function countJobUpdateAssets(
  notes: JobUpdateNote[],
  photos: JobUpdatePhoto[],
): { notes: number; photos: number; documents: number } {
  const images = photos.filter((photo) => isImage(photo.contentType));
  const documents = photos.filter((photo) => !isImage(photo.contentType));
  return { notes: notes.length, photos: images.length, documents: documents.length };
}
