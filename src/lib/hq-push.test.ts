import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pushInternalSecretMatches } from './hq-push-secret.ts';

describe('pushInternalSecretMatches', () => {
  it('rejects short or missing secrets', () => {
    assert.equal(pushInternalSecretMatches('too-short', 'too-short'), false);
    assert.equal(pushInternalSecretMatches(null, 'abcdefghijklmnopqrstuvwxyz'), false);
    assert.equal(
      pushInternalSecretMatches('abcdefghijklmnopqrstuvwxyZ', 'abcdefghijklmnopqrstuvwxyz'),
      false,
    );
    assert.equal(
      pushInternalSecretMatches('abcdefghijklmnopqrstuvwxyz', 'abcdefghijklmnopqrstuvwxyz'),
      true,
    );
  });
});
