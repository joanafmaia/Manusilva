import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('app-version', () => {
  it('parseBuildIdFromSource', async () => {
    const { parseBuildIdFromSource } = await import('../js/app-version.js');
    assert.equal(
      parseBuildIdFromSource('export const APP_BUILD_ID = "6790799";'),
      '6790799',
    );
    assert.equal(parseBuildIdFromSource(''), '');
  });
});
