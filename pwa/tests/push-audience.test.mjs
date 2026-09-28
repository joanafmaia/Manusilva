import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isRhRole, subscriptionMatchesNotify, splitTechnicianNames } = require('../server-lib/push-audience.js');

describe('push-audience', () => {
  it('reconhece roles RH/admin', () => {
    assert.equal(isRhRole('RH'), true);
    assert.equal(isRhRole('admin'), true);
    assert.equal(isRhRole('Administracao'), true);
    assert.equal(isRhRole('Tecnico'), false);
    assert.equal(isRhRole('Armazem'), false);
  });

  it('parte nomes CSV da atribuição', () => {
    assert.deepEqual(splitTechnicianNames('Hugo, Filipe'), ['Hugo', 'Filipe']);
    assert.deepEqual(splitTechnicianNames('José Silva'), ['José Silva']);
    assert.deepEqual(splitTechnicianNames(''), []);
  });

  it('envia avisos RH só para subscrições com role RH', () => {
    assert.equal(
      subscriptionMatchesNotify({ role: 'RH', technician_name: 'Hugo' }, { audience: 'rh' }),
      true,
    );
    assert.equal(
      subscriptionMatchesNotify({ role: 'Tecnico', technician_name: 'Hugo' }, { audience: 'rh' }),
      false,
    );
  });

  it('casa técnicos pelo nome ou id', () => {
    const hugo = { role: 'Tecnico', technician_id: 'tech-1', technician_name: 'Hugo' };
    assert.equal(
      subscriptionMatchesNotify(hugo, {
        audience: 'technicians',
        technicianNames: ['Hugo', 'Filipe'],
        technicianIds: [],
      }),
      true,
    );
    assert.equal(
      subscriptionMatchesNotify(hugo, {
        audience: 'technicians',
        technicianNames: [],
        technicianIds: ['tech-1'],
      }),
      true,
    );
    assert.equal(
      subscriptionMatchesNotify(hugo, {
        audience: 'technicians',
        technicianNames: ['Filipe'],
        technicianIds: [],
      }),
      false,
    );
    assert.equal(
      subscriptionMatchesNotify(hugo, {
        audience: 'technicians',
        technicianNames: [],
        technicianIds: [],
      }),
      false,
    );
  });
});
