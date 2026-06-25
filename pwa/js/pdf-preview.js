/**
 * Modal de pré-visualização PDF em tempo real
 */

let activePreview = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function revokeActivePreview() {
  if (activePreview?.blobUrl) {
    URL.revokeObjectURL(activePreview.blobUrl);
  }
  activePreview = null;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/** Descarrega um Blob PDF com nome de ficheiro definido. */
export function downloadPdfBlob(blob, filename) {
  downloadBlob(blob, filename);
}

/**
 * @param {{ blobUrl: string, blob: Blob, filename: string, pageCount?: number }} payload
 */
export function openPdfPreviewModal(payload) {
  closePdfPreviewModal();

  const { blobUrl, blob, filename, pageCount = 1 } = payload;
  activePreview = { blobUrl, blob, filename };

  const overlay = document.createElement('div');
  overlay.id = 'pdf-preview-overlay';
  overlay.className = 'pdf-preview-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Pré-visualização do relatório PDF');

  overlay.innerHTML = `
    <div class="pdf-preview-backdrop" data-close-preview></div>
    <div class="pdf-preview-modal glass-card">
      <header class="pdf-preview-header">
        <div class="pdf-preview-title-wrap">
          <span class="pdf-preview-icon" aria-hidden="true">👁️</span>
          <div>
            <h3 class="pdf-preview-title">Pré-visualização do Relatório</h3>
            <p class="pdf-preview-subtitle">${pageCount} página${pageCount !== 1 ? 's' : ''} · ${escapeHtml(filename)}</p>
          </div>
        </div>
        <button type="button" class="pdf-preview-close" data-close-preview aria-label="Fechar pré-visualização">&times;</button>
      </header>
      <div class="pdf-preview-frame-wrap">
        <embed
          class="pdf-preview-embed"
          type="application/pdf"
          src="${blobUrl}#toolbar=1&navpanes=0"
          title="Pré-visualização PDF" />
        <iframe
          class="pdf-preview-iframe pdf-preview-iframe--fallback"
          title="Pré-visualização PDF (alternativa)"
          src="${blobUrl}"
          loading="lazy"></iframe>
        <p class="pdf-preview-inline-fallback" hidden>
          O browser não consegue mostrar o PDF aqui.
          <button type="button" class="btn-link" data-open-pdf-tab>Abrir num novo separador</button>
        </p>
      </div>
      <footer class="pdf-preview-footer">
        <button type="button" class="btn-secondary" data-close-preview>Fechar</button>
        <button type="button" class="btn-primary" data-download-preview>
          <span aria-hidden="true">📥</span> Descarregar PDF
        </button>
      </footer>
    </div>
  `;

  const close = () => closePdfPreviewModal();

  overlay.querySelectorAll('[data-close-preview]').forEach((el) => {
    el.addEventListener('click', close);
  });

  overlay.querySelector('[data-download-preview]')?.addEventListener('click', () => {
    downloadBlob(blob, filename);
  });

  overlay.querySelector('[data-open-pdf-tab]')?.addEventListener('click', () => {
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  });

  const embed = overlay.querySelector('.pdf-preview-embed');
  const iframe = overlay.querySelector('.pdf-preview-iframe--fallback');
  const inlineFallback = overlay.querySelector('.pdf-preview-inline-fallback');
  let previewFailed = false;

  const showInlineFallback = () => {
    if (previewFailed) return;
    previewFailed = true;
    embed?.remove();
    iframe?.remove();
    if (inlineFallback) inlineFallback.hidden = false;
  };

  iframe?.addEventListener('error', showInlineFallback);
  window.setTimeout(() => {
    try {
      const doc = iframe?.contentDocument;
      if (iframe && doc && !doc.body?.childNodes?.length) showInlineFallback();
    } catch {
      /* cross-origin — iframe may still be showing the PDF */
    }
  }, 2500);

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    overlay.classList.add('show');
    overlay.querySelector('.pdf-preview-close')?.focus();
  });
}

export function closePdfPreviewModal() {
  const overlay = document.getElementById('pdf-preview-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => {
      overlay.remove();
      if (!document.getElementById('form-overlay')?.classList.contains('show')) {
        document.body.style.overflow = '';
      }
    }, 220);
  }
  revokeActivePreview();
}

let loadingEl = null;

export function showPdfPreviewLoading(show, label = 'A gerar pré-visualização…') {
  if (!show) {
    loadingEl?.remove();
    loadingEl = null;
    return;
  }

  if (loadingEl) return;

  loadingEl = document.createElement('div');
  loadingEl.id = 'pdf-preview-loading';
  loadingEl.className = 'pdf-preview-loading';
  loadingEl.innerHTML = `
    <div class="pdf-preview-loading-card glass-card">
      <div class="pdf-preview-spinner" aria-hidden="true"></div>
      <p>${escapeHtml(label)}</p>
      <span class="pdf-preview-loading-hint">Relatórios extensos podem demorar alguns segundos</span>
    </div>
  `;
  document.body.appendChild(loadingEl);
  requestAnimationFrame(() => loadingEl?.classList.add('show'));
}

/**
 * Gera o PDF a partir do estado atual e abre o modal.
 * @param {object} report — payload igual ao submit
 */
const PDF_PREVIEW_TIMEOUT_MS = 90000;

export async function previewReportPDF(report) {
  showPdfPreviewLoading(true);
  try {
    const work = (async () => {
      const { importPdfReport } = await import('./pdf-loader.js');
      const { generateInterventionPDFBlob } = await importPdfReport();
      return generateInterventionPDFBlob({
        ...report,
        submittedAt: report.submittedAt || new Date().toISOString(),
      });
    })();

    const timeout = new Promise((_, reject) => {
      window.setTimeout(
        () => reject(new Error('A geração do PDF demorou demasiado. Tente novamente.')),
        PDF_PREVIEW_TIMEOUT_MS,
      );
    });

    const payload = await Promise.race([work, timeout]);
    showPdfPreviewLoading(false);
    openPdfPreviewModal(payload);
  } catch (err) {
    showPdfPreviewLoading(false);
    console.error('[PDF Preview]', err);
    try {
      const { showToast } = await import('./app.js');
      showToast(err?.message || 'Não foi possível gerar a pré-visualização.', 'error');
    } catch {
      /* toast indisponível */
    }
    throw err;
  }
}
