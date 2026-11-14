export type CustomerMatchRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

/** Trim and lowercase for consistent email matching and storage. */
export function normalizeCustomerEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Strip non-digits and map +61 / 61XXXXXXXXX mobile forms to local 0XXXXXXXXX.
 * Matches the enquiry conversion RPC normalisation rules.
 */
export function normalizeCustomerPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('61')) {
    digits = '0' + digits.slice(2);
  }
  return digits;
}

export function isUsableCustomerPhone(normalizedPhone: string): boolean {
  return normalizedPhone.length >= 8;
}

export function customerMatchesContact(
  customer: Pick<CustomerMatchRecord, 'email' | 'phone'>,
  email: string,
  phone: string
): boolean {
  const normalizedEmail = normalizeCustomerEmail(email);
  const normalizedPhone = normalizeCustomerPhone(phone);
  const emailMatch =
    normalizedEmail !== '' &&
    normalizeCustomerEmail(String(customer.email ?? '')) === normalizedEmail;
  const phoneMatch =
    isUsableCustomerPhone(normalizedPhone) &&
    normalizeCustomerPhone(String(customer.phone ?? '')) === normalizedPhone;
  return emailMatch || phoneMatch;
}

/** Returns all matching customers, optionally excluding one id (edit-self). */
export function findCustomerMatches(
  customers: CustomerMatchRecord[],
  email: string,
  phone: string,
  excludeId?: string
): CustomerMatchRecord[] {
  return customers.filter(
    (customer) =>
      customer.id !== excludeId && customerMatchesContact(customer, email, phone)
  );
}
