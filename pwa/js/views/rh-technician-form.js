/**
 * Formulário RH — novo técnico (equipa + metadados de login)
 */

import {
  addTechnician,
  escapeHtml,
  getClient,
  getServiceType,
  getTechnician,
  openModal,
} from '../app.js';
import {
  countConcluidosForTechnician,
  getConcluidosForTechnician,
} from '../team-stats.js';

export function renderTechnicianFormSection() {
  return `
    <section class="rh-register rh-section" data-rh-tech-form aria-labelledby="rh-tech-form-title">
      <h3 id="rh-tech-form-title" class="dashboard-section-title">Novo técnico</h3>
      <p class="rh-register-hint text-muted">
        O técnico passa a aparecer no calendário, nas atribuições e no ecrã de login (perfil Técnico).
        A conta Supabase Auth é criada automaticamente com o mesmo e-mail; a palavra-passe inicial segue o formato interno
        <strong>Nome.2026</strong> (primeira letra maiúscula). Comunique-a ao técnico em canal seguro — nunca por e-mail em massa.
      </p>
      <form id="rh-tech-form" class="rh-register-form" novalidate>
        <div class="form-group">
          <label class="form-label" for="rh-tech-nome">Nome completo *</label>
          <input type="text" class="form-input" id="rh-tech-nome" required autocomplete="name">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="rh-tech-email">E-mail (login) *</label>
            <input type="email" class="form-input" id="rh-tech-email" required autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label" for="rh-tech-phone">Telemóvel *</label>
            <input type="tel" class="form-input" id="rh-tech-phone" required autocomplete="tel">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="rh-tech-nif">NIF</label>
          <input type="text" class="form-input" id="rh-tech-nif" inputmode="numeric">
        </div>
        <button type="submit" class="btn-primary rh-register-submit">Adicionar técnico</button>
      </form>
    </section>
  `;
}

function technicianInitials(name) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);
}

/** Badge «N Concluídos» — clicável para abrir o histórico do técnico. */
function renderConcluidosBadge(count) {
  return `<span class="tech-done-badge" title="Relatórios concluídos no terreno">${count} Concluído${count === 1 ? '' : 's'}</span>`;
}

function renderTechnicianCards(technicians, counts) {
  return technicians
    .map(
      (t) => `
    <div class="employee-card" data-tech-id="${escapeHtml(t.id)}" tabindex="0" role="button" aria-label="Histórico de serviços de ${escapeHtml(t.name)}">
      <div class="employee-avatar" style="background:${t.color}20;color:${t.color}">${escapeHtml(
        technicianInitials(t.name),
      )}</div>
      <div class="employee-info">
        <h4>${escapeHtml(t.name)} ${renderConcluidosBadge(counts.get(t.id) ?? 0)}</h4>
        <p class="text-muted">${escapeHtml(t.email)}</p>
        <p class="text-muted">${escapeHtml(t.phone || '—')}</p>
      </div>
      <div class="employee-status online-dot">Ativo</div>
    </div>
  `,
    )
    .join('');
}

