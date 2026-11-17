/** Shared title/scope defaults when seeding a quote from an enquiry or job. */

const SERVICE_NAMES: Record<string, string> = {
  ev_charger: 'EV charger installation',
  power_points: 'Power points',
  fault_finding: 'Fault finding',
  safety_inspection: 'Safety inspection',
  solar_battery: 'Solar & battery',
  switchboard: 'Switchboard',
  lighting: 'Lighting',
  commercial: 'Commercial electrical',
  maintenance: 'Maintenance',
  other: '',
};

const META_LINE =
  /^(call id|urgency|time preference|unverified preferred date|preferred date|contact preference):/i;

/** Human label for enquiry/job service categories; blank for generic "other". */
export function prettyServiceCategory(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (Object.prototype.hasOwnProperty.call(SERVICE_NAMES, raw)) return SERVICE_NAMES[raw];
  return raw.replaceAll('_', ' ');
}

/**
 * Drop intake/VAPI metadata lines from enquiry messages so quote descriptions
 * stay customer-facing (Call ID, Urgency, etc.).
 */
export function stripEnquiryMetaForQuoteScope(message: string | null | undefined): string {
  const lines = String(message || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((line) => !META_LINE.test(line));
  return lines.join('\n').trim();
}

export function buildQuoteTitleSeed(opts: {
  serviceCategory?: string | null;
  suburb?: string | null;
  jobTitle?: string | null;
  asVariation?: boolean;
  parentTitle?: string | null;
  scopeHint?: string | null;
}): string {
  const jobTitle = String(opts.jobTitle || '').trim();
  const parentTitle = String(opts.parentTitle || '').trim();
  const service = prettyServiceCategory(opts.serviceCategory);
  const suburb = String(opts.suburb || '').trim();
  const scopeHint = String(opts.scopeHint || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean);

  let base = '';
  if (opts.asVariation) {
    const core = parentTitle || jobTitle || service || scopeHint || 'Electrical work';
    base = `Variation — ${core}`;
  } else if (jobTitle) {
    base = jobTitle;
  } else if (service) {
    base = suburb ? `${service} · ${suburb}` : service;
  } else if (scopeHint) {
    base = scopeHint.length > 80 ? `${scopeHint.slice(0, 77)}…` : scopeHint;
  } else {
    base = suburb ? `Electrical work · ${suburb}` : 'Electrical work';
  }

  return base.slice(0, 200);
}
