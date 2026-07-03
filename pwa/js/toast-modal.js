/**
 * Toasts e modais globais da PWA.
 */

import { escapeHtml } from './html-utils.js';

let toastContainer = null;
let adminToastContainer = null;

export function showToast(message, type = 'info', duration = 4000) {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    if (document.body.classList.contains('admin-rh-page')) {
      toastContainer.classList.add('toast-container--bottom-end');
    }
    document.body.appendChild(toastContainer);
  }

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Toast estilo notificação (canto inferior direito) — painel RH.
 */
export function showNotificationToast(title, body, options = {}) {
  const { icon = '🔔', duration = 8000, onClick, dedupeKey } = options;

  if (dedupeKey) {
    if (!showNotificationToast._recent) showNotificationToast._recent = new Set();
    if (showNotificationToast._recent.has(dedupeKey)) return;
    showNotificationToast._recent.add(dedupeKey);
    setTimeout(() => showNotificationToast._recent.delete(dedupeKey), 4500);
  }

  if (!adminToastContainer) {
    adminToastContainer = document.createElement('div');
    adminToastContainer.id = 'admin-toast-container';
    adminToastContainer.className = 'toast-container toast-container--bottom-end';
    adminToastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(adminToastContainer);
  }

  const toast = document.createElement(onClick ? 'button' : 'div');
  toast.type = onClick ? 'button' : undefined;
  toast.className = 'toast toast-notification toast-info';
  toast.innerHTML = `
    <span class="toast-notification-icon" aria-hidden="true">${icon}</span>
    <span class="toast-notification-content">
      <strong class="toast-notification-title">${escapeHtml(title)}</strong>
      <span class="toast-notification-body">${escapeHtml(body)}</span>
    </span>
  `;

  if (onClick) {
    toast.addEventListener('click', () => {
      onClick();
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 320);
    });
  }

  adminToastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

/**
 * Abre modal. `title` é escapado; `content` e `actions` são HTML — o caller deve
 * usar escapeHtml em dados de utilizador/BD.
 */
export function openModal(title, content, actions = '', options = {}) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = `modal-overlay${options.review ? ' modal-overlay--review' : ''}${options.reviewWide ? ' modal-overlay--review-wide' : ''}${options.signatures ? ' modal-overlay--signatures' : ''}`;
  overlay.innerHTML = `
    <div class="modal glass-card">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="modal-close" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body">${content}</div>
      ${actions ? `<div class="modal-actions">${actions}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  requestAnimationFrame(() => overlay.classList.add('show'));
  return overlay;
}

export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
  }
}
