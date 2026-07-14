/**
 * Página dedicada — editor MS.015 em ecrã completo (RH).
 */

import {
  applyBrandLogo,
  getReport,
  requireAuth,
  warmClientsCatalog,
  warmOperacoes,
} from './app.js';
import { forceLogout } from './auth.js';
import { consumeOrcamentoReturnUrl, resolveOrcamentosAdminUrl } from './orcamento-modal.js';
import { mountOrcamentoEditorView, resolveOrcamentoTitleNumero } from './orcamento-view.js';
import { escapeHtml } from './html-utils.js';

function parseReportId() {
  return new URLSearchParams(window.location.search).get('reportId')?.trim() || '';
}

function renderMissingReport() {
  const main = document.getElementById('orcamento-page-main');
  if (!main) return;
  const back = consumeOrcamentoReturnUrl();
  main.innerHTML = `
    <div class="orcamento-page-empty">
      <p>Relatório não encontrado ou identificador em falta.</p>
      <a href="${escapeHtml(back)}" class="btn-primary btn-touch">Voltar</a>
    </div>`;
}

export async function initOrcamentoPage() {
  const user = requireAuth('admin');
  if (!user) return;

  applyBrandLogo();

  const backBtn = document.getElementById('orcamento-page-back');
  const returnUrl = consumeOrcamentoReturnUrl();
  window.__orcamentoReturnUrl = returnUrl;
  if (backBtn) backBtn.href = resolveOrcamentosAdminUrl(returnUrl);

  document.getElementById('orcamento-page-logout')?.addEventListener('click', () => {
    void forceLogout();
  });

  await Promise.all([warmClientsCatalog(), warmOperacoes()]);

  const reportId = parseReportId();
  const main = document.getElementById('orcamento-page-main');
  if (!reportId || !main) {
    renderMissingReport();
    return;
  }

  let report = getReport(reportId);
  if (!report) {
    renderMissingReport();
    return;
  }

  const titleNum = document.getElementById('orcamento-page-title-num');

  const syncTitle = (r) => {
    const num = resolveOrcamentoTitleNumero(r);
    if (!titleNum) return;
    if (num) {
      titleNum.textContent = num;
      titleNum.hidden = false;
    } else {
      titleNum.hidden = true;
    }
  };

  syncTitle(report);
  mountOrcamentoEditorView(main, report, {
    onUpdated: (updated) => {
      report = updated;
      syncTitle(updated);
    },
    onNumeroChange: (num) => {
      if (titleNum) {
        titleNum.textContent = num;
        titleNum.hidden = !num;
      }
    },
  });
}
