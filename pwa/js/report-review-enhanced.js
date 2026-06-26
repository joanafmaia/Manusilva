/**
 * Revisão RH — validação, resumo executivo, tabs e rejeição com modelos.
 */

import { escapeHtml } from './app.js';
import { resolveJobFotos } from './job-fotos.js';
import { formatReportAge } from './rh-panel-utils.js';
import { countFilledFields } from './form-engine.js';

const REJECT_NOTE_TEMPLATES = [
  { label: 'Faltam fotos', text: 'Faltam fotos do trabalho. Por favor anexe fotos Antes/Depois antes de reenviar.' },
  { label: 'Corrigir datas', text: 'As datas do relatório estão incorretas. Verifique e corrija antes de reenviar.' },
  { label: 'Dados incompletos', text: 'O relatório está incompleto. Preencha todos os campos obrigatórios.' },
  { label: 'Assinaturas em falta', text: 'Faltam assinaturas (técnico e/ou cliente). Complete antes de reenviar.' },
];

function isValidEmail(email) {
  const e = String(email || '').trim();
  return e.length > 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function grandesCellAlert(key, val) {
  const t = String(val || '');
  if (key === 'nivel_eletrolito' && /reposi|abaixo|urgent/i.test(t)) return 'warning';
  if (key === 'curto_circuito' && /^sim$/i.test(t.trim())) return 'danger';
  return '';
}

/** Verificações visíveis antes de aprovar */
export function computeReviewChecks({ report, job, client, values = {} }) {
  const checks = [];
  const email = String(client?.email || client?.['E-mail'] || '').trim();

  checks.push({
    id: 'email',
    label: 'E-mail do cliente válido',
    ok: isValidEmail(email),
    level: isValidEmail(email) ? 'ok' : 'error',
  });

  const sig = report?.data?.signatures || {};
  checks.push({
    id: 'sig-tech',
    label: 'Assinatura do técnico',
    ok: Boolean(sig.technician),
    level: sig.technician ? 'ok' : 'error',
  });
  checks.push({
    id: 'sig-client',
    label: 'Assinatura do cliente',
    ok: Boolean(sig.client),
    level: sig.client ? 'ok' : 'warn',
  });

  const { antes, depois } = resolveJobFotos(job, report);
  const hasFotos = Boolean(antes || depois);
  checks.push({
    id: 'fotos',
    label: 'Fotos anexadas',
    ok: hasFotos,
    level: hasFotos ? 'ok' : 'warn',
    optional: true,
  });

  const rows = values.identificacao_baterias;
  if (Array.isArray(rows)) {
    rows.forEach((row, i) => {
      const label = row.maquina ? `Bateria: ${row.maquina}` : `Bateria ${i + 1}`;
      if (grandesCellAlert('nivel_eletrolito', row.nivel_eletrolito)) {
        checks.push({
          id: `nivel-${i}`,
          label: `${label} — nível de eletrólito crítico`,
          ok: false,
          level: 'warn',
        });
      }
      if (grandesCellAlert('curto_circuito', row.curto_circuito) === 'danger') {
        checks.push({
          id: `curto-${i}`,
          label: `${label} — curto-circuito detetado`,
          ok: false,
          level: 'error',
        });
      }
    });
  }

  return checks;
}

export function reviewHasBlockingIssues(checks) {
  return checks.some((c) => !c.ok && c.level === 'error' && !c.optional);
}

export function renderReviewValidationPanel(checks) {
  if (!checks.length) return '';

  const items = checks
    .map((c) => {
      const icon = c.ok ? '✓' : c.level === 'error' ? '✗' : '⚠';
      const cls = c.ok ? 'ok' : c.level === 'error' ? 'error' : 'warn';
      return `
        <li class="review-check-item review-check-item--${cls}">
          <span class="review-check-item__icon" aria-hidden="true">${icon}</span>
          <span>${escapeHtml(c.label)}</span>
        </li>`;
    })
    .join('');

  const hasBlock = reviewHasBlockingIssues(checks);

  return `
    <section class="review-validation" aria-label="Verificações antes de aprovar">
      <h4 class="review-validation__title">Verificações</h4>
      <ul class="review-check-list">${items}</ul>
      ${hasBlock ? '<p class="review-validation__hint review-validation__hint--error">Corrija os itens em vermelho antes de aprovar (ou rejeite com nota ao técnico).</p>' : ''}
    </section>`;
}

/** Bullets de resumo executivo */
export function buildReviewExecutiveBullets({ service, report, job, client, tech, values = {} }) {
  const bullets = [];
  const filled = service ? countFilledFields(service, values) : 0;

  bullets.push({
    text: `${filled} campo${filled === 1 ? '' : 's'} preenchido${filled === 1 ? '' : 's'}`,
    tone: 'muted',
  });

  if (values.estado_final) {
    bullets.push({ text: `Estado final: ${values.estado_final}`, tone: 'primary' });
  }
  if (values.observacao || values.observacoes) {
    const obs = String(values.observacao || values.observacoes).trim();
    if (obs) {
      bullets.push({
        text: obs.length > 120 ? `${obs.slice(0, 117)}…` : obs,
        tone: 'muted',
      });
    }
  }

  if (String(values.pedido_orcamento || '').trim().toLowerCase() === 'sim') {
    const detalhe = String(values.detalhe_pedido_orcamento || '').trim();
    bullets.push({
      text: detalhe
        ? `Pedido de orçamento: ${detalhe.length > 90 ? `${detalhe.slice(0, 87)}…` : detalhe}`
        : 'Pedido de orçamento: Sim (sem detalhe)',
      tone: 'warning',
    });
  }

  const rows = values.identificacao_baterias;
  if (Array.isArray(rows) && rows.length) {
    bullets.push({
      text: `${rows.length} bateria${rows.length === 1 ? '' : 's'} identificada${rows.length === 1 ? '' : 's'}`,
      tone: 'primary',
    });
  }

  if (report?.submittedAt) {
    bullets.push({
      text: `Submetido ${formatReportAge(report.submittedAt)}`,
      tone: 'muted',
    });
  }

  void job;
  void client;
  void tech;

  return bullets;
}

export function renderReviewExecutiveList(bullets) {
  if (!bullets.length) {
    return '<p class="text-muted review-empty-hint">Sem resumo disponível.</p>';
  }
  return `
    <ul class="review-executive-list">
      ${bullets
        .map(
          (b) =>
            `<li class="review-executive-list__item review-executive-list__item--${b.tone || 'muted'}">${escapeHtml(b.text)}</li>`,
        )
        .join('')}
    </ul>`;
}

export function renderReviewTabsNav(active = 'resumo') {
  const tabs = [
    { id: 'resumo', label: 'Resumo' },
    { id: 'pdf', label: 'PDF' },
    { id: 'dados', label: 'Dados completos' },
  ];
  return `
    <nav class="review-tabs" role="tablist" aria-label="Vistas do relatório">
      ${tabs
        .map(
          (t) => `
        <button
          type="button"
          class="review-tabs__btn${active === t.id ? ' is-active' : ''}"
          role="tab"
          aria-selected="${active === t.id ? 'true' : 'false'}"
          data-review-tab="${t.id}"
        >${escapeHtml(t.label)}</button>`,
        )
        .join('')}
    </nav>`;
}

export function bindReviewTabs(root) {
  if (!root) return;
  const buttons = [...root.querySelectorAll('[data-review-tab]')];
  const panels = [...root.querySelectorAll('[data-review-panel]')];
  if (!buttons.length || !panels.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.reviewTab;
      buttons.forEach((b) => {
        const on = b.dataset.reviewTab === id;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      panels.forEach((p) => {
        const on = p.dataset.reviewPanel === id;
        p.classList.toggle('is-active', on);
        p.hidden = !on;
      });
    });
  });
}

export function bindRejectNoteTemplates(overlay) {
  const textarea = overlay?.querySelector('#reject-note');
  if (!textarea) return;

  overlay.querySelectorAll('[data-reject-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.rejectTemplate || '';
      if (!text) return;
      const current = textarea.value.trim();
      textarea.value = current ? `${current}\n\n${text}` : text;
      textarea.focus();
    });
  });
}

export function renderRejectNoteTemplates() {
  return `
    <div class="review-reject-templates" role="group" aria-label="Modelos de nota">
      <p class="text-muted review-reject-templates__label">Modelos rápidos:</p>
      <div class="review-reject-templates__btns">
        ${REJECT_NOTE_TEMPLATES.map(
          (t) =>
            `<button type="button" class="btn-outline btn-sm" data-reject-template="${escapeAttr(t.text)}">${escapeHtml(t.label)}</button>`,
        ).join('')}
      </div>
    </div>`;
}

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

export function reviewJobHasFotos(job, report) {
  const { antes, depois } = resolveJobFotos(job, report);
  return Boolean(antes || depois);
}
