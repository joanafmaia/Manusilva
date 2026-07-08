import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const prevWindow = globalThis.window;

function setWindowLocation({ hostname = '', search = '' } = {}) {
  globalThis.window = {
    location: { hostname, search },
  };
}

beforeEach(() => {
  setWindowLocation({ hostname: '', search: '' });
});

afterEach(() => {
  globalThis.window = prevWindow;
});

describe('env', () => {
  it('identifica runtime de produção fora de localhost', async () => {
    const { isDevMockEnabled, isProductionRuntime } = await import(`../js/env.js?case=${Date.now()}a`);
    assert.equal(isProductionRuntime(), true);
    assert.equal(isDevMockEnabled(), false);
  });

  it('aceita modo mock em localhost', async () => {
    setWindowLocation({ hostname: 'localhost', search: '?mock=1' });
    const { isDevMockEnabled, isProductionRuntime } = await import(`../js/env.js?case=${Date.now()}b`);
    assert.equal(isDevMockEnabled(), true);
    assert.equal(isProductionRuntime(), false);
  });

  it('ignora mock=1 fora de localhost', async () => {
    setWindowLocation({ hostname: 'manusilva.vercel.app', search: '?mock=1' });
    const { isDevMockEnabled, isProductionRuntime } = await import(`../js/env.js?case=${Date.now()}c`);
    assert.equal(isDevMockEnabled(), false);
    assert.equal(isProductionRuntime(), true);
  });
});
