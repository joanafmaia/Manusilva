import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('screen-wake-lock', () => {
  let released;
  let requestCalls;
  let originalNavigatorDescriptor;
  let originalDocument;

  beforeEach(() => {
    released = 0;
    requestCalls = 0;
    originalDocument = globalThis.document;
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

    globalThis.document = {
      visibilityState: 'visible',
      addEventListener() {},
      removeEventListener() {},
    };

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        wakeLock: {
          request: async () => {
            requestCalls += 1;
            return {
              addEventListener() {},
              release: async () => {
                released += 1;
              },
            };
          },
        },
      },
    });
  });

  afterEach(async () => {
    try {
      const { releaseFormScreenWakeLock } = await import('../js/screen-wake-lock.js');
      await releaseFormScreenWakeLock();
    } catch {
      /* ignore */
    }
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  });

  it('pede e liberta o wake lock do ecrã', async () => {
    const { acquireFormScreenWakeLock, releaseFormScreenWakeLock, isFormScreenWakeLockActive } =
      await import('../js/screen-wake-lock.js');

    await acquireFormScreenWakeLock();
    assert.equal(requestCalls, 1);
    assert.equal(isFormScreenWakeLockActive(), true);

    await releaseFormScreenWakeLock();
    assert.equal(released, 1);
    assert.equal(isFormScreenWakeLockActive(), false);
  });
});
