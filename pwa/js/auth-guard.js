/**
 * Proteção de rotas por sessão (painéis RH e técnico).
 */

import { getSession } from './session.js';
import { isRhOrAdminSession } from './auth-roles-core.js';

export function requireAuth(role) {
  const session = getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  if (role === 'admin' && !isRhOrAdminSession(session)) {
    window.location.href = 'dashboard.html';
    return null;
  }
  if (role === 'technician' && session.role !== 'technician') {
    window.location.href = session.role === 'admin' ? 'admin.html' : 'index.html';
    return null;
  }
  if (role && session.role !== role) {
    window.location.href = session.role === 'admin' ? 'admin.html' : 'dashboard.html';
    return null;
  }
  return session;
}
