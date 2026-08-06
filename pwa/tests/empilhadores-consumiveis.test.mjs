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

    const normalized = normalizeEmpilhadoresMaquinaRow({
      marca: 'Linde',
      consumiveis: [{ artigo: 'Filtro hidráulico', qtd: '2' }, { artigo: '', qtd: '' }],
    });
    assert.equal(normalized.marca, 'Linde');
    assert.equal(normalized.consumiveis.length, 2);
    assert.equal(normalized.consumiveis[0].artigo, 'Filtro hidráulico');
    assert.equal(normalized.consumiveis[0].qtd, '2');
    assert.equal(normalized.consumiveis[1].artigo, '');
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
