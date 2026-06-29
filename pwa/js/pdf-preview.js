/**
 * Modal de pré-visualização PDF em tempo real
 */

import { escapeHtml } from './html-utils.js';

let activePreview = null;

function revokeActivePreview() {
  if (activePreview?.blobUrls?.length) {
    activePreview.blobUrls.forEach((url) => URL.revokeObjectURL(url));
  } else if (activePreview?.blobUrl) {
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

function loadJSZip() {
  if (typeof window !== 'undefined' && window.JSZip) {
    return Promise.resolve(window.JSZip);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-jszip]');
    if (existing) {
      if (window.JSZip) resolve(window.JSZip);
      else existing.addEventListener('load', () => resolve(window.JSZip));
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar JSZip.')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'js/vendor/jszip.min.js';
    script.dataset.jszip = '1';
    script.async = true;
    script.onload = () => {
      if (window.JSZip) resolve(window.JSZip);
      else reject(new Error('JSZip não disponível.'));
    };
    script.onerror = () => reject(new Error('Falha ao carregar JSZip.'));
    document.head.appendChild(script);
  });
}

function empilhadoresZipFilename(sampleFilename) {
  return String(sampleFilename || 'relatorios_pdfs.pdf').replace(/_M\d+[^.]*\.pdf$/i, '_pdfs.zip');
}

async function buildEmpilhadoresPdfsZip(pdfs) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  pdfs.forEach((entry) => {
    zip.file(entry.filename, entry.blob);
  });
  return zip.generateAsync({ type: 'blob' });
}

/**
 * Descarrega 1 PDF ou ZIP com todos (preventiva empilhadores multi-máquina).
 * @param {object} report
 */
export async function downloadEmpilhadoresPdfs(report) {
  const { importPdfReport } = await import('./pdf-loader.js');
  const { generateEmpilhadoresPdfBlobs } = await importPdfReport();
  const pdfs = await generateEmpilhadoresPdfBlobs({
    ...report,
    submittedAt: report.submittedAt || new Date().toISOString(),
  });

  if (pdfs.length <= 1) {
    const entry = pdfs[0];
    if (entry) downloadPdfBlob(entry.blob, entry.filename);
    return pdfs;
  }

  const zipBlob = await buildEmpilhadoresPdfsZip(pdfs);
  downloadPdfBlob(zipBlob, empilhadoresZipFilename(pdfs[0]?.filename));
  return pdfs;
}

/**
 * @param {Array<{ blobUrl: string, blob: Blob, filename: string, machineLabel: string, pageCount?: number }>} pdfs
 */
export function openEmpilhadoresPdfPreviewModal(pdfs = []) {
  closePdfPreviewModal();
  if (!pdfs.length) return;

  let activeIndex = 0;
  const blobUrls = pdfs.map((p) => p.blobUrl);
  activePreview = { blobUrls, pdfs };

  const overlay = document.createElement('div');
  overlay.id = 'pdf-preview-overlay';
  overlay.className = 'pdf-preview-overlay pdf-preview-overlay--multi';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Pré-visualização dos PDFs por máquina');

  const renderTabs = () =>
    pdfs
      .map((entry, index) => {
        const active = index === activeIndex ? ' is-active' : '';
        return `<button type="button" class="pdf-preview-machine-tab${active}" data-pdf-machine-tab="${index}" role="tab" aria-selected="${index === activeIndex ? 'true' : 'false'}">${escapeHtml(entry.machineLabel || `Máquina ${index + 1}`)}</button>`;
      })
      .join('');

  const active = pdfs[activeIndex];
  overlay.innerHTML = `
    <div class="pdf-preview-backdrop" data-close-preview></div>
    <div class="pdf-preview-modal glass-card pdf-preview-modal--multi">
      <header class="pdf-preview-header">
        <div class="pdf-preview-title-wrap">
          <span class="pdf-preview-icon" aria-hidden="true">👁️</span>
          <div>
            <h3 class="pdf-preview-title">Pré-visualização — ${pdfs.length} máquinas</h3>
            <p class="pdf-preview-subtitle" data-pdf-active-meta>${active.pageCount || 1} página${active.pageCount !== 1 ? 's' : ''} · ${escapeHtml(active.filename)}</p>
          </div>
        </div>
        <button type="button" class="pdf-preview-close" data-close-preview aria-label="Fechar pré-visualização">&times;</button>
      </header>
      <div class="pdf-preview-machine-tabs" role="tablist" aria-label="Máquina em pré-visualização" data-pdf-machine-tabs>
        ${renderTabs()}
      </div>
      <div class="pdf-preview-frame-wrap">
        <embed class="pdf-preview-embed" type="application/pdf" data-pdf-preview-embed src="${active.blobUrl}#toolbar=1&navpanes=0" title="Pré-visualização PDF" />
        <iframe class="pdf-preview-iframe pdf-preview-iframe--fallback" data-pdf-preview-iframe title="Pré-visualização PDF (alternativa)" src="${active.blobUrl}" loading="lazy"></iframe>
      </div>
      <footer class="pdf-preview-footer pdf-preview-footer--multi">
        <button type="button" class="btn-secondary" data-close-preview>Fechar</button>
        <button type="button" class="btn-outline" data-download-active-pdf>
          <span aria-hidden="true">📥</span> Descarregar esta máquina
        </button>
        <button type="button" class="btn-primary" data-download-all-pdfs>
          <span aria-hidden="true">📦</span> Descarregar todos (ZIP)
        </button>
      </footer>
    </div>
  `;

  const close = () => closePdfPreviewModal();
  const setActive = (index) => {
    activeIndex = Math.max(0, Math.min(index, pdfs.length - 1));
    const entry = pdfs[activeIndex];
    const embed = overlay.querySelector('[data-pdf-preview-embed]');
    const iframe = overlay.querySelector('[data-pdf-preview-iframe]');
    const meta = overlay.querySelector('[data-pdf-active-meta]');
    const src = `${entry.blobUrl}#toolbar=1&navpanes=0`;
    if (embed) embed.src = src;
    if (iframe) iframe.src = entry.blobUrl;
    if (meta) {
      meta.textContent = `${entry.pageCount || 1} página${entry.pageCount !== 1 ? 's' : ''} · ${entry.filename}`;
    }
    overlay.querySelectorAll('[data-pdf-machine-tab]').forEach((btn) => {
      const idx = Number(btn.dataset.pdfMachineTab);
      const isActive = idx === activeIndex;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  };

  overlay.querySelectorAll('[data-close-preview]').forEach((el) => {
    el.addEventListener('click', close);
  });

  overlay.querySelector('[data-download-active-pdf]')?.addEventListener('click', () => {
    const entry = pdfs[activeIndex];
    if (entry) downloadBlob(entry.blob, entry.filename);
  });

  overlay.querySelector('[data-download-all-pdfs]')?.addEventListener('click', async () => {
    const btn = overlay.querySelector('[data-download-all-pdfs]');
    if (btn) btn.disabled = true;
    try {
      const zipBlob = await buildEmpilhadoresPdfsZip(pdfs);
      downloadBlob(zipBlob, empilhadoresZipFilename(pdfs[0]?.filename));
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  overlay.querySelectorAll('[data-pdf-machine-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setActive(Number(btn.dataset.pdfMachineTab) || 0));
  });

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
    if (payload?.isMulti && Array.isArray(payload.pdfs) && payload.pdfs.length) {
      openEmpilhadoresPdfPreviewModal(payload.pdfs);
    } else {
      openPdfPreviewModal(payload);
    }
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
