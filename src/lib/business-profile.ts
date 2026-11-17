/** Seller identity for quotes/invoices. Single-tenant constants — update here when details change. */
export const businessProfile = {
  tradingName: 'Exceptional Electrical Services',
  shortName: 'Exceptional Electrical',
  abn: '73 907 324 963',
  electricalLicence: 'EC 7298',
  phone: '0413 781 938',
  /** Replace with full postal address when confirmed. */
  addressLines: ['Perth, Western Australia'] as readonly string[],
} as const;

export function formatAbnDisplay(abn = businessProfile.abn) {
  return `ABN ${abn}`;
}

export function formatLicenceDisplay(licence = businessProfile.electricalLicence) {
  return `Licence ${licence}`;
}

export function formatPhoneDisplay(phone = businessProfile.phone) {
  return phone;
}

/** Compact letterhead lines under the logo (preview + PDF). */
export function letterheadDetailLines() {
  return [
    formatLicenceDisplay(),
    formatAbnDisplay(),
    formatPhoneDisplay(),
  ] as const;
}

/** Footer identity block for customer documents. */
export function documentFooterIdentityLines() {
  return [
    businessProfile.tradingName,
    ...businessProfile.addressLines,
    formatPhoneDisplay(),
    `${formatAbnDisplay()} · ${formatLicenceDisplay()}`,
  ] as const;
}
