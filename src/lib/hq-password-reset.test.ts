import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HQ_PASSWORD_RESET_PATH,
  isAllowedHqOrigin,
  isStrongPassword,
  originFromRequestHeaders,
  resolvePasswordResetRedirect,
} from './hq-password-reset.ts';

describe('HQ password reset redirects', () => {
  it('allowlists localhost, production, and this project preview hosts only', () => {
    assert.equal(isAllowedHqOrigin('http://localhost:3000'), true);
    assert.equal(isAllowedHqOrigin('http://127.0.0.1:3000'), true);
    assert.equal(isAllowedHqOrigin('https://exceptional-electrical-v2.vercel.app'), true);
    assert.equal(
      isAllowedHqOrigin(
        'https://exceptional-electrical-v2-git-fe-ed8d9f-bbdhicks-5600s-projects.vercel.app',
      ),
      true,
    );
    assert.equal(isAllowedHqOrigin('https://evil.example'), false);
    assert.equal(isAllowedHqOrigin('https://exceptional-electrical-v2.vercel.app.evil.com'), false);
    assert.equal(isAllowedHqOrigin('javascript:alert(1)'), false);
  });

  it('builds reset URLs only for allowlisted origins', () => {
    assert.equal(
      resolvePasswordResetRedirect(
        'https://exceptional-electrical-v2-git-fe-ed8d9f-bbdhicks-5600s-projects.vercel.app',
      ),
      'https://exceptional-electrical-v2-git-fe-ed8d9f-bbdhicks-5600s-projects.vercel.app' +
        HQ_PASSWORD_RESET_PATH,
    );
    assert.equal(resolvePasswordResetRedirect('https://attacker.example'), null);
  });

  it('derives origin from forwarded headers', () => {
    assert.equal(
      originFromRequestHeaders({
        host: 'localhost:3000',
        forwardedHost: null,
        forwardedProto: null,
      }),
      'http://localhost:3000',
    );
    assert.equal(
      originFromRequestHeaders({
        host: 'internal',
        forwardedHost: 'exceptional-electrical-v2.vercel.app',
        forwardedProto: 'https',
      }),
      'https://exceptional-electrical-v2.vercel.app',
    );
  });

  it('requires a reasonably strong password', () => {
    assert.equal(isStrongPassword('short'), false);
    assert.equal(isStrongPassword('long-enough-password'), true);
  });
});
