import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMaterialRows } from '../js/material-table-field.js';
import {
  formatGrandesMaquinaOptionLabel,
  listGrandesBatteryMaquinaOptions,
} from '../js/views/relatorio-grandes.js';

describe('formatGrandesMaquinaOptionLabel', () => {
  it('combina máquina e matrícula', () => {
    assert.equal(
      formatGrandesMaquinaOptionLabel({ maquina: 'Empilhador 1', matricula: '12-AB-34' }),
      'Empilhador 1 · 12-AB-34',
    );
  });

  it('ignora linhas vazias', () => {
    assert.equal(formatGrandesMaquinaOptionLabel({}), '');
  });
});

describe('listGrandesBatteryMaquinaOptions', () => {
  it('remove duplicados', () => {
    const options = listGrandesBatteryMaquinaOptions([
      { maquina: 'A', matricula: '1' },
      { maquina: 'A', matricula: '1' },
      { maquina: 'B', matricula: '2' },
    ]);
    assert.deepEqual(options, ['A · 1', 'B · 2']);
  });
});

describe('normalizeMaterialRows com máquina', () => {
  it('preserva coluna maquina nos consumíveis', () => {
    assert.deepEqual(
      normalizeMaterialRows([{ artigo: 'Óleo', qtd: '2', maquina: 'Empilhador 1 · 12-AB-34' }]),
      [{ artigo: 'Óleo', qtd: '2', maquina: 'Empilhador 1 · 12-AB-34' }],
    );
  });
});
