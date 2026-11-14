import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  customerMatchesContact,
  findCustomerMatches,
  isUsableCustomerPhone,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
  type CustomerMatchRecord,
} from './customer-match.ts';

const customers: CustomerMatchRecord[] = [
  { id: 'a', name: 'Alex Smith', email: 'Alex@Example.com', phone: '0412 345 678' },
  { id: 'b', name: 'Bailey Jones', email: 'bailey@example.com', phone: '+61412345678' },
  { id: 'c', name: 'Casey Lee', email: null, phone: '0899991111' },
  { id: 'd', name: 'Drew Park', email: 'drew@example.com', phone: '12' },
];

describe('normalizeCustomerEmail', () => {
  it('trims and lowercases email addresses', () => {
    assert.equal(normalizeCustomerEmail('  Alex@Example.com '), 'alex@example.com');
  });
});

describe('normalizeCustomerPhone', () => {
  it('strips non-digits and maps 61XXXXXXXXX to local 0XXXXXXXXX', () => {
    assert.equal(normalizeCustomerPhone('0412 345 678'), '0412345678');
    assert.equal(normalizeCustomerPhone('+61 412 345 678'), '0412345678');
    assert.equal(normalizeCustomerPhone('61412345678'), '0412345678');
  });
});

describe('isUsableCustomerPhone', () => {
  it('requires at least eight normalised digits', () => {
    assert.equal(isUsableCustomerPhone('0412345678'), true);
    assert.equal(isUsableCustomerPhone('1234567'), false);
  });
});

describe('customerMatchesContact', () => {
  it('matches on email ignoring case and whitespace', () => {
    assert.equal(customerMatchesContact(customers[0], 'alex@example.com', ''), true);
    assert.equal(customerMatchesContact(customers[0], 'other@example.com', ''), false);
  });

  it('matches Australian phone variants for the same mobile number', () => {
    assert.equal(customerMatchesContact(customers[0], '', '+61 412 345 678'), true);
    assert.equal(customerMatchesContact(customers[1], '', '0412 345 678'), true);
  });

  it('ignores short phone fragments for matching', () => {
    assert.equal(customerMatchesContact(customers[3], '', '12'), false);
  });
});

describe('findCustomerMatches', () => {
  it('returns a single match for a shared email', () => {
    const matches = findCustomerMatches(customers, 'bailey@example.com', '');
    assert.deepEqual(matches.map((m) => m.id), ['b']);
  });

  it('returns multiple matches when email and phone hit different customers', () => {
    const matches = findCustomerMatches(customers, 'alex@example.com', '0899991111');
    assert.deepEqual(matches.map((m) => m.id).sort(), ['a', 'c']);
  });

  it('returns multiple matches when the same mobile is stored in different formats', () => {
    const matches = findCustomerMatches(customers, '', '0412345678');
    assert.deepEqual(matches.map((m) => m.id).sort(), ['a', 'b']);
  });

  it('excludes the customer being edited from match results', () => {
    const matches = findCustomerMatches(customers, 'alex@example.com', '0412345678', 'a');
    assert.deepEqual(matches.map((m) => m.id), ['b']);
  });

  it('returns no matches when contact details are unique', () => {
    assert.deepEqual(findCustomerMatches(customers, 'unique@example.com', '0400111222'), []);
  });
});
