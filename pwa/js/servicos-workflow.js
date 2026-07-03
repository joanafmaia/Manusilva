/**
 * Atribuição, reagendamento e eliminação de serviços (visitas ao cliente).
 */

import { showToast } from './toast-modal.js';
import { formatDateLong } from './date-utils.js';
import { isTestClient } from './client-test-utils.js';
import { getClient } from './entity-lookups.js';
import {
  insertServico,
  updateServico,
  formatServicosError,
  getServico,
  invalidateServicosCache,
  removeServicoFromCache,
} from './servicos-db.js';
import { deleteRelatoriosByServico } from './relatorios-db.js';
import { deleteTrabalho, ensureJobsLoaded } from './trabalhos-db.js';

/**
 * RH cria um serviço (visita) — sem tipo de relatório fixo.
 * @param {{ technicianId: string, clientId: string, date: string, time?: string }} data
 */
export async function assignServico(data) {
  try {
    const client = getClient(data.clientId);
    const servico = await insertServico({
      clientId: data.clientId,
      date: data.date,
      time: data.time || '',
      technicianIds: data.technicianId || '',
      status: 'scheduled',
    });

    if (!servico?.id) {
      showToast('Serviço gravado, mas não foi possível confirmar a resposta.', 'warning');
      return null;
    }

    if (isTestClient(client)) {
      showToast('Serviço de teste criado — não consome número OP oficial.', 'info', 5500);
    } else {
      showToast('Serviço criado e guardado na base de dados.', 'success');
    }

    window.dispatchEvent(new CustomEvent('db-updated'));
    return servico.id;
  } catch (err) {
    console.error('[ManuSilva] assignServico:', err);
    showToast(formatServicosError(err), 'error', 9000);
    return null;
  }
}

export async function rescheduleServico(servicoId, newDate) {
  const date = String(newDate ?? '')
    .trim()
    .split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showToast('Introduza uma data válida.', 'error');
    return false;
  }

  const servico = getServico(servicoId);
  if (!servico) {
    showToast('Serviço não encontrado.', 'error');
    return false;
  }
  if (servico.date === date) {
    showToast('O serviço já está marcado para essa data.', 'info');
    return true;
  }

  try {
    await updateServico(servicoId, { data: date });
    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast(`Serviço reagendado para ${formatDateLong(date)}.`, 'success');
    return true;
  } catch (err) {
    console.error('[ManuSilva] rescheduleServico:', err);
    showToast(formatServicosError(err), 'error', 9000);
    return false;
  }
}

export async function deleteServico(servicoId) {
  try {
    await deleteRelatoriosByServico(servicoId);
    try {
      await deleteTrabalho(servicoId);
    } catch {
      /* trabalho legado pode já não existir */
    }

    const { getAuthenticatedSupabaseClient } = await import('./supabase-client.js');
    const supabase = await getAuthenticatedSupabaseClient();
    const { error } = await supabase.from('servicos').delete().eq('id', servicoId);
    if (error) throw error;

    invalidateServicosCache();
    removeServicoFromCache(servicoId);
    await ensureJobsLoaded(true);
    showToast('Serviço eliminado.', 'success');
    window.dispatchEvent(new CustomEvent('db-updated'));
    return true;
  } catch (err) {
    console.error('[ManuSilva] deleteServico:', err);
    showToast(formatServicosError(err), 'error', 9000);
    return false;
  }
}
