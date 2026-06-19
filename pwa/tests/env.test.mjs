import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDevMockEnabled, isProductionRuntime } from '../js/env.js';

describe('env', () => {
  it('identifica runtime de produção fora de localhost', () => {
    assert.equal(isProductionRuntime(), true);
    assert.equal(isDevMockEnabled(), false);
  });
});
