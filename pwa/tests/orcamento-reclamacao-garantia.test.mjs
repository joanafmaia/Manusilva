import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatReclamacaoGarantiaAuditLabel,
  formatReclamacaoGarantiaLabel,
  getReportReclamacaoGarantia,
  normalizeReclamacaoGarantia,
  renderReclamacaoGarantiaField,
} from '../js/orcamento-reclamacao-garantia.js';
import { buildOrcamentoAuditCsv } from '../js/orcamento-audit.js';

describe('orcamento reclamação garantia', () => {
  it('normaliza Sim/Não e valores vagos', () => {
    assert.equal(normalizeReclamacaoGarantia('Sim'), 'sim');
    assert.equal(normalizeReclamacaoGarantia('NÃO'), 'nao');
    assert.equal(normalizeReclamacaoGarantia(true), 'sim');
    assert.equal(normalizeReclamacaoGarantia(false), 'nao');
    assert.equal(normalizeReclamacaoGarantia(''), '');
    assert.equal(normalizeReclamacaoGarantia(undefined), '');
  });

  it('formata etiquetas e lê do relatório', () => {
    assert.equal(formatReclamacaoGarantiaLabel('sim'), 'Sim');
    assert.equal(formatReclamacaoGarantiaLabel('nao'), 'Não');
    assert.equal(formatReclamacaoGarantiaLabel(''), '—');
    assert.equal(formatReclamacaoGarantiaAuditLabel(''), 'Não indicado');
    assert.equal(
      getReportReclamacaoGarantia({ data: { orcamento: { reclamacaoGarantia: 'Sim' } } }),
      'sim',
    );
  });

  it('renderiza select no editor RH', () => {
    const html = renderReclamacaoGarantiaField({ reclamacaoGarantia: 'sim' });
    assert.match(html, /data-orc-field="reclamacaoGarantia"/);
    assert.match(html, /Avaria \/ reclamação em garantia/);
    assert.match(html, /value="sim"[^>]*selected|selected[^>]*value="sim"/);
  });

  it('exporta coluna Em garantia no CSV de auditoria', () => {
    const csv = buildOrcamentoAuditCsv([
      {
        date: '2026-03-01',
        year: '2026',
        tipoLabel: 'Orçamento',
        cliente: 'Cliente Teste',
        nif: '—',
        numeroOrcamento: '1/2026',
        op: '—',
        estado: 'Por preparar',
        respostaCliente: '—',
        respostaClienteEm: '—',
        enviadoEm: '—',
        total: 100,
        emailDestinatario: '—',
        tecnico: '—',
        origem: 'Proposta RH',
        reclamacaoGarantiaLabel: 'Sim',
        pedido: '—',
      },
    ]);
    assert.match(csv, /Em garantia/);
    assert.match(csv, /;Sim;/);
  });
});
