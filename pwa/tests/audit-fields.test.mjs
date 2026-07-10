import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isMissingAuditColumnError,
  mergeAuditIntoDados,
  readAuditField,
  stripAuditFromRelatorioRow,
  withOptionalAuditColumns,
} from '../js/audit-fields.js';

describe('audit-fields', () => {
  it('deteta erro de coluna em falta no schema cache', () => {
    const error = {
      code: 'PGRST204',
      message: "Could not find the 'aprovado_por' column of 'servicos' in the schema cache",
    };
    assert.equal(isMissingAuditColumnError(error), true);
  });

  it('lê auditoria da coluna ou de dados.audit', () => {
    assert.equal(readAuditField({ aprovado_por: 'Joana' }, 'aprovado_por'), 'Joana');
    assert.equal(
      readAuditField({ dados: { audit: { aprovado_por: 'Filipa' } } }, 'aprovado_por'),
      'Filipa',
    );
  });

  it('move colunas de auditoria para dados.audit', () => {
    const row = stripAuditFromRelatorioRow({
      estado: 'approved',
      aprovado_por: 'Joana',
      dados: { values: {} },
    });
    assert.equal(row.aprovado_por, undefined);
    assert.equal(row.dados.audit.aprovado_por, 'Joana');
    assert.equal(row.estado, 'approved');
  });

  it('faz merge de auditoria em dados', () => {
    const dados = mergeAuditIntoDados({ values: { a: 1 } }, { faturado_por: 'RH' });
    assert.equal(dados.audit.faturado_por, 'RH');
    assert.equal(dados.values.a, 1);
  });

  it('omite colunas de auditoria vazias no payload', () => {
    const row = withOptionalAuditColumns(
      { estado: 'scheduled', dados: { values: {} } },
      { aprovado_por: null, faturado_por: '' },
      ['aprovado_por', 'faturado_por'],
    );
    assert.equal('aprovado_por' in row, false);
    assert.equal('faturado_por' in row, false);
  });
});
