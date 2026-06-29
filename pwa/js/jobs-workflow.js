/**
 * Atribuição, reagendamento e eliminação de trabalhos.
 */

import { showToast } from './toast-modal.js';
import { formatDateLong } from './date-utils.js';
import { isTestClient } from './client-test-utils.js';
import { getClient, getJob } from './entity-lookups.js';
import {
  ensureJobsLoaded,
  insertTrabalho,
  deleteTrabalho,
  patchTrabalho,
  formatTrabalhosError,
} from './trabalhos-db.js';
import { deleteRelatoriosByTrabalho } from './relatorios-db.js';

export async function assignJob(jobData) {
  try {
    const client = getClient(jobData.clientId);
    const job = await insertTrabalho({
      ...jobData,
      status: 'scheduled',
      rejectionNote: null,
    });
    if (!job) {
      showToast('Trabalho gravado, mas não foi possível confirmar a resposta.', 'warning');
      await ensureJobsLoaded(true);
      window.dispatchEvent(new CustomEvent('db-updated'));
      return null;
    }
    if (isTestClient(client)) {
      showToast('Trabalho de teste criado — não consome número OP oficial.', 'info', 5500);
    } else {
      showToast('Trabalho atribuído e guardado na base de dados.', 'success');
    }
    window.dispatchEvent(new CustomEvent('db-updated'));
    return job.id;
  } catch (err) {
    console.error('[ManuSilva] assignJob:', err);
    showToast(formatTrabalhosError(err), 'error', 9000);
    return null;
  }
}

export async function rescheduleJob(jobId, newDate) {
  const date = String(newDate ?? '')
    .trim()
    .split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showToast('Introduza uma data válida.', 'error');
    return false;
  }

  const job = getJob(jobId);
  if (!job) {
    showToast('Trabalho não encontrado.', 'error');
    return false;
  }
  if (job.date === date) {
    showToast('O trabalho já está marcado para essa data.', 'info');
    return true;
  }

  try {
    await patchTrabalho(jobId, { date });
    window.dispatchEvent(new CustomEvent('db-updated'));
    showToast(`Trabalho reagendado para ${formatDateLong(date)}.`, 'success');
    return true;
  } catch (err) {
    console.error('[ManuSilva] rescheduleJob:', err);
    showToast(formatTrabalhosError(err), 'error', 9000);
    return false;
  }
}

export async function deleteJob(jobId) {
  try {
    await deleteRelatoriosByTrabalho(jobId);
    await deleteTrabalho(jobId);
    showToast('Trabalho eliminado.', 'success');
    window.dispatchEvent(new CustomEvent('db-updated'));
    return true;
  } catch (err) {
    console.error('[ManuSilva] deleteJob:', err);
    showToast(formatTrabalhosError(err), 'error', 9000);
    return false;
  }
}
