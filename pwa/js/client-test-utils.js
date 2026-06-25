/**
 * Clientes de simulação — não consomem número OP oficial.
 */

export function isTestClientName(nome) {
  return String(nome || '')
    .trim()
    .toLowerCase()
    .startsWith('cliente teste');
}

/** @param {object|null|undefined} client */
export function isTestClient(client) {
  if (!client) return false;
  if (client.ehTeste === true || client.eh_teste === true) return true;
  const nome = client.Nome || client.name || client.nome_empresa || '';
  return isTestClientName(nome);
}

/** Rótulo de ordem para trabalhos de teste (sem OP oficial). */
export const TEST_JOB_ORDEM_LABEL = 'TESTE';
