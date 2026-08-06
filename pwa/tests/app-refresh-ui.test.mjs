import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

describe('app-refresh-ui pending flag', () => {
  const storage = new Map();
  let previousWindow;
  let previousDocument;
  let previousSessionStorage;
  let previousGlobalPending;

  beforeEach(() => {
    previousWindow = globalThis.window;
    previousDocument = globalThis.document;
    previousSessionStorage = globalThis.sessionStorage;
    previousGlobalPending = globalThis.__MS_APP_UPDATE_PENDING;

    storage.clear();
    globalThis.__MS_APP_UPDATE_PENDING = false;
    globalThis.sessionStorage = {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    };

    const listeners = new Map();
    globalThis.window = {
      addEventListener: (type, handler) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(handler);
      },
      dispatchEvent: (event) => {
        const set = listeners.get(event.type);
        if (!set) return true;
        set.forEach((handler) => handler(event));
        return true;
      },
    };

    const btn = {
      dataset: {},
      classList: {
        _set: new Set(),
        add(name) {
          this._set.add(name);
        },
        remove(name) {
          this._set.delete(name);
        },
        contains(name) {
          return this._set.has(name);
        },
      },
      title: '',
      attrs: {},
      setAttribute(name, value) {
        this.attrs[name] = value;
      },
      getAttribute(name) {
        return this.attrs[name] ?? null;
      },
      querySelector: () => null,
      addEventListener: () => {},
    };

    globalThis.document = {
      getElementById: (id) => (id === 'btn-force-app-refresh' ? btn : null),
      getElementByIdBtn: btn,
    };
    globalThis.CustomEvent = class CustomEvent {
      constructor(type) {
        this.type = type;
      }
    };
  });

  afterEach(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.sessionStorage = previousSessionStorage;
    globalThis.__MS_APP_UPDATE_PENDING = previousGlobalPending;
    delete globalThis.CustomEvent;
  });

  it('marca update pendente e pinta o botão mesmo se o aviso chegar antes do bind', async () => {
    const { bindAppRefreshButton, isAppUpdatePending, notifyAppUpdateAvailable } =
      await import(`../js/app-refresh-ui.js?t=${Date.now()}`);

    notifyAppUpdateAvailable();
    assert.equal(isAppUpdatePending(), true);

    bindAppRefreshButton('btn-force-app-refresh', {
      notifyStyle: 'button',
      updateHint: 'Nova versão',
    });

    const btn = document.getElementById('btn-force-app-refresh');
    assert.ok(btn.classList.contains('tech-refresh-btn--update-available'));
    assert.equal(btn.getAttribute('aria-label'), 'Nova versão');
  });

  it('pinta o botão quando o aviso chega depois do bind', async () => {
    const { bindAppRefreshButton } = await import(`../js/app-refresh-ui.js?t=${Date.now() + 1}`);

    bindAppRefreshButton('btn-force-app-refresh', {
      notifyStyle: 'button',
      updateHint: 'Atualizar agora',
    });

    window.dispatchEvent(new CustomEvent('manusilva-app-update-available'));

    const btn = document.getElementById('btn-force-app-refresh');
    assert.ok(btn.classList.contains('tech-refresh-btn--update-available'));
  });
});
