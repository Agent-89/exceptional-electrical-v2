/** Pure eligibility checks for empty / no-merit hard deletes. */

export type EmptyDeleteVerdict = {
  eligible: boolean;
  blockers: string[];
};

export type JobEmptyFacts = {
  appointmentCount: number;
  timeEntryCount: number;
  jobQuoteCount: number;
  noteCount: number;
  attachmentCount: number;
  /** Activity rows that are not the initial create event. */
  meaningfulActivityCount: number;
};

export type QuoteEmptyFacts = {
  status: string;
  jobQuoteCount: number;
  childVariationCount: number;
  isCommercialCurrent: boolean;
  meaningfulActivityCount: number;
};

export type EnquiryEmptyFacts = {
  customerId: string | null;
  linkedQuoteCount: number;
  linkedJobCount: number;
};

export type CustomerEmptyFacts = {
  jobCount: number;
  quoteCount: number;
  enquiryCount: number;
  noteCount: number;
};

export type VisitEmptyFacts = {
  timeEntryCount: number;
  fieldStatus: string | null;
  fieldCompletionNote: string | null;
  fieldOutstandingWork: string | null;
  fieldIssues: string | null;
  fieldFollowUpRequired: boolean;
  techReportCount: number;
};

function verdict(blockers: string[]): EmptyDeleteVerdict {
  return { eligible: blockers.length === 0, blockers };
}

function countBlocker(count: number, singular: string, plural?: string): string | null {
  if (count <= 0) return null;
  if (count === 1) return `Has 1 ${singular}`;
  return `Has ${count} ${plural ?? singular + 's'}`;
}

/** Job hard-delete only when nothing of operational merit exists. */
export function evaluateJobEmptyDelete(facts: JobEmptyFacts): EmptyDeleteVerdict {
  const blockers = [
    countBlocker(facts.appointmentCount, 'visit'),
    countBlocker(facts.timeEntryCount, 'time entry', 'time entries'),
    countBlocker(facts.jobQuoteCount, 'linked quote'),
    countBlocker(facts.noteCount, 'note'),
    countBlocker(facts.attachmentCount, 'attachment'),
    countBlocker(facts.meaningfulActivityCount, 'activity record'),
  ].filter((item): item is string => Boolean(item));
  return verdict(blockers);
}

/** Quote hard-delete only for unused drafts. */
export function evaluateQuoteEmptyDelete(facts: QuoteEmptyFacts): EmptyDeleteVerdict {
  const blockers: string[] = [];
  if (facts.status !== 'draft') blockers.push(`Status is ${facts.status.replaceAll('_', ' ')} (draft only)`);
  if (facts.isCommercialCurrent) blockers.push('Marked as commercial current');
  const counted = [
    countBlocker(facts.jobQuoteCount, 'linked job'),
    countBlocker(facts.childVariationCount, 'child variation'),
    countBlocker(facts.meaningfulActivityCount, 'activity record'),
  ].filter((item): item is string => Boolean(item));
  return verdict([...blockers, ...counted]);
}

/** Enquiry hard-delete only when never linked to customer, quote, or job. */
export function evaluateEnquiryEmptyDelete(facts: EnquiryEmptyFacts): EmptyDeleteVerdict {
  const blockers: string[] = [];
  if (facts.customerId) blockers.push('Linked to a customer');
  const counted = [
    countBlocker(facts.linkedQuoteCount, 'linked quote'),
    countBlocker(facts.linkedJobCount, 'linked job'),
  ].filter((item): item is string => Boolean(item));
  return verdict([...blockers, ...counted]);
}

/** Customer hard-delete only with no operational history. */
export function evaluateCustomerEmptyDelete(facts: CustomerEmptyFacts): EmptyDeleteVerdict {
  const blockers = [
    countBlocker(facts.jobCount, 'job'),
    countBlocker(facts.quoteCount, 'quote'),
    countBlocker(facts.enquiryCount, 'enquiry', 'enquiries'),
    countBlocker(facts.noteCount, 'note'),
  ].filter((item): item is string => Boolean(item));
  return verdict(blockers);
}

const VISIT_FIELD_STATUSES_WITH_WORK = new Set([
  'in_progress',
  'paused',
  'work_completed',
  'unable_to_complete',
]);

/** Visit hard-delete only when never worked / reported. */
export function evaluateVisitEmptyDelete(facts: VisitEmptyFacts): EmptyDeleteVerdict {
  const blockers: string[] = [];
  if (facts.timeEntryCount > 0) {
    blockers.push(countBlocker(facts.timeEntryCount, 'time entry', 'time entries')!);
  }
  if (facts.fieldStatus && VISIT_FIELD_STATUSES_WITH_WORK.has(facts.fieldStatus)) {
    blockers.push(`Field status is ${facts.fieldStatus.replaceAll('_', ' ')}`);
  }
  if (facts.fieldCompletionNote?.trim()) blockers.push('Has a completion note');
  if (facts.fieldOutstandingWork?.trim()) blockers.push('Has outstanding work notes');
  if (facts.fieldIssues?.trim()) blockers.push('Has field issues recorded');
  if (facts.fieldFollowUpRequired) blockers.push('Follow-up was flagged');
  if (facts.techReportCount > 0) {
    blockers.push(countBlocker(facts.techReportCount, 'technician report')!);
  }
  return verdict(blockers);
}

export function formatEmptyDeleteBlockers(blockers: string[]): string {
  if (!blockers.length) return 'This record can be permanently deleted.';
  return `Cannot delete: ${blockers.join('; ')}.`;
}
