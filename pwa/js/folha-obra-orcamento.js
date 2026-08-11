/**
 * Orçamento MS.015 para folhas de obra R.C — ligação folha ↔ proposta ↔ armazém.
 */

import { getClient } from './entity-lookups.js';
import { getReportOrcamentoMeta } from './orcamento-linhas.js';
import { ORCAMENTO_RESPOSTA } from './orcamento-workflow.js';
import {
  STANDALONE_ORCAMENTO_SERVICE_TYPE,
  STANDALONE_ORCAMENTO_TECH_ID,
} from './orcamento-standalone.js';
import {
  getFolhaObra,
  getFolhasObraSnapshot,
  updateFolhaObra,
} from './folhas-obra-db.js';
import { upsertRelatorio } from './relatorios-db.js';
import { openOrcamentoModal } from './orcamento-modal.js';

export const FOLHA_OBRA_ORCAMENTO_ORIGEM = 'folha_obra_rc';
export const FOLHA_RESPONSABILIDADE = {
  MS: 'MS',
  RC: 'RC',
};

export function normalizeFolhaResponsabilidade(value) {
  const key = String(value || '').trim().toUpperCase();
  return key === FOLHA_RESPONSABILIDADE.MS ? FOLHA_RESPONSABILIDADE.MS : FOLHA_RESPONSABILIDADE.RC;
}

export function formatFolhaResponsabilidadeLabel(value) {
  return normalizeFolhaResponsabilidade(value) === FOLHA_RESPONSABILIDADE.MS ? 'M.S' : 'R.C';
}

export function reportIsFolhaObraOrcamento(report) {
  if (!report) return false;
  if (String(report?.data?.folhaObraId || '').trim()) return true;
  return String(report?.data?.orcamentoOrigem || '').trim() === FOLHA_OBRA_ORCAMENTO_ORIGEM;
}

export function resolveFolhaObraIdFromReport(report) {
  if (!report) return '';
  return String(report?.data?.folhaObraId || '').trim();
}

export function isFolhaObraVisibleToArmazem(folha) {
  const estado = folha?.estado || 'rascunho';
  return (
    estado === 'rascunho' ||
    estado === 'em_diagnostico' ||
    estado === 'aguarda_orcamento' ||
    estado === 'orcamento_enviado' ||
    estado === 'em_reparacao'
  );
}

export function isFolhaObraDiagnosticoEditable(folha) {
  return (
    (folha?.estado || 'rascunho') === 'em_diagnostico' &&
    normalizeFolhaResponsabilidade(folha?.responsabilidade) === FOLHA_RESPONSABILIDADE.RC
  );
}

export function isFolhaObraAguardaOrcamentoEstado(folhaOrEstado) {
  const estado = typeof folhaOrEstado === 'string' ? folhaOrEstado : folhaOrEstado?.estado || 'rascunho';
  return estado === 'aguarda_orcamento' || estado === 'orcamento_enviado';
}

export function isFolhaObraRepairEditable(folha) {
  return (folha?.estado || 'rascunho') === 'em_reparacao';
}

/**
 * Folhas R.C. ainda sem proposta MS.015 — a lista de Orçamentos trata as que já têm report.
 */
export function getFolhasObraAguardaOrcamento() {
  return getFolhasObraSnapshot()
    .filter(
      (f) =>
        normalizeFolhaResponsabilidade(f.responsabilidade) === FOLHA_RESPONSABILIDADE.RC &&
        f.estado === 'aguarda_orcamento' &&
        !String(f.orcamentoReportId || '').trim(),
    )
    .sort((a, b) => String(b.dataRececao || '').localeCompare(String(a.dataRececao || '')));
}

function formatFolhaConsumiveisForOrcamento(folha) {
  const rows = Array.isArray(folha?.intervencoes) ? folha.intervencoes : [];
  const lines = rows
    .map((row) => {
      const material = String(row?.material_servico || '').trim();
      if (!material) return '';
      const parts = [
        row?.data_intervencao || '',
        material,
        row?.quantidade ? `qtd ${row.quantidade}` : '',
        row?.horas ? `${row.horas}h` : '',
      ].filter(Boolean);
      return `• ${parts.join(' — ')}`;
    })
    .filter(Boolean);
  if (!lines.length) return '';
  return `Consumíveis:\n${lines.join('\n')}`;
}

