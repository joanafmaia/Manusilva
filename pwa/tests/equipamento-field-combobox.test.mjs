import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchEquipamentoFieldSuggestions } from '../js/equipamento-field-combobox.js';

const POOL = [
  { marca: 'Toyota', modelo: '8FBE20', numero_serie: 'SN-001', n_interno: 'A1' },
  { marca: 'Linde', modelo: 'E20', numero_serie: 'SN-002', n_interno: 'B2' },
  { marca: 'Toyota', modelo: '8FBMT25', numero_serie: 'SN-003', n_interno: 'C3' },
];

describe('equipamento-field-combobox', () => {
  it('filtra marcas ao escrever', () => {
    const items = searchEquipamentoFieldSuggestions('marca', 'toy', POOL);
    assert.equal(items.length, 1);
    assert.equal(items[0].value, 'Toyota');
  });

  it('filtra modelos pela marca já escrita', () => {
    const items = searchEquipamentoFieldSuggestions('modelo', '8f', POOL, { marcaFilter: 'Toyota' });
    assert.equal(items.length, 2);
    assert.ok(items.every((item) => item.equipamento.marca === 'Toyota'));
  });

  it('encontra número de série', () => {
    const items = searchEquipamentoFieldSuggestions('numero_de_serie', 'sn-002', POOL);
    assert.equal(items.length, 1);
    assert.equal(items[0].value, 'SN-002');
  });
});
