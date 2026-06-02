/**
 * Manusilva PWA — Signature Canvas Module
 */

export class SignaturePad {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.drawing = false;
    this.hasSignature = false;
    this.strokeColor = options.color || '#e2e8f0';
    this.lineWidth = options.lineWidth || 2.5;
    this.onChange = options.onChange || (() => {});

    this._resize();
    this._bindEvents();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * ratio;
    this.canvas.height = (rect.height || 120) * ratio;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height || 120}px`;
    this.ctx.scale(ratio, ratio);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.strokeColor;
    this.ctx.lineWidth = this.lineWidth;
  }

  _bindEvents() {
    const start = (e) => {
      e.preventDefault();
      this.drawing = true;
      const pos = this._getPos(e);
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    };

    const move = (e) => {
      if (!this.drawing) return;
      e.preventDefault();
      const pos = this._getPos(e);
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
      if (!this.hasSignature) {
        this.hasSignature = true;
        this.onChange(true);
      }
    };

    const end = () => { this.drawing = false; };

    this.canvas.addEventListener('mousedown', start);
    this.canvas.addEventListener('mousemove', move);
    this.canvas.addEventListener('mouseup', end);
    this.canvas.addEventListener('mouseleave', end);
    this.canvas.addEventListener('touchstart', start, { passive: false });
    this.canvas.addEventListener('touchmove', move, { passive: false });
    this.canvas.addEventListener('touchend', end);
  }

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e.changedTouches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  clear() {
    const ratio = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, this.canvas.width / ratio, this.canvas.height / ratio);
    this.hasSignature = false;
    this.onChange(false);
  }

  toDataURL() {
    return this.hasSignature ? this.canvas.toDataURL('image/png') : null;
  }

  loadFromDataURL(dataUrl) {
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      const ratio = window.devicePixelRatio || 1;
      this.ctx.drawImage(img, 0, 0, this.canvas.width / ratio, this.canvas.height / ratio);
      this.hasSignature = true;
      this.onChange(true);
    };
    img.src = dataUrl;
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
        <canvas id="sig-${id}" class="signature-canvas"></canvas>
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