function buildFolhaObraOrcamentoDraft(folha) {
  const client = getClient(folha.clientId);
  const nome = String(client?.Nome || client?.name || '').trim();
  if (!nome) throw new Error('Cliente inválido na folha de obra.');

  const now = new Date().toISOString();
  const equipamento = [folha.tipo, folha.marcaModelo].filter(Boolean).join(' — ');

  return {
    clientId: String(folha.clientId),
    technicianId: STANDALONE_ORCAMENTO_TECH_ID,
    serviceType: STANDALONE_ORCAMENTO_SERVICE_TYPE,
    status: 'approved',
    submittedAt: now,
    approvedAt: now,
    faturacaoStatus: 'via_folha_obra',
    forkliftSerial: folha.numeroSerie || '',
    data: {
      values: {
        nome_empresa: nome,
        cliente: nome,
        equipamento: equipamento || folha.tipo || '',
        tipo_equipamento: folha.tipo || '',
        marca_modelo: folha.marcaModelo || '',
        numero_serie: folha.numeroSerie || '',
        folha_obra_etq: folha.etq || '',
        observacoes_orcamento: [
          `Orçamento oficina — ${folha.etq || 'ETQ'} (${folha.tipo || 'equipamento'})`,
          String(folha.diagnosticoTecnico || '').trim()
            ? `Diagnóstico técnico:\n${String(folha.diagnosticoTecnico).trim()}`
            : '',
          formatFolhaConsumiveisForOrcamento(folha),
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
      orcamentoOrigem: FOLHA_OBRA_ORCAMENTO_ORIGEM,
      folhaObraId: folha.id,
      folhaObraEtq: folha.etq || '',
      orcamento: {
        tipoProposta: 'orcamento',
      },
    },
  };
}

export async function createOrcamentoFromFolhaObra(folhaId) {
  const folha = getFolhaObra(folhaId);
  if (!folha) throw new Error('Folha de obra não encontrada.');
  if (normalizeFolhaResponsabilidade(folha.responsabilidade) !== FOLHA_RESPONSABILIDADE.RC) {
    throw new Error('Só equipamentos R.C precisam de orçamento.');
  }
  if (!['aguarda_orcamento', 'orcamento_enviado'].includes(folha.estado || '')) {
    throw new Error('Esta folha já não está à espera de orçamento.');
  }
  if (folha.orcamentoReportId) return folha;

  const draft = buildFolhaObraOrcamentoDraft(folha);
  const saved = await upsertRelatorio(draft);
  if (!saved?.id) throw new Error('Não foi possível criar a proposta.');

  return updateFolhaObra(folhaId, {
    orcamentoReportId: saved.id,
  });
}

export async function openFolhaObraOrcamentoEditor(folhaId, { onUpdated } = {}) {
  const folha = await createOrcamentoFromFolhaObra(folhaId);
  const reportId = folha.orcamentoReportId;
  if (!reportId) throw new Error('Proposta não encontrada.');

  const { getReport } = await import('./app.js');
  const report = getReport(reportId);
  if (!report) throw new Error('Proposta não encontrada.');

  const { resolveOrcamentoPastaKey } = await import('./orcamento-cabecalho.js');
  openOrcamentoModal(report, {
    pastaKey: resolveOrcamentoPastaKey(report),
    onUpdated: async (updated) => {
      await syncFolhaObraFromOrcamentoReport(updated);
      onUpdated?.(updated);
    },
  });
  return report;
}

export async function syncFolhaObraFromOrcamentoReport(report) {
  if (!reportIsFolhaObraOrcamento(report)) return null;

  const folhaId = resolveFolhaObraIdFromReport(report);
  if (!folhaId) return null;

  const folha = getFolhaObra(folhaId);
  if (!folha) return null;

  const meta = getReportOrcamentoMeta(report) || {};
  const resposta = String(meta.respostaCliente || '').trim().toLowerCase();
  const patch = {
    orcamentoReportId: folha.orcamentoReportId || report.id,
  };

  if (resposta === ORCAMENTO_RESPOSTA.ACEITE) {
    patch.estado = 'em_reparacao';
    patch.orcamentoAceiteEm = meta.respostaClienteEm || new Date().toISOString();
  } else if (meta.enviadoEm && folha.estado === 'aguarda_orcamento') {
    patch.estado = 'orcamento_enviado';
  } else if (!meta.enviadoEm && folha.estado === 'orcamento_enviado' && !resposta) {
    patch.estado = 'aguarda_orcamento';
  }

  return updateFolhaObra(folhaId, patch);
}

export async function syncAllFolhasObraOrcamentoStates() {
  const { getReportsSnapshot } = await import('./relatorios-db.js');
  const folhas = getFolhasObraSnapshot().filter((f) => f.orcamentoReportId);
  if (!folhas.length) return;

  const reports = getReportsSnapshot();
  const byId = new Map(reports.map((r) => [String(r.id), r]));

  for (const folha of folhas) {
    const report = byId.get(String(folha.orcamentoReportId));
    if (report) {
      await syncFolhaObraFromOrcamentoReport(report);
    }
  }
}

/** Aceite do cliente — liberta folha R.C para o armazém (não vai direto a Faturação). */
export async function handleOrcamentoRespostaForFolhaObra(report) {
  if (!reportIsFolhaObraOrcamento(report)) return null;
  return syncFolhaObraFromOrcamentoReport(report);
}

/**
 * Elimina proposta MS.015 ligada a folha R.C. (só se ainda não enviada) e liberta a folha.
 * @param {string} reportId
 */
export async function deleteFolhaObraOrcamentoReport(reportId) {
  const { getReport } = await import('./app.js');
  const { deleteRelatorioById } = await import('./relatorios-db.js');
  const { showToast } = await import('./toast-modal.js');

  const report = getReport(reportId);
  if (!report || !reportIsFolhaObraOrcamento(report)) {
    showToast('Esta proposta de folha de obra não foi encontrada.', 'error');
    return false;
  }

  const meta = getReportOrcamentoMeta(report);
  if (meta?.enviadoEm) {
    showToast('A proposta já foi enviada ao cliente. Não é possível eliminar.', 'warning', 8000);
    return false;
  }

  const folhaId = resolveFolhaObraIdFromReport(report);
  const folha = folhaId ? getFolhaObra(folhaId) : null;
  const label = folha?.etq || 'esta folha';

  const ok = window.confirm(
    `Eliminar o orçamento MS.015 de ${label}?\n\nA folha de obra mantém-se e volta a ficar disponível para criar nova proposta.`,
  );
  if (!ok) return false;

  try {
    await deleteRelatorioById(reportId);
    if (folhaId) {
      const estado = folha?.estado === 'orcamento_enviado' ? 'aguarda_orcamento' : folha?.estado;
      await updateFolhaObra(folhaId, {
        orcamentoReportId: '',
        ...(estado ? { estado } : {}),
      });
    }
    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast('Orçamento da folha eliminado.', 'success');
    return true;
  } catch (err) {
    console.error('[ManuSilva] deleteFolhaObraOrcamentoReport:', err);
    showToast(err?.message || 'Erro ao eliminar o orçamento da folha.', 'error', 9000);
    return false;
  }
}
