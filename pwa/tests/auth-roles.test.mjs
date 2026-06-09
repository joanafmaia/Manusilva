import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRhOrAdminRole,
  isRhOrAdminEmail,
  isRhOrAdminAuthUser,
  isRhOrAdminSession,
} from '../js/auth-roles.js';

describe('auth-roles', () => {
  it('aceita variantes de role RH/Admin', () => {
    assert.equal(isRhOrAdminRole('RH'), true);
    assert.equal(isRhOrAdminRole('admin'), true);
    assert.equal(isRhOrAdminRole('Admin'), true);
    assert.equal(isRhOrAdminRole('Tecnico'), false);
  });

  it('reconhece e-mails RH (Joana e identificador interno da Filipa)', () => {
    assert.equal(isRhOrAdminEmail('joanamaia97@gmail.com'), true);
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
  });

  it('valida sessão UI admin', () => {
    assert.equal(isRhOrAdminSession({ role: 'admin', username: 'joanamaia97@gmail.com' }), true);
    assert.equal(isRhOrAdminSession({ role: 'technician' }), false);
  });
});
