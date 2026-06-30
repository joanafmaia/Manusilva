/**
 * Proteção de rotas por sessão (painéis RH e técnico).
 */

import { getSession } from './session.js';
import { isRhOrAdminSession } from './auth-roles-core.js';

function normalizeRequiredRole(role) {
  if (role === 'RH' || role === 'rh') return 'admin';
  return role;
}

export function requireAuth(role) {
  const session = getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  const required = normalizeRequiredRole(role);
  if (required === 'admin' && !isRhOrAdminSession(session)) {
    window.location.href = 'dashboard.html';
    return null;
  }
  if (required === 'technician' && session.role !== 'technician') {
    window.location.href = session.role === 'admin' ? 'admin.html' : 'index.html';
    return null;
  }
  if (required && session.role !== required) {
    window.location.href = session.role === 'admin' ? 'admin.html' : 'dashboard.html';
    return null;
  }
  return session;
}
