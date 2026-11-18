import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fieldHomePath,
  loginPathForReturn,
  resolvePostAuthPath,
  sanitizeReturnPath,
  sessionRefreshPath,
} from './hq-return-path.ts';

describe('hq return path', () => {
  it('sanitises only relative hq/field paths', () => {
    assert.equal(sanitizeReturnPath('/field'), '/field');
    assert.equal(sanitizeReturnPath('/field/jobs'), '/field/jobs');
    assert.equal(sanitizeReturnPath('/hq'), '/hq');
    assert.equal(sanitizeReturnPath('/hq/tech/visits/1'), '/field/visits/1');
    assert.equal(sanitizeReturnPath('https://evil.example/'), null);
    assert.equal(sanitizeReturnPath('//evil.example'), null);
    assert.equal(sanitizeReturnPath('/marketing'), null);
  });

  it('sends technicians to Field after auth', () => {
    assert.equal(resolvePostAuthPath({ role: 'technician' }), '/field');
    assert.equal(resolvePostAuthPath({ role: 'technician', next: '/hq' }), '/field');
    assert.equal(resolvePostAuthPath({ role: 'technician', next: '/field/jobs' }), '/field/jobs');
  });

  it('honours Field next for office roles and defaults office to HQ', () => {
    assert.equal(resolvePostAuthPath({ role: 'admin' }), '/hq');
    assert.equal(resolvePostAuthPath({ role: 'admin', next: '/field' }), '/field');
    assert.equal(resolvePostAuthPath({ role: 'owner', next: '/hq/jobs' }), '/hq/jobs');
    assert.equal(resolvePostAuthPath({ role: 'office', next: '/hq/tech' }), '/field');
  });

  it('picks login and session URLs from return context', () => {
    assert.equal(fieldHomePath(), '/field');
    assert.equal(loginPathForReturn('/field'), '/field/login');
    assert.equal(loginPathForReturn('/hq'), '/hq/login');
    assert.equal(sessionRefreshPath('/field/jobs'), '/hq/session?next=%2Ffield%2Fjobs');
  });
});
