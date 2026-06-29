/**
 * API de técnicos — POST /api/technicians (criação de conta Supabase Auth).
 */

import { getSession } from './session.js';
import { isRhOrAdminSession } from './auth-roles-core.js';

function requireRhSession() {
  const session = getSession();
  if (!isRhOrAdminSession(session)) {
    throw new Error('Acesso reservado a Recursos Humanos.');
  }
  if (!session.token) {
    throw new Error('Sessão expirada. Volte a iniciar sessão.');
  }
  return session;
}

/**
 * @param {{ nome: string, email: string, technicianId: string, telemovel?: string, nif?: string }} payload
 */
export async function createTechnicianAuthAccount(payload) {
  const session = requireRhSession();

  const res = await fetch('/api/technicians', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Falha ao criar conta de login do técnico.');
  }

  return body;
}
