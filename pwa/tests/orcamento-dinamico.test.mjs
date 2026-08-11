import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ORCAMENTO_ORIGEM,
  formatOrcamentoOrigemLabel,
  reportMatchesOrcamentoOrigem,
  resolveOrcamentoOrigem,
} from '../js/orcamento-origem.js';
import {
  STANDALONE_ORCAMENTO_ORIGEM,
  STANDALONE_ORCAMENTO_SERVICE_TYPE,
} from '../js/orcamento-standalone.js';
import { FOLHA_OBRA_ORCAMENTO_ORIGEM } from '../js/folha-obra-orcamento.js';
import {
  suggestReclamacaoGarantia,
  getReportReclamacaoGarantia,
} from '../js/orcamento-reclamacao-garantia.js';
import { toLocalDateInputValue } from '../js/orcamento-workflow.js';

describe('orcamento-origem', () => {
  it('classifica standalone, pedido e folha', () => {
    assert.equal(
      resolveOrcamentoOrigem({
        serviceType: STANDALONE_ORCAMENTO_SERVICE_TYPE,
        data: { orcamentoOrigem: STANDALONE_ORCAMENTO_ORIGEM },
      }).id,
      ORCAMENTO_ORIGEM.RH,
    );
    assert.equal(
      resolveOrcamentoOrigem({
        status: 'approved',
        data: { values: { pedido_orcamento: 'Sim' } },
      }).id,
      ORCAMENTO_ORIGEM.PEDIDO,
    );
    assert.equal(
      resolveOrcamentoOrigem({
        serviceType: STANDALONE_ORCAMENTO_SERVICE_TYPE,
        data: { orcamentoOrigem: FOLHA_OBRA_ORCAMENTO_ORIGEM, folhaObraId: 'f1' },
      }).id,
      ORCAMENTO_ORIGEM.FOLHA,
    );
  });

  it('filtra por origem', () => {
    const folha = {
      serviceType: STANDALONE_ORCAMENTO_SERVICE_TYPE,
      data: { orcamentoOrigem: FOLHA_OBRA_ORCAMENTO_ORIGEM, folhaObraId: 'f1' },
    };
    assert.equal(reportMatchesOrcamentoOrigem(folha, 'folha'), true);
    assert.equal(reportMatchesOrcamentoOrigem(folha, 'rh'), false);
    assert.equal(formatOrcamentoOrigemLabel(folha), 'Folha de obra');
  });
});

describe('reclamacao garantia sugestão', () => {
  it('sugere a partir do mesmo nº de série', () => {
    const history = [
      {
        id: 'old',
        forkliftSerial: 'SN-100',
        data: { orcamento: { reclamacaoGarantia: 'sim' } },
      },
    ];
    const report = {
      id: 'new',
      forkliftSerial: 'SN-100',
      data: { orcamento: {} },
    };
    assert.equal(getReportReclamacaoGarantia(report), '');
    assert.equal(suggestReclamacaoGarantia(report, history), 'sim');
  });
});

describe('orcamento datas locais', () => {
  it('toLocalDateInputValue usa calendário de Portugal para ISO com hora', () => {
    const iso = new Date(2026, 5, 15, 12, 0, 0).toISOString();
    assert.equal(toLocalDateInputValue(iso), '2026-06-15');
    assert.equal(toLocalDateInputValue('2026-06-15'), '2026-06-15');
    assert.equal(toLocalDateInputValue('2026-08-06T23:30:00.000Z'), '2026-08-07');
  });
});

describe('oficina sem duplicar MS.015', () => {
  it('getFolhasObraAguardaOrcamento ignora folhas que já têm proposta', async () => {
    const { replaceFolhasObraCache } = await import('../js/folhas-obra-db.js');
    const { getFolhasObraAguardaOrcamento } = await import('../js/folha-obra-orcamento.js');
    replaceFolhasObraCache([
      {
        id: 'f-new',
        responsabilidade: 'RC',
        estado: 'aguarda_orcamento',
        orcamentoReportId: '',
        dataRececao: '2026-08-01',
      },
      {
        id: 'f-done',
        responsabilidade: 'RC',
        estado: 'aguarda_orcamento',
        orcamentoReportId: 'rep-1',
        dataRececao: '2026-08-02',
      },
      {
        id: 'f-enviado',
        responsabilidade: 'RC',
        estado: 'orcamento_enviado',
        orcamentoReportId: 'rep-2',
        dataRececao: '2026-08-03',
      },
    ]);
    const list = getFolhasObraAguardaOrcamento();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'f-new');
  });
});
