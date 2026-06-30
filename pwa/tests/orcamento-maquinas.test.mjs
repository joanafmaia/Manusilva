import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOrcamentoMaquinasDocxText,
  hasOrcamentoMaquinaData,
  normalizeOrcamentoMaquina,
} from '../js/orcamento-maquinas.js';
import { suggestOrcamentoMaquinas } from '../js/orcamento-cabecalho.js';
import { resolveOrcamentoIntro } from '../js/orcamento-fill-data.js';

describe('orcamento-maquinas', () => {
  it('normaliza e deteta dados de equipamento', () => {
    const row = normalizeOrcamentoMaquina({
      marca: 'Toyota',
      modelo: '8FB',
      numero_de_serie: 'SN1',
    });
    assert.equal(row.marca, 'Toyota');
    assert.equal(row.numeroSerie, 'SN1');
    assert.equal(hasOrcamentoMaquinaData(row), true);
  });

  it('sugere várias máquinas da preventiva empilhadores', () => {
    const report = {
      serviceType: 'manutencao_preventiva_empilhadores',
      data: {
        values: {
          maquinas: [
            { marca: 'Toyota', modelo: 'A', numero_de_serie: '1', n_interno: 'M1' },
            { marca: 'Linde', modelo: 'B', numero_de_serie: '2', n_interno: 'M2' },
          ],
        },
      },
    };
    const rows = suggestOrcamentoMaquinas(report);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].marca, 'Toyota');
    assert.equal(rows[1].marca, 'Linde');
  });

  it('usa intro plural com várias máquinas', () => {
    assert.match(resolveOrcamentoIntro('folha_intervencao_avarias', 2), /seguintes equipamentos/);
    assert.match(formatOrcamentoMaquinasDocxText([
      { marca: 'Toyota', modelo: 'A', numeroInterno: 'M1' },
      { marca: 'Linde', modelo: 'B', numeroInterno: 'M2' },
    ]), /1\. Toyota \/ A/);
  });
});
