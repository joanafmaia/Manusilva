import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildClienteEmailPendingPatch,
  buildClienteEmailSentPatch,
  getReportClienteEmailState,
  reportClientEmailIsPending,
  renderReportClienteEmailBadge,
} from '../js/report-cliente-email-state.js';

describe('report-cliente-email-state', () => {
  it('marca pendente e enviado corretamente', () => {
    const pending = {
      status: 'approved',
      data: buildClienteEmailPendingPatch('SMTP fail'),
    };
    assert.equal(getReportClienteEmailState(pending), 'pending');
    assert.equal(reportClientEmailIsPending(pending), true);
    assert.match(renderReportClienteEmailBadge(pending), /E-mail pendente/);

    const sent = {
      status: 'approved',
      data: {
        ...pending.data,
        ...buildClienteEmailSentPatch('2026-08-03T12:00:00.000Z'),
      },
    };
    assert.equal(getReportClienteEmailState(sent), 'sent');
    assert.equal(reportClientEmailIsPending(sent), false);
    assert.match(renderReportClienteEmailBadge(sent), /E-mail enviado/);
  });
});
