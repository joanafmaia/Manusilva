import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrandesConsumiveisField,
  normalizeMaterialRows,
} from '../js/material-table-field.js';
import {
  encodeGrandesMaquinaSelectValue,
  decodeGrandesMaquinaSelectValue,
  formatGrandesMaquinaOptionLabel,
  listGrandesBatteryMaquinaOptions,
  resolveGrandesConsumivelMaquina,
} from '../js/views/relatorio-grandes.js';

describe('formatGrandesMaquinaOptionLabel', () => {
  it('mostra só a matrícula', () => {
    assert.equal(
      formatGrandesMaquinaOptionLabel({ maquina: 'Empilhador 1', matricula: '12-AB-34' }),
      '12-AB-34',
    );
  });

  it('usa nome se não houver matrícula', () => {
    assert.equal(formatGrandesMaquinaOptionLabel({ maquina: 'Empilhador 1' }), 'Empilhador 1');
  });

  it('ignora linhas vazias', () => {
    assert.equal(formatGrandesMaquinaOptionLabel({}), '');
  });
});

describe('createGrandesConsumiveisField', () => {
  it('coluna de identificação é Matrícula', () => {
    const field = createGrandesConsumiveisField();
    assert.equal(field.columns[0].id, 'matricula');
    assert.equal(field.columns[0].label, 'Matrícula');
    assert.equal(field.columnTypes.matricula, 'grandes_maquina_select');
  });
});

describe('encode/decode select de máquina', () => {
  it('guarda nome e matrícula em JSON', () => {
    const value = encodeGrandesMaquinaSelectValue({
      maquina: 'Empilhador 1',
      matricula: '12-AB-34',
    });
    assert.deepEqual(decodeGrandesMaquinaSelectValue(value), {
      maquina: 'Empilhador 1',
      matricula: '12-AB-34',
    });
  });

  it('aceita texto legado Nome · Matrícula', () => {
    assert.deepEqual(decodeGrandesMaquinaSelectValue('Empilhador 1 · 12-AB-34'), {
      maquina: 'Empilhador 1',
      matricula: '12-AB-34',
    });
  });

  it('texto simples é tratado como matrícula', () => {
    assert.deepEqual(decodeGrandesMaquinaSelectValue('12-AB-34'), {
      maquina: '',
      matricula: '12-AB-34',
    });
  });
});

describe('listGrandesBatteryMaquinaOptions', () => {
  it('remove duplicados e label é só matrícula', () => {
    const options = listGrandesBatteryMaquinaOptions([
      { maquina: 'A', matricula: '1' },
      { maquina: 'A', matricula: '1' },
      { maquina: 'B', matricula: '2' },
    ]);
    assert.equal(options.length, 2);
    assert.equal(options[0].label, '1');
    assert.equal(options[1].label, '2');
    assert.deepEqual(decodeGrandesMaquinaSelectValue(options[0].value), {
      maquina: 'A',
      matricula: '1',
    });
  });
});

describe('normalizeMaterialRows com máquina', () => {
  it('separa nome e matrícula a partir do valor do select (coluna matricula)', () => {
    const encoded = encodeGrandesMaquinaSelectValue({
      maquina: 'Empilhador 1',
      matricula: '12-AB-34',
    });
    assert.deepEqual(
      normalizeMaterialRows([{ artigo: 'Óleo', qtd: '2', matricula: encoded }]),
      [{ artigo: 'Óleo', qtd: '2', maquina: 'Empilhador 1', matricula: '12-AB-34' }],
    );
  });

  it('migra texto legado Nome · Matrícula na coluna maquina', () => {
    assert.deepEqual(
      normalizeMaterialRows([{ artigo: 'Óleo', qtd: '2', maquina: 'Empilhador 1 · 12-AB-34' }]),
      [{ artigo: 'Óleo', qtd: '2', maquina: 'Empilhador 1', matricula: '12-AB-34' }],
    );
  });

  it('resolve linha já normalizada para o PDF', () => {
    assert.deepEqual(
      resolveGrandesConsumivelMaquina({ maquina: 'Empilhador 1', matricula: '12-AB-34' }),
      { maquina: 'Empilhador 1', matricula: '12-AB-34' },
    );
  });
});
