import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isRecipientAllowed } = require('../server-lib/email-recipient-policy.js');

describe('email-recipient-policy', () => {
  const corpDomains = new Set(['empresa.pt']);

  it('proposta comercial — aceita qualquer e-mail válido (RH escolhe manualmente)', () => {
    assert.equal(
      isRecipientAllowed('joanamaia97@gmail.com', null, corpDomains, { allowManualRecipients: true }),
      true,
    );
    assert.equal(
      isRecipientAllowed('compras@cliente-novo.pt', null, corpDomains, { allowManualRecipients: true }),
      true,
    );
  });

  it('relatório técnico — exige e-mail do cliente ou mesmo domínio corporativo', () => {
    assert.equal(
      isRecipientAllowed('joanamaia97@gmail.com', 'info@empresa.pt', corpDomains),
      false,
    );
    assert.equal(isRecipientAllowed('info@empresa.pt', 'info@empresa.pt', corpDomains), true);
    assert.equal(isRecipientAllowed('compras@empresa.pt', 'info@empresa.pt', corpDomains), true);
  });

  it('sem e-mail na ficha — bloqueia relatório técnico', () => {
    assert.equal(isRecipientAllowed('cliente@gmail.com', null, corpDomains), false);
  });
});
