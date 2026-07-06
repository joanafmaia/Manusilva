import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  flattenEmpilhadoresValues,
  migrateLegacyEmpilhadoresMaquinas,
  normalizeEmpilhadoresMaquinaRow,
} from '../js/views/relatorio-empilhadores-maquinas.js';

describe('checklist empilhadores — dados para PDF', () => {
  it('migrateLegacy preserva checklist no topo quando maquinas[] está vazio', () => {
    const values = {
      marca: 'Linde',
      componentes_externos: { chassis: 'OK', mastro: 'Não OK' },
      componentes_internos: { cablagem: 'N/A' },
    };
    const rows = migrateLegacyEmpilhadoresMaquinas(values);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].componentes_externos.chassis, 'OK');
    assert.equal(rows[0].componentes_externos.mastro, 'Não OK');
    assert.equal(rows[0].componentes_internos.cablagem, 'N/A');
  });

  it('migrateLegacy funde checklist legado quando maquinas[] existe mas sem respostas', () => {
    const values = {
      maquinas: [{ marca: 'Toyota', componentes_externos: { chassis: '' } }],
      componentes_externos: { chassis: 'OK' },
    };
    const rows = migrateLegacyEmpilhadoresMaquinas(values);
    assert.equal(rows[0].componentes_externos.chassis, 'OK');
  });

  it('normalizeEmpilhadoresMaquinaRow faz parse de JSON em componentes', () => {
    const row = normalizeEmpilhadoresMaquinaRow({
      componentes_externos: '{"chassis":"OK","mastro":"Não OK"}',
    });
    assert.equal(row.componentes_externos.chassis, 'OK');
    assert.equal(row.componentes_externos.mastro, 'Não OK');
  });

  it('flattenEmpilhadoresValues expõe checklist para o PDF', () => {
    const flat = flattenEmpilhadoresValues({
      maquinas: [
        {
          marca: 'Linde',
          componentes_externos: { chassis: 'OK' },
          componentes_internos: { cablagem: 'Não OK' },
        },
      ],
    });
    assert.equal(flat.componentes_externos.chassis, 'OK');
    assert.equal(flat.componentes_internos.cablagem, 'Não OK');
  });
});
