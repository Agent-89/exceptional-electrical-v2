/** Accepts an empty string (no due date) or a calendar date as YYYY-MM-DD. */
export function isValidFollowUpDueDate(dueDate: string): boolean {
  return dueDate === '' || /^\d{4}-\d{2}-\d{2}$/.test(dueDate);
}
