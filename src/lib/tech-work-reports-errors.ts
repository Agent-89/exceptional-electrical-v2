type DbErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

/**
 * True only when the tech-reports relation itself is absent.
 * Must NOT treat column/constraint/permission failures as “missing table”,
 * or a failed/partial migration would silently look like “no reports”.
 */
export function isMissingTechReportsRelation(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
  if (!msg.includes('job_appointment_tech_reports') && code !== '42P01') return false;
  // Column-level schema problems must surface (partial migration).
  if (msg.includes('column')) return false;
  if (code === '42P01') return true;
  if (msg.includes('could not find the table')) return true;
  if (msg.includes('relation') && msg.includes('does not exist')) return true;
  if (msg.includes('table') && msg.includes('does not exist')) return true;
  return false;
}

export const TECH_REPORTS_MIGRATION_REQUIRED =
  'Technician work reports are unavailable because the reporting migration is not applied.';
