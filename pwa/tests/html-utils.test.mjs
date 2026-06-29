import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../js/html-utils.js';

describe('html-utils', () => {
  it('escapeHtml neutraliza caracteres HTML', () => {
    assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.equal(escapeHtml('Joana & Filipe'), 'Joana &amp; Filipe');
    assert.equal(escapeHtml('"test"'), '&quot;test&quot;');
    assert.equal(escapeHtml(null), '');
  });
});
