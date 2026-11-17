import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {jobTitleFromDescription} from './job-title-from-description.ts';

describe('jobTitleFromDescription', () => {
  it('uses the first sentence when present', () => {
    assert.equal(
      jobTitleFromDescription(
        'No power at house. Caller reports a total loss of power but no signs of fire.',
      ),
      'No power at house.',
    );
  });

  it('falls back to the first line when there is no sentence end', () => {
    assert.equal(
      jobTitleFromDescription('Replace kitchen downlights\nMore detail later'),
      'Replace kitchen downlights',
    );
  });

  it('truncates long titles and uses the fallback for empty input', () => {
    const long='A'.repeat(250);
    assert.ok(jobTitleFromDescription(long).length<=200);
    assert.equal(jobTitleFromDescription(''),'Electrical work');
    assert.equal(jobTitleFromDescription('x'),'Electrical work');
  });
});
