import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('detectReportDataConflict', () => {
  it('não pede escolha local/servidor para rascunhos em aberto', async () => {
    const { detectReportDataConflict } = await import('../js/tech-data-conflict.js');

    const conflict = await detectReportDataConflict(
      'job-1',
      {
        status: 'draft',
        submittedAt: '2026-07-01T10:00:00.000Z',
        data: { values: { marca: 'Toyota' } },
      },
      {},
    );

    assert.equal(conflict, null);
  });
});
