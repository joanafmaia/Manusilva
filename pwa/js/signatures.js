/**
 * Manusilva PWA — Signature Canvas Module
 */

const MAX_SIGNATURE_DPR = 2;
const RESIZE_DEBOUNCE_MS = 120;

function readThemeVar(name, fallback) {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  return value || fallback;
}

export function getSignatureTheme() {
  return {
    stroke: readThemeVar('--signature-stroke', '#1e3a5f'),
    canvasBg: readThemeVar('--signature-canvas-bg', '#ffffff'),
  };
}

function getSignatureDpr() {
  return Math.min(window.devicePixelRatio || 1, MAX_SIGNATURE_DPR);
}

export class SignaturePad {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.drawing = false;
    this.hasSignature = false;
    const theme = getSignatureTheme();
    this.strokeColor = options.color || theme.stroke;
    this.canvasBg = options.canvasBg || theme.canvasBg;
    this.lineWidth = options.lineWidth || 2.5;
    this.onChange = options.onChange || (() => {});
    this._savedImage = null;
    this._lastX = 0;
    this._lastY = 0;
    this._pendingPos = null;
    this._drawRaf = 0;
    this._resizeTimer = 0;

    this._resize();
    this._bindEvents();
    this._onWindowResize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this._resize(), RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', this._onWindowResize);
  }

  _paintCanvasBackground(width, height) {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = this.canvasBg;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  resize() {
    this._resize();
  }

  _resolveCanvasSize() {
    const wrap = this.canvas.parentElement;
    if (!wrap) return { cssW: 320, cssH: 120 };

    const rect = wrap.getBoundingClientRect();
    let cssW = rect.width;
    let cssH = rect.height || 120;

    if (cssW <= 0) {
      cssW = wrap.offsetWidth || wrap.clientWidth || 0;
    }
    if (cssW <= 0) {
      const panel = this.canvas.closest('.form-panel-body, .form-section-card, .signatures-grid');
      cssW = panel?.clientWidth ? Math.max(0, panel.clientWidth - 48) : 0;
    }
    if (cssW <= 0) cssW = 320;

    return { cssW, cssH };
  }

  _syncSavedImageFromCanvas() {
    if (!this.hasSignature || !this.canvas.width || !this.canvas.height) return;

    if (!(this._savedImage instanceof HTMLCanvasElement)) {
      this._savedImage = document.createElement('canvas');
    }
    if (
      this._savedImage.width !== this.canvas.width ||
      this._savedImage.height !== this.canvas.height
    ) {
      this._savedImage.width = this.canvas.width;
      this._savedImage.height = this.canvas.height;
    }
    const tctx = this._savedImage.getContext('2d');
    tctx.clearRect(0, 0, this._savedImage.width, this._savedImage.height);
    tctx.drawImage(this.canvas, 0, 0);
  }

  _resize() {
    if (this.hasSignature) this._syncSavedImageFromCanvas();

    const { cssW, cssH } = this._resolveCanvasSize();
    const ratio = getSignatureDpr();
    this.canvas.width = Math.max(1, Math.round(cssW * ratio));
    this.canvas.height = Math.max(1, Math.round(cssH * ratio));
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.strokeColor;
    this.ctx.lineWidth = this.lineWidth;

    const theme = getSignatureTheme();
    this.strokeColor = theme.stroke;
    this.canvasBg = theme.canvasBg;
    this.ctx.strokeStyle = this.strokeColor;

    this._paintCanvasBackground(cssW, cssH);
    if (this._savedImage) {
      this.ctx.drawImage(this._savedImage, 0, 0, cssW, cssH);
    }
  }

  _markHasSignature() {
    if (this.hasSignature) return;
    this.hasSignature = true;
    this._syncBlockState(true);
    this.onChange(true);
  }

  _scheduleStrokeDraw() {
    if (this._drawRaf) return;
    this._drawRaf = requestAnimationFrame(() => {
      this._drawRaf = 0;
      if (!this.drawing || !this._pendingPos) return;

      const pos = this._pendingPos;
      this._pendingPos = null;

      const midX = (this._lastX + pos.x) / 2;
      const midY = (this._lastY + pos.y) / 2;
      this.ctx.quadraticCurveTo(this._lastX, this._lastY, midX, midY);
      this.ctx.stroke();
      this._lastX = pos.x;
      this._lastY = pos.y;
      this._markHasSignature();
    });
  }

  _bindEvents() {
    const start = (e) => {
      e.preventDefault();
      this.drawing = true;
      const pos = this._getPos(e);
      this._lastX = pos.x;
      this._lastY = pos.y;
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    };

    const move = (e) => {
      if (!this.drawing) return;
      e.preventDefault();
      this._pendingPos = this._getPos(e);
      this._scheduleStrokeDraw();
    };

    const end = () => {
      if (!this.drawing) return;
      this.drawing = false;
      if (this._pendingPos) {
        this.ctx.lineTo(this._pendingPos.x, this._pendingPos.y);
        this.ctx.stroke();
        this._pendingPos = null;
      }
      if (this._drawRaf) {
        cancelAnimationFrame(this._drawRaf);
        this._drawRaf = 0;
      }
      if (this.hasSignature) this._syncSavedImageFromCanvas();
    };

    this.canvas.addEventListener('mousedown', start);
    this.canvas.addEventListener('mousemove', move);
    this.canvas.addEventListener('mouseup', end);
    this.canvas.addEventListener('mouseleave', end);
    this.canvas.addEventListener('touchstart', start, { passive: false });
    this.canvas.addEventListener('touchmove', move, { passive: false });
    this.canvas.addEventListener('touchend', end);
    this.canvas.addEventListener('touchcancel', end);
  }

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e.changedTouches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  _syncBlockState(hasSig) {
    this.canvas.closest('.signature-block')?.classList.toggle('has-signature', Boolean(hasSig));
  }

  clear() {
    const { cssW, cssH } = this._resolveCanvasSize();
    this._savedImage = null;
    this._paintCanvasBackground(cssW, cssH);
    this.hasSignature = false;
    this._syncBlockState(false);
    this.onChange(false);
  }

  toDataURL() {
    if (!this.hasSignature) return null;
    this._syncSavedImageFromCanvas();
    return this.canvas.toDataURL('image/png');
  }

  loadFromDataURL(dataUrl) {
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      const { cssW, cssH } = this._resolveCanvasSize();
      this._paintCanvasBackground(cssW, cssH);
      this.ctx.drawImage(img, 0, 0, cssW, cssH);
      this._savedImage = img;
      this.hasSignature = true;
      this._syncBlockState(true);
      this.onChange(true);
    };
    img.src = dataUrl;
  }

  destroy() {
    window.removeEventListener('resize', this._onWindowResize);
    clearTimeout(this._resizeTimer);
    if (this._drawRaf) cancelAnimationFrame(this._drawRaf);
  }
}

