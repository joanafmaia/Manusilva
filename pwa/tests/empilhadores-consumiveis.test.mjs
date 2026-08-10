import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyEmpilhadoresMaquinaRow,
  normalizeEmpilhadoresMaquinaRow,
  migrateLegacyEmpilhadoresMaquinas,
  getEmpilhadoresPerMachineFieldDefs,
} from '../js/views/relatorio-empilhadores-maquinas.js';

describe('empilhadores — consumíveis por máquina', () => {
  it('inclui campo consumiveis nas defs por máquina', () => {
    const field = getEmpilhadoresPerMachineFieldDefs().find((f) => f.id === 'consumiveis');
    assert.ok(field);
    assert.equal(field.type, 'dynamic_table');
    assert.equal(field.addButtonLabel, 'Adicionar consumíveis');
    assert.equal(field.section, 'Consumíveis Utilizados');
  });

  it('linha vazia e normalização preservam consumíveis', () => {
    const empty = emptyEmpilhadoresMaquinaRow();
    assert.deepEqual(empty.consumiveis, []);
    assert.equal(empty.maquina, '');
    assert.equal(empty.n_interno, '');

    const normalized = normalizeEmpilhadoresMaquinaRow({
      maquina: 'Empilhador A',
      marca: 'Linde',
      modelo: 'E20',
      n_interno: '12-AB-34',
      consumiveis: [{ artigo: 'Filtro hidráulico', qtd: '2' }, { artigo: '', qtd: '' }],
    });
    assert.equal(normalized.maquina, 'Empilhador A');
    assert.equal(normalized.marca, 'Linde');
    assert.equal(normalized.modelo, 'E20');
    assert.equal(normalized.n_interno, '12-AB-34');
    assert.equal(normalized.consumiveis.length, 2);
    assert.equal(normalized.consumiveis[0].artigo, 'Filtro hidráulico');
    assert.equal(normalized.consumiveis[0].qtd, '2');
    assert.equal(normalized.consumiveis[1].artigo, '');
  });

  it('aceita matrícula legada no campo matricula', () => {
    const normalized = normalizeEmpilhadoresMaquinaRow({
      matricula: '99-ZZ-00',
    });
    assert.equal(normalized.n_interno, '99-ZZ-00');
  });

  it('migra consumíveis legados no topo do relatório', () => {
    const rows = migrateLegacyEmpilhadoresMaquinas({
      marca: 'Toyota',
      consumiveis: [{ artigo: 'Junta', qtd: '1' }],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].marca, 'Toyota');
    assert.equal(rows[0].consumiveis[0].artigo, 'Junta');
  });
});
