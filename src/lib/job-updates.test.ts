import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildJobUpdateCards, countJobUpdateAssets } from './job-updates.ts';

describe('job updates feed', () => {
  it('keeps standalone notes and photos as separate cards', () => {
    const cards = buildJobUpdateCards(
      [
        {
          id: 'n1',
          body: 'Site access via rear gate',
          authorName: 'Office',
          visibility: 'office_only',
          createdAt: '2026-11-16T02:00:00.000Z',
        },
      ],
      [
        {
          id: 'p1',
          signedUrl: 'https://example.test/p1.jpg',
          caption: 'Board before',
          uploadedByName: 'Sam',
          contentType: 'image/jpeg',
          createdAt: '2026-11-16T03:00:00.000Z',
          jobNoteId: null,
        },
      ],
    );
    assert.equal(cards.length, 2);
    assert.equal(cards[0].kind, 'photos');
    assert.equal(cards[1].kind, 'note');
    if (cards[1].kind === 'note') assert.equal(cards[1].photos.length, 0);
  });

  it('groups linked photos under their note without orphaning unlinked ones', () => {
    const cards = buildJobUpdateCards(
      [
        {
          id: 'n1',
          body: 'Switchboard tidy complete',
          authorName: 'Office',
          visibility: 'shared',
          createdAt: '2026-11-16T02:00:00.000Z',
        },
      ],
      [
        {
          id: 'p1',
          signedUrl: 'https://example.test/p1.jpg',
          caption: null,
          uploadedByName: 'Sam',
          contentType: 'image/jpeg',
          createdAt: '2026-11-16T02:05:00.000Z',
          jobNoteId: 'n1',
        },
        {
          id: 'p2',
          signedUrl: 'https://example.test/p2.jpg',
          caption: 'Extra',
          uploadedByName: 'Sam',
          contentType: 'image/jpeg',
          createdAt: '2026-11-16T04:00:00.000Z',
          jobNoteId: null,
        },
      ],
    );
    assert.equal(cards.length, 2);
    const noteCard = cards.find((card) => card.kind === 'note');
    const photoCard = cards.find((card) => card.kind === 'photos');
    assert.ok(noteCard && noteCard.kind === 'note');
    assert.equal(noteCard.photos.map((photo) => photo.id).join(','), 'p1');
    assert.ok(photoCard && photoCard.kind === 'photos');
    assert.equal(photoCard.photos[0].id, 'p2');
  });

  it('counts notes, photos and non-image documents separately', () => {
    const counts = countJobUpdateAssets(
      [
        {
          id: 'n1',
          body: 'Note',
          authorName: null,
          visibility: 'shared',
          createdAt: '2026-11-16T02:00:00.000Z',
        },
      ],
      [
        {
          id: 'p1',
          signedUrl: null,
          caption: null,
          uploadedByName: null,
          contentType: 'image/png',
          createdAt: '2026-11-16T02:00:00.000Z',
        },
        {
          id: 'd1',
          signedUrl: null,
          caption: 'spec',
          uploadedByName: null,
          contentType: 'application/pdf',
          createdAt: '2026-11-16T02:00:00.000Z',
        },
      ],
    );
    assert.deepEqual(counts, { notes: 1, photos: 1, documents: 1 });
  });
});
