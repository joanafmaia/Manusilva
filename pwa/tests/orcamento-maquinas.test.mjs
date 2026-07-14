import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectMaquinaPdfFieldRows,
  countOrcamentoGroupedTableRows,
  formatOrcamentoMaquinasDocxText,
  groupOrcamentoLinhasByEquipamento,
  hasOrcamentoMaquinaData,
  normalizeOrcamentoMaquina,
  renderOrcamentoLinhasTableBody,
  shouldGroupOrcamentoLinhasByEquipamento,
} from '../js/orcamento-maquinas.js';
import { suggestOrcamentoMaquinas } from '../js/orcamento-cabecalho.js';
import {
  normalizeEquipamentoCampos,
  suggestEquipamentoCampos,
} from '../js/orcamento-equipamento-campos.js';
import {
  formatOrcamentoNumeroLabel,
  isPlaceholderOrcamentoNumero,
  normalizeEquipamentoIndex,
  normalizeOrcamentoLinhas,
  resolveLinhaEquipamentoLabel,
  resolveOrcamentoNumeroFormatado,
} from '../js/orcamento-linhas.js';

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

  it('usa intro plural com várias máquinas no docx', () => {
    const campos = [
      { key: 'marca', label: 'Marca' },
      { key: 'modelo', label: 'Modelo' },
    ];
    assert.match(formatOrcamentoMaquinasDocxText([
      { marca: 'Toyota', modelo: 'A', numeroInterno: 'M1' },
      { marca: 'Linde', modelo: 'B', numeroInterno: 'M2' },
    ], campos), /1\. Marca: Toyota — Modelo: A/);
  });

  it('mantém campos e rótulos por máquina', () => {
    const row = normalizeOrcamentoMaquina(
      {
        marca: 'Toyota',
        campo_2: '24V',
        campos: [
          { key: 'marca', label: 'Equipamento' },
          { key: 'campo_2', label: 'Tensão' },
        ],
      },
      [{ key: 'marca', label: 'Marca' }, { key: 'modelo', label: 'Modelo' }],
    );
    assert.equal(row.campos[0].label, 'Equipamento');
    assert.equal(row.campos[1].label, 'Tensão');
    const pdfRows = collectMaquinaPdfFieldRows(row);
    assert.deepEqual(pdfRows, [
      ['Equipamento', 'Toyota'],
      ['Tensão', '24V'],
    ]);
  });

  it('aceita campos personalizados por orçamento', () => {
    const campos = normalizeEquipamentoCampos([
      { key: 'maquina', label: 'Máquina' },
      { key: 'bateriaTipo', label: 'Bateria Tipo' },
    ]);
    const row = normalizeOrcamentoMaquina({ maquina: 'Toyota 8FB', bateriaTipo: 'Chumbo' }, campos);
    assert.equal(hasOrcamentoMaquinaData(row, campos), true);
    assert.equal(row.bateriaTipo, 'Chumbo');
  });

  it('preserva campos personalizados guardados para o PDF', () => {
    const report = {
      data: {
        orcamento: {
          equipamentoCampos: [
            { key: 'marca', label: 'Máquina' },
            { key: 'campo_1', label: 'Bateria Tipo' },
          ],
          maquinas: [{ marca: 'STILL', modelo: 'FMX-10', campo_1: 'Chumbo' }],
        },
      },
    };
    const campos = suggestEquipamentoCampos(report);
    const rows = suggestOrcamentoMaquinas(report);
    assert.equal(campos[1].label, 'Bateria Tipo');
    assert.equal(rows[0].marca, 'STILL');
    assert.equal(rows[0].campo_1, 'Chumbo');
  });

  it('associa linhas de orçamento ao equipamento', () => {
    const maquinas = [
      { marca: 'Toyota', modelo: 'A' },
      { marca: 'Linde', modelo: 'B' },
    ];
    const linhas = normalizeOrcamentoLinhas(
      [{ descricao: 'Anilha', qtd: '2', equipamentoIndex: 1 }],
      { machineCount: 2 },
    );
    assert.equal(linhas[0].equipamentoIndex, 1);
    assert.match(resolveLinhaEquipamentoLabel(linhas[0], maquinas), /Eq\.2/);
    assert.equal(normalizeEquipamentoIndex(99, 2), 0);
  });

  it('ignora placeholder «Atribuído ao guardar» no número do orçamento', () => {
    assert.equal(isPlaceholderOrcamentoNumero('Atribuído ao guardar'), true);
    assert.equal(
      resolveOrcamentoNumeroFormatado(
        { numeroFormatado: 'Atribuído ao guardar', numeroSequencial: 305, ano: 2026 },
        { year: 2026 },
      ),
      formatOrcamentoNumeroLabel(305, 2026),
    );
  });

  it('agrupa linhas por máquina com vários equipamentos', () => {
    const maquinas = [
      { marca: 'Toyota', modelo: 'A' },
      { marca: 'Linde', modelo: 'B' },
    ];
    const linhas = [
      { descricao: 'Anilha', qtd: '2', precoUnit: '10', equipamentoIndex: 0 },
      { descricao: 'Correia', qtd: '1', precoUnit: '25', equipamentoIndex: 1 },
    ];
    assert.equal(shouldGroupOrcamentoLinhasByEquipamento(maquinas), true);
    const groups = groupOrcamentoLinhasByEquipamento(linhas, maquinas);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].linhas[0].descricao, 'Anilha');
    assert.equal(groups[1].linhas[0].descricao, 'Correia');
    assert.equal(countOrcamentoGroupedTableRows(linhas, maquinas), 6);
    const html = renderOrcamentoLinhasTableBody(linhas, maquinas);
    assert.match(html, /data-orc-equip-group="0"/);
    assert.match(html, /data-orc-equip-group="1"/);
    assert.match(html, /data-orc-add-linha-equip="0"/);
  });

  it('mantém tabela simples com uma máquina', () => {
    const maquinas = [{ marca: 'Toyota', modelo: 'A' }];
    const linhas = [{ descricao: 'Anilha', qtd: '1', precoUnit: '10', equipamentoIndex: 0 }];
    assert.equal(shouldGroupOrcamentoLinhasByEquipamento(maquinas), false);
    const groups = groupOrcamentoLinhasByEquipamento(linhas, maquinas);
    assert.equal(groups.length, 1);
    assert.doesNotMatch(renderOrcamentoLinhasTableBody(linhas, maquinas), /data-orc-equip-group/);
  });
});
