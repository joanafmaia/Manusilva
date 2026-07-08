/**
 * Sanitização do cache local (localStorage) — remove passwords legacy.
 */

export function sanitizeUtilizadores(list) {
  if (!Array.isArray(list)) return list;
  return list.map((u) => {
    if (!u || typeof u !== 'object') return u;
    const { password, ...rest } = u;
    void password;
    return rest;
  });
}

/** @returns {boolean} true se removeu passwords */
export function stripPasswordsFromDb(db) {
  if (!db?.utilizadores?.length) return false;
  const hadPasswords = db.utilizadores.some(
    (u) => u && Object.prototype.hasOwnProperty.call(u, 'password'),
  );
  if (!hadPasswords) return false;
  db.utilizadores = sanitizeUtilizadores(db.utilizadores);
  return true;
}
