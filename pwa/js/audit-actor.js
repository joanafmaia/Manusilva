/**
 * Identificação do utilizador RH para trilhos de auditoria.
 */

import { getSession } from './session.js';

/** Nome ou e-mail do utilizador autenticado (fallback «RH»). */
export function resolveAuditActor() {
  const session = getSession();
  return session?.name || session?.username || session?.email || 'RH';
}
