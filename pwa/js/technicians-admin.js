/**
 * Criação de técnicos (Supabase Auth + registo local).
 */

import { showToast } from './toast-modal.js';
import { getDB, updateDB } from './local-db.js';
import { getAllTechnicians } from './entity-lookups.js';

const TECHNICIAN_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];

function nextTechnicianId() {
  const ids = getAllTechnicians().map((t) => {
    const m = /^tech-(\d+)$/.exec(t.id || '');
    return m ? Number(m[1]) : 0;
  });
  return `tech-${Math.max(0, ...ids, 0) + 1}`;
}

/**
 * @returns {Promise<object|null>} registo do técnico
 */
export async function addTechnician({ nome, email, telemovel, nif }) {
  const name = String(nome || '').trim();
  const mail = String(email || '').trim();
  const phone = String(telemovel || '').trim();
  if (!name || !mail || !phone) {
    showToast('Preencha nome, e-mail e telemóvel do técnico.', 'error');
    return null;
  }

  const emailKey = mail.toLowerCase();
  const db = getDB();
  const utilizadores = db.utilizadores || [];
  if (utilizadores.some((u) => u.role === 'Tecnico' && String(u.email || '').toLowerCase() === emailKey)) {
    showToast('Já existe um técnico com este e-mail.', 'error');
    return null;
  }

  const id = nextTechnicianId();
  const storedTechs = db.technicians || [];
  const color = TECHNICIAN_COLORS[storedTechs.length % TECHNICIAN_COLORS.length];

  try {
    const { createTechnicianAuthAccount } = await import('./technicians-api.js');
    await createTechnicianAuthAccount({
      nome: name,
      email: mail,
      technicianId: id,
      telemovel: phone,
      nif: String(nif || '').trim(),
    });
  } catch (err) {
    showToast(err?.message || 'Não foi possível criar a conta de login do técnico.', 'error', 8000);
    return null;
  }

  const technician = {
    id,
    name,
    email: mail,
    phone,
    nif: String(nif || '').trim(),
    color,
  };

  const utilizador = {
    nome: name,
    nif: String(nif || '').trim() || null,
    telemovel: phone,
    email: mail,
    role: 'Tecnico',
    technicianId: id,
  };

  updateDB((d) => {
    if (!Array.isArray(d.technicians)) d.technicians = [];
    if (!Array.isArray(d.utilizadores)) d.utilizadores = [];
    d.technicians.push(technician);
    d.utilizadores.push(utilizador);
  });

  showToast(
    `Técnico «${name}» adicionado. Conta de login criada no Supabase Auth.`,
    'success',
    5500,
  );
  return technician;
}
