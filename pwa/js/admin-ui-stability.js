/**
 * Helpers partilhados — preservar scroll/foco em refreshes de painéis RH.
 */

export function getAdminMainScrollEl() {
  return document.querySelector('.admin-main');
}

export function captureAdminMainScroll() {
  return getAdminMainScrollEl()?.scrollTop || 0;
}

export function restoreAdminMainScroll(top) {
  const el = getAdminMainScrollEl();
  if (!el) return;
  const y = Math.max(0, Number(top) || 0);
  el.scrollTop = y;
  if (y > 0) {
    requestAnimationFrame(() => {
      el.scrollTop = y;
    });
  }
}

/** Substitui um nó existente sob `root` pelo HTML de uma secção (primeiro elemento). */
export function replaceSectionHtml(root, selector, html) {
  const current = root?.querySelector(selector);
  if (!current) return false;
  const wrap = document.createElement('div');
  wrap.innerHTML = String(html || '').trim();
  const next = wrap.firstElementChild;
  if (!next) return false;
  current.replaceWith(next);
  return true;
}
