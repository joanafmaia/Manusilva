/**
 * Nomes e contactos de cliente — unifica chaves mock (Nome) e catálogo (name).
 */

export function getClientName(client, values = {}) {
  return String(
    values.nome_empresa || values.cliente || client?.name || client?.Nome || '',
  ).trim();
}

export function getClientEmail(client) {
  return String(client?.email || client?.['E-mail'] || '').trim();
}
