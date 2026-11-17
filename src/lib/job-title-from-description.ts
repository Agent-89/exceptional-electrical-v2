/** Derive a short jobs.title from work description (create-job no longer collects title). */
export function jobTitleFromDescription(description: string, fallback = 'Electrical work'): string {
  const normalized = String(description || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return fallback.slice(0, 200);

  const firstLine = (normalized.split('\n')[0] || normalized).replace(/\s+/g, ' ').trim();
  const sentenceMatch = firstLine.match(/^(.+?[.!?])(?:\s|$)/);
  const candidate = (sentenceMatch?.[1] || firstLine).trim();
  if (candidate.length < 2) return fallback.slice(0, 200);
  if (candidate.length <= 200) return candidate;
  return `${candidate.slice(0, 197).trimEnd()}…`;
}
