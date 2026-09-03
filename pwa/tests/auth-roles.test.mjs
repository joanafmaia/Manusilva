import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRhOrAdminRole,
  isRhOrAdminEmail,
  isRhOrAdminAuthUser,
  isRhOrAdminSession,
  isWarehouseSession,
  isEmployeeDbRole,
  resolveRoleForLoginFilter,
  normalizeDbRole,
  mapDbRoleToUi,
  mapUiRoleToDb,
} from '../js/auth-roles-core.js';

describe('auth-roles', () => {
  it('aceita variantes de role RH/Admin', () => {
    assert.equal(isRhOrAdminRole('RH'), true);
    assert.equal(isRhOrAdminRole('admin'), true);
    assert.equal(isRhOrAdminRole('Admin'), true);
    assert.equal(isRhOrAdminRole('Tecnico'), false);
    assert.equal(normalizeDbRole('Armazem'), 'Armazem');
  });

  it('mapeia roles DB ↔ UI de forma consistente', () => {
    assert.equal(mapDbRoleToUi('RH'), 'admin');
    assert.equal(mapDbRoleToUi('admin'), 'admin');
    assert.equal(mapDbRoleToUi('Tecnico'), 'technician');
    assert.equal(mapDbRoleToUi('Armazem'), 'warehouse');
    assert.equal(mapUiRoleToDb('admin'), 'RH');
    assert.equal(mapUiRoleToDb('warehouse'), 'Armazem');
    assert.equal(mapUiRoleToDb('technician'), 'Tecnico');
  });

  it('reconhece e-mails RH (Joana e identificadores da Filipa)', () => {
    assert.equal(isRhOrAdminEmail('joanamaia97@gmail.com'), true);
    assert.equal(isRhOrAdminEmail('filipa@sistema.com'), true);
    assert.equal(isRhOrAdminEmail('filipa@rh.manusilva.internal'), true);
    assert.equal(isRhOrAdminEmail('filipasilvahugo2013@gmail.com'), false);
  });

  it('reconhece sessão da Filipa pelo nome', () => {
    assert.equal(isRhOrAdminSession({ role: 'admin', name: 'Filipa' }), true);
  });

  it('valida utilizador Supabase Auth', () => {
    assert.equal(
      isRhOrAdminAuthUser({ email: 'joanamaia97@gmail.com', user_metadata: {} }),
      true,
    );
    assert.equal(
      isRhOrAdminAuthUser({ email: 'x@y.com', user_metadata: { role: 'admin' } }),
      true,
    );
    assert.equal(
      isRhOrAdminAuthUser({ email: 'x@y.com', user_metadata: { nome: 'Joana' } }),
      false,
    );
  });

  it('valida sessão UI admin', () => {
    assert.equal(isRhOrAdminSession({ role: 'admin', username: 'joanamaia97@gmail.com' }), true);
    assert.equal(isRhOrAdminSession({ role: 'technician' }), false);
    assert.equal(isWarehouseSession({ role: 'warehouse' }), true);
  });

  it('login no perfil Armazém aceita qualquer funcionário', () => {
    assert.equal(isEmployeeDbRole('RH'), true);
    assert.equal(isEmployeeDbRole('Tecnico'), true);
    assert.equal(isEmployeeDbRole('Armazem'), true);
    assert.equal(resolveRoleForLoginFilter('RH', 'Armazem'), 'Armazem');
    assert.equal(resolveRoleForLoginFilter('Tecnico', 'Armazem'), 'Armazem');
    assert.equal(resolveRoleForLoginFilter('RH', 'RH'), 'RH');
  });
});
