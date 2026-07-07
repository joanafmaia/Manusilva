/**
 * Proteção de rotas por sessão (painéis RH e técnico).
 */

import { getSession } from './session.js';
import { isRhOrAdminSession } from './auth-roles-core.js';

function normalizeRequiredRole(role) {
  if (role === 'RH' || role === 'rh') return 'admin';
  return role;
}

function dashboardUrlForSession(session) {
  if (!session) return 'index.html';
  if (session.role === 'admin') return 'admin.html';
  if (session.role === 'warehouse') return 'warehouse.html';
  return 'dashboard.html';
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
    window.location.href = dashboardUrlForSession(session);
    return null;
  }
  if (required === 'warehouse' && session.role !== 'warehouse') {
    window.location.href = dashboardUrlForSession(session);
    return null;
  }
  if (required && session.role !== required) {
    window.location.href = dashboardUrlForSession(session);
    return null;
  }
  return session;
}
