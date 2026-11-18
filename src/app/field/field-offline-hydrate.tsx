'use client';

import { useEffect } from 'react';
import { saveTodaySnapshot, saveVisitSnapshot } from '@/lib/field-offline/db';
import type { FieldDayVisitSnapshot, FieldVisitSnapshot } from '@/lib/field-offline/types';

export function HydrateTodaySnapshot(props: {
  staffId: string;
  crewName: string;
  dayKey: string;
  visits: FieldDayVisitSnapshot[];
}) {
  useEffect(() => {
    void saveTodaySnapshot({
      staffId: props.staffId,
      crewName: props.crewName,
      dayKey: props.dayKey,
      savedAt: new Date().toISOString(),
      visits: props.visits,
    }).catch(() => {
      /* offline cache best-effort */
    });
  }, [props.staffId, props.crewName, props.dayKey, props.visits]);
  return null;
}

export function HydrateVisitSnapshot(props: {
  staffId: string;
  snapshot: Omit<FieldVisitSnapshot, 'savedAt'>;
}) {
  useEffect(() => {
    void saveVisitSnapshot({
      ...props.snapshot,
      staffId: props.staffId,
      savedAt: new Date().toISOString(),
    }).catch(() => {
      /* offline cache best-effort */
    });
  }, [props.staffId, props.snapshot]);
  return null;
}
