import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEquipmentFormPrefill } from '../js/cliente-equipamentos.js';

const BATERIA_POOL = [
  {
    categoria: 'bateria',
    chave: 'eq:bateria|hawker|4 pzs 500|sn-001|',
    marca: 'Hawker',
    modelo: '4 PzS 500',
    tipo: 'Hawker 4 PzS 500',
    numero_serie: 'SN-001',
    n_interno: null,
  },
  {
    categoria: 'bateria',
    chave: 'eq:bateria|exide|3 pzs 180|sn-002|',
    marca: 'Exide',
    modelo: '3 PzS 180',
    tipo: 'Exide 3 PzS 180',
    numero_serie: 'SN-002',
    n_interno: null,
  },
];

describe('cliente-equipamentos', () => {
  it('não pré-preenche preventiva bateria sem correspondência explícita', () => {
    const service = { id: 'manutencao_preventiva_bateria' };
    const job = { forkliftSerial: '' };
    const prefill = buildEquipmentFormPrefill(service, job, BATERIA_POOL, {});
    assert.deepEqual(prefill, {});
  });

  it('pré-preenche preventiva bateria quando o nº de série coincide', () => {
    const service = { id: 'manutencao_preventiva_bateria' };
    const job = { forkliftSerial: 'SN-002' };
    const prefill = buildEquipmentFormPrefill(service, job, BATERIA_POOL, {});
    assert.equal(prefill.numero_de_serie, 'SN-002');
    assert.equal(prefill.tipo, 'Exide 3 PzS 180');
  });
});