export function createSignatureBlock(label, id) {
  return `
    <div class="signature-block">
      <div class="signature-header">
        <span class="signature-label">${label}</span>
        <button type="button" class="btn-ghost btn-sm" data-clear-sig="${id}">Limpar</button>
      </div>
      <div class="signature-canvas-wrap">
        <canvas id="sig-${id}" class="signature-canvas" tabindex="0" aria-label="${label}"></canvas>
        <span class="signature-placeholder">Assine aqui com o dedo</span>
      </div>
    </div>
  `;
}

export function initSignaturePads(ids, onUpdate) {
  const pads = {};
  ids.forEach((id) => {
    const canvas = document.getElementById(`sig-${id}`);
    if (!canvas) return;
    pads[id] = new SignaturePad(canvas, {
      onChange: () => onUpdate?.(id, pads[id].hasSignature),
    });
    document.querySelector(`[data-clear-sig="${id}"]`)?.addEventListener('click', () => pads[id].clear());
  });
  return pads;
}

/** Persiste o bitmap atual do canvas (evita perda após resize / troca de aba). */
export function commitSignatureSnapshot(pad) {
  if (!pad?.canvas || !pad.hasSignature) return null;
  pad._syncSavedImageFromCanvas?.();
  return pad.toDataURL();
}

function isDataUrlSignature(value) {
  return typeof value === 'string' && value.startsWith('data:image') && value.length > 80;
}

/** Verifica se o pad tem traço válido (flag ou bitmap). */
export function padHasSignature(pad) {
  if (!pad) return false;
  if (pad.hasSignature) return true;
  return isDataUrlSignature(pad.toDataURL?.());
}

/** Monta payload de assinaturas — só inclui imagens quando existem traços válidos. */
export function resolveReportSignatures(pads, stored = {}) {
  const techPad = pads?.technician;
  const clientPad = pads?.client;
  const techSigned = padHasSignature(techPad) || isDataUrlSignature(stored.technicianData);
  const clientSigned = padHasSignature(clientPad) || isDataUrlSignature(stored.clientData);

  const technicianData = techSigned
    ? commitSignatureSnapshot(techPad) ||
      (padHasSignature(techPad) ? techPad?.toDataURL?.() : null) ||
      stored.technicianData ||
      null
    : null;
  const clientData = clientSigned
    ? commitSignatureSnapshot(clientPad) ||
      (padHasSignature(clientPad) ? clientPad?.toDataURL?.() : null) ||
      stored.clientData ||
      null
    : null;

  return {
    technician: Boolean(technicianData),
    client: Boolean(clientData),
    technicianData,
    clientData,
  };
}

/** @deprecated Preferir resolveReportSignatures — mantido para compatibilidade. */
export function technicianSignatureReady(pads, storedSignatures = null) {
  if (padHasSignature(pads?.technician)) return true;
  const sig = storedSignatures || {};
  return isDataUrlSignature(sig.technicianData);
}

/** Recalcula dimensões dos canvas — necessário quando a aba Finalização fica visível */
export function refreshSignaturePads(pads = {}) {
  Object.values(pads).forEach((pad) => {
    if (!pad || typeof pad.resize !== 'function') return;
    if (pad.hasSignature) pad._syncSavedImageFromCanvas?.();
    pad.resize();
  });
}