function renderTechniciansTable(technicians, counts) {
  return `
    <div class="rh-table-scroll">
      <table class="rh-data-table rh-data-table--compact rh-employees-table">
        <thead>
          <tr>
            <th scope="col">Técnico</th>
            <th scope="col">E-mail</th>
            <th scope="col">Telemóvel</th>
            <th scope="col">Concluídos</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${technicians
            .map(
              (t) => `
            <tr class="rh-data-table-row" data-tech-id="${escapeHtml(t.id)}" tabindex="0" role="button" aria-label="Histórico de serviços de ${escapeHtml(t.name)}">
              <td>
                <div class="rh-table-tech-cell">
                  <div class="employee-avatar" style="background:${t.color}20;color:${t.color}">${escapeHtml(
                    technicianInitials(t.name),
                  )}</div>
                  <span class="rh-table-tech-name">${escapeHtml(t.name)}</span>
                </div>
              </td>
              <td data-col-label="E-mail">${escapeHtml(t.email)}</td>
              <td data-col-label="Telemóvel">${escapeHtml(t.phone || '—')}</td>
              <td data-col-label="Concluídos">${renderConcluidosBadge(counts.get(t.id) ?? 0)}</td>
              <td data-col-label="Estado"><span class="employee-status online-dot">Ativo</span></td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderTechniciansList(technicians) {
  if (!technicians.length) {
    return '<p class="text-muted empty-inline">Sem técnicos registados.</p>';
  }

  const counts = new Map(
    technicians.map((t) => [t.id, countConcluidosForTechnician(t)]),
  );

  return `
    <div class="rh-employees-cards">${renderTechnicianCards(technicians, counts)}</div>
    <div class="rh-employees-table-wrap">${renderTechniciansTable(technicians, counts)}</div>
  `;
}

/* ─── Histórico de serviços do técnico (modal, linhas compactas) ─── */

function formatHistoryRowDate(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatHistoryMonthLabel(isoDate) {
  if (!isoDate) return 'Sem data';
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'Sem data';
  const label = d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function renderTechnicianHistoryRows(items) {
  if (!items.length) {
    return '<p class="text-muted empty-inline">Este técnico ainda não tem relatórios concluídos.</p>';
  }

  // Agrupa por mês/ano — mesmo padrão do Histórico de Realizados dos técnicos
  const groups = new Map();
  items.forEach((item) => {
    const key = item.date ? item.date.slice(0, 7) : 'sem-data';
    if (!groups.has(key)) {
      groups.set(key, { label: formatHistoryMonthLabel(item.date), items: [] });
    }
    groups.get(key).items.push(item);
  });

  return [...groups.values()]
    .map(
      (group) => `
        <section class="realizados-month-group">
          <h3 class="realizados-month-heading">${escapeHtml(group.label)}</h3>
          <div class="tech-job-rows">
            ${group.items
              .map(({ report, job, date }) => {
                const client = getClient(report.clientId || job?.clientId);
                const service = getServiceType(report.serviceType || job?.serviceType);
                return `
                  <div class="tech-job-row tech-job-row--approved">
                    <span class="tech-job-row-date">${formatHistoryRowDate(date)}</span>
                    <span class="tech-job-row-client">${escapeHtml(client?.name || 'Cliente')}</span>
                    <span class="tech-job-row-service">${service?.icon || '🔧'} ${escapeHtml(service?.label || report.serviceType || 'Relatório')}</span>
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>
      `,
    )
    .join('');
}

export function openTechnicianHistoryModal(techId) {
  const tech = getTechnician(techId);
  if (!tech) return;

  const items = getConcluidosForTechnician(tech);
  const content = `
    <p class="text-muted tech-history-modal-summary">
      ${items.length} serviço${items.length === 1 ? '' : 's'} concluído${items.length === 1 ? '' : 's'} no terreno.
    </p>
    <div class="tech-history-modal-list">${renderTechnicianHistoryRows(items)}</div>
  `;

  openModal(`🛠 Serviços de ${tech.name}`, content);
}

/** Liga o clique nos cards/linhas da equipa ao modal de histórico. */
export function bindTechniciansListEvents(listEl) {
  if (!listEl) return;
  listEl.querySelectorAll('[data-tech-id]').forEach((el) => {
    el.addEventListener('click', () => openTechnicianHistoryModal(el.dataset.techId));
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      openTechnicianHistoryModal(el.dataset.techId);
    });
  });
}

/**
 * @param {HTMLElement} root
 * @param {{ onSuccess?: () => void }} [callbacks]
 */
export function mountTechnicianForm(root, callbacks = {}) {
  const form = root?.querySelector('#rh-tech-form');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = form.querySelector('.rh-register-submit');
    const defaultLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'A criar conta…';

    try {
      const tech = await addTechnician({
        nome: form.querySelector('#rh-tech-nome')?.value,
        email: form.querySelector('#rh-tech-email')?.value,
        telemovel: form.querySelector('#rh-tech-phone')?.value,
        nif: form.querySelector('#rh-tech-nif')?.value,
      });

      if (tech) {
        form.reset();
        callbacks.onSuccess?.();
      }
    } finally {
      btn.disabled = false;
      btn.textContent = defaultLabel;
    }
  });
}
