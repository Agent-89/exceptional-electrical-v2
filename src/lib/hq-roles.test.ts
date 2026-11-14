import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canManageAdminOps,
  canManageOfficeOps,
  hqHomePath,
  isAdminRole,
  isHqRole,
  isOfficeRole,
  isTechnicianRole,
} from './hq-roles.ts';

describe('hq roles', () => {
  it('recognises the four HQ roles', () => {
    assert.equal(isHqRole('owner'), true);
    assert.equal(isHqRole('admin'), true);
    assert.equal(isHqRole('office'), true);
    assert.equal(isHqRole('technician'), true);
    assert.equal(isHqRole('electrician'), false);
  });

  it('gates office operations to owner/admin/office', () => {
    assert.equal(canManageOfficeOps('owner'), true);
    assert.equal(canManageOfficeOps('admin'), true);
    assert.equal(canManageOfficeOps('office'), true);
    assert.equal(canManageOfficeOps('technician'), false);
    assert.equal(isOfficeRole('technician'), false);
  });

  it('gates admin operations to owner/admin', () => {
    assert.equal(canManageAdminOps('owner'), true);
    assert.equal(canManageAdminOps('admin'), true);
    assert.equal(canManageAdminOps('office'), false);
    assert.equal(canManageAdminOps('technician'), false);
    assert.equal(isAdminRole('office'), false);
  });

  it('routes technicians to the tech Today home', () => {
    assert.equal(hqHomePath('technician'), '/hq/tech');
    assert.equal(hqHomePath('office'), '/hq');
    assert.equal(hqHomePath('admin'), '/hq');
    assert.equal(isTechnicianRole('technician'), true);
    assert.equal(isTechnicianRole('office'), false);
  });
});
