/**
 * Avisos suaves antes de submeter relatório (não bloqueiam por defeito).
 */

const OBSERVATION_FIELD_IDS = new Set(['observacoes', 'observacoes_finais', 'observacao']);

/**
 * @param {object} [service]
 * @returns {string|null}
 */
export function resolveObservationsFieldId(service) {
  const field = (service?.fields || []).find((f) => OBSERVATION_FIELD_IDS.has(f.id));
  return field?.id || null;
}

/**
 * @param {object} params
 * @param {object} params.report
 * @param {object} [params.service]
 * @param {object} [params.signaturePads]
 * @param {boolean} [params.hasFotoAntes]
 * @param {boolean} [params.hasFotoDepois]
 * @returns {string[]}
 */
export function collectSubmitWarnings({
  report,
  service = null,
  signaturePads = {},
  hasFotoAntes = false,
  hasFotoDepois = false,
}) {
  const warnings = [];
  const data = report?.data || {};
  const values = data.values || {};

  if (!hasFotoAntes && !hasFotoDepois) {
    warnings.push('Não anexou fotos do trabalho (Antes/Depois).');
  } else if (!hasFotoAntes || !hasFotoDepois) {
    warnings.push('Só anexou uma das fotos (Antes/Depois).');
  }

  const techSig = data.signatures?.technician || signaturePads?.technician?.toDataURL?.();
  const clientSig = data.signatures?.client || signaturePads?.client?.toDataURL?.();
  if (!techSig) warnings.push('Sem assinatura do técnico.');
  if (!clientSig) warnings.push('Sem assinatura do cliente.');

  const obsFieldId = resolveObservationsFieldId(service);
  if (obsFieldId) {
    const obs = String(values[obsFieldId] || '').trim();
    if (!obs) warnings.push('Campo de observações em branco.');
  }

  return warnings;
}

/**
 * @param {string[]} warnings
 * @returns {boolean} true se o utilizador confirmar
 */
export function confirmSubmitWarnings(warnings) {
  if (!warnings?.length) return true;
  const list = warnings.map((w) => `• ${w}`).join('\n');
  return window.confirm(
    `Antes de submeter, verifique:\n\n${list}\n\nDeseja submeter mesmo assim?`,
  );
}
