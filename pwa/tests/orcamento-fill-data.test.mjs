import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOrcamentoDateLong,
  resolveOrcamentoDocumentDate,
} from '../js/orcamento-fill-data.js';
import {
  computeOrcamentoTableLayout,
  resolveOrcamentoEquipamentoPdfBlocks,
} from '../js/pdf-orcamento.js';

describe('resolveOrcamentoDocumentDate', () => {
  it('usa enviadoEm quando a proposta já foi enviada', () => {
    const report = {
      data: {
        values: { data_de_conclusao: '2026-01-15' },
        orcamento: { enviadoEm: '2026-06-11T10:30:00.000Z' },
      },
    };
    assert.equal(resolveOrcamentoDocumentDate(report), '2026-06-11T10:30:00.000Z');
  });

  it('ignora data da intervenção — usa enviadoEm para o texto do PDF', () => {
    const report = {
      data: {
        values: { data_de_conclusao: '2026-01-15' },
        orcamento: { enviadoEm: '2026-06-11T10:30:00.000Z' },
      },
    };
    const dataExtenso = formatOrcamentoDateLong(resolveOrcamentoDocumentDate(report));
    assert.equal(dataExtenso, '11 de Junho 2026');
    assert.notEqual(dataExtenso, '15 de Janeiro 2026');
  });
});

describe('formatOrcamentoDateLong', () => {
  it('formata ISO em português', () => {
    assert.equal(formatOrcamentoDateLong('2026-06-11'), '11 de Junho 2026');
  });
});

describe('resolveOrcamentoEquipamentoPdfBlocks', () => {
  it('mantém todos os equipamentos com dados e índices corretos para o PDF', () => {
    const fill = {
      maquina: '—',
      equipamento_campos: [
        { key: 'marca', label: 'Marca' },
        { key: 'modelo', label: 'Modelo' },
        { key: 'numeroSerie', label: 'Nº Série' },
        { key: 'numeroInterno', label: 'Nº Interno' },
      ],
      maquinas: [
        { marca: 'Linde', modelo: 'L12', numeroSerie: '120273' },
        { marca: 'Toyota', modelo: '8FB', numeroInterno: 'M2' },
      ],
    };
    const blocks = resolveOrcamentoEquipamentoPdfBlocks(fill);
    assert.equal(blocks.blocks.length, 2);
    assert.equal(blocks.blocks[0].index, 0);
    assert.equal(blocks.blocks[1].index, 1);
    assert.equal(blocks.blocks[1].machine.marca, 'Toyota');
    assert.equal(blocks.blocks[1].machine.numeroInterno, 'M2');
  });

  it('PDF com rótulos e campos diferentes em cada equipamento', () => {
    const fill = {
      maquinas: [
        {
          marca: 'Linde',
          modelo: 'Chumbo',
          campos: [
            { key: 'marca', label: 'Equipamento' },
            { key: 'modelo', label: 'Material' },
          ],
        },
        {
          marca: 'Toyota',
          campo_2: '24V',
          campos: [
            { key: 'marca', label: 'Equipamento' },
            { key: 'campo_2', label: 'Tensão' },
          ],
        },
      ],
    };
    const { blocks } = resolveOrcamentoEquipamentoPdfBlocks(fill);
    assert.equal(blocks.length, 2);
    assert.deepEqual(blocks[0].rows, [
      ['Equipamento', 'Linde'],
      ['Material', 'Chumbo'],
    ]);
    assert.deepEqual(blocks[1].rows, [
      ['Equipamento', 'Toyota'],
      ['Tensão', '24V'],
    ]);
  });
});

describe('computeOrcamentoTableLayout', () => {
  it('coloca a tabela abaixo do conteúdo quando o meio da folha é longo', () => {
    const layout = computeOrcamentoTableLayout(
      [{ descricao: 'Peça', qtd: '1', precoUnit: '10', equipamentoIndex: 0 }],
      [{ marca: 'A' }, { marca: 'B' }],
      { contentEndY: 210, equipamentoCampos: null },
    );
    assert.ok(layout.startY >= 210);
  });
});
