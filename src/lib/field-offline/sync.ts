import {
  addTechnicianNoteAction,
  finishWorkAction,
  pauseWorkAction,
  resumeWorkAction,
  startWorkAction,
  updateVisitProgressAction,
} from '@/app/field/actions';
import { listOutboxItems, removeOutboxItem, updateOutboxItem } from './db';
import { payloadToFormData } from './outbox';
import type { FieldOutboxItem } from './types';

export type FieldSyncResult = {
  flushed: number;
  failed: number;
  remaining: number;
  lastError: string | null;
};

async function replayItem(item: FieldOutboxItem): Promise<{ ok: boolean; error?: string }> {
  const fd = payloadToFormData(item.payload);
  switch (item.action) {
    case 'start_work': {
      const result = await startWorkAction(fd);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    }
    case 'pause_work': {
      const result = await pauseWorkAction(fd);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    }
    case 'resume_work': {
      const result = await resumeWorkAction(fd);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    }
    case 'finish_work': {
      try {
        const result = await finishWorkAction(fd);
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      } catch (error) {
        // Successful finish redirects to the visit report anchor.
        if (
          typeof error === 'object' &&
          error !== null &&
          'digest' in error &&
          String((error as { digest?: string }).digest || '').startsWith('NEXT_REDIRECT')
        ) {
          return { ok: true };
        }
        throw error;
      }
    }
    case 'add_note': {
      const result = await addTechnicianNoteAction(fd);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    }
    case 'update_progress': {
      const result = await updateVisitProgressAction(fd);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    }
    default:
      return { ok: false, error: 'Unknown offline action' };
  }
}

/** Replay queued Field mutations in order. Stops on first hard failure after recording it. */
export async function flushFieldOutbox(): Promise<FieldSyncResult> {
  const items = await listOutboxItems();
  let flushed = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const item of items) {
    try {
      const result = await replayItem(item);
      if (result.ok) {
        await removeOutboxItem(item.id);
        flushed += 1;
        continue;
      }
      failed += 1;
      lastError = result.error || 'Sync failed';
      await updateOutboxItem({
        ...item,
        attempts: item.attempts + 1,
        lastError,
      });
      break;
    } catch (error) {
      failed += 1;
      lastError = error instanceof Error ? error.message : 'Sync failed';
      await updateOutboxItem({
        ...item,
        attempts: item.attempts + 1,
        lastError,
      });
      break;
    }
  }

  const remaining = (await listOutboxItems()).length;
  return { flushed, failed, remaining, lastError };
}
