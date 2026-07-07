/**
 * Aplicação do logo corporativo na UI (navbar, sidebar, login)
 */

import MANUSILVA_LOGO from './logo_data.js';

export { MANUSILVA_LOGO };

export function isLogoConfigured() {
  return typeof MANUSILVA_LOGO === 'string' && /^data:image\/(png|jpe?g|webp);base64,/i.test(MANUSILVA_LOGO);
}

/** Formato aceite pelo jsPDF addImage */
export function getPdfLogoFormat(dataUri = MANUSILVA_LOGO) {
  if (/image\/jpe?g/i.test(dataUri)) return 'JPEG';
  if (/image\/webp/i.test(dataUri)) return 'WEBP';
  return 'PNG';
}

function finishBrandLogoBoot() {
  try {
    document.documentElement.classList.remove('ms-booting');
  } catch {
    /* ignore */
  }
}

function markLogoSlotReady(slot, img) {
  img.classList.add('brand-logo-img--ready');
  slot.classList.add('brand-logo-slot--ready');
}

function bindLogoReveal(slot, img, onSettled) {
  const settle = () => {
    markLogoSlotReady(slot, img);
    onSettled();
  };

  if (img.classList.contains('brand-logo-img--ready') && img.src === MANUSILVA_LOGO) {
    settle();
    return;
  }

  img.classList.remove('brand-logo-img--ready');
  slot.classList.remove('brand-logo-slot--ready');

  const handleReady = () => settle();
  img.addEventListener('load', handleReady, { once: true });
  img.addEventListener('error', handleReady, { once: true });

  if (img.src !== MANUSILVA_LOGO) {
    img.src = MANUSILVA_LOGO;
  } else if (img.complete) {
    handleReady();
  }
}

/**
 * Substitui placeholders [data-brand-logo] por <img> e oculta títulos redundantes.
 * @param {ParentNode} [root]
 * @returns {boolean} true se o logo Base64 estiver configurado
 */
export function applyBrandLogo(root = document) {
  if (!isLogoConfigured()) {
    finishBrandLogoBoot();
    return false;
  }

  const slots = root.querySelectorAll('[data-brand-logo], [data-brand-logo-lg]');
  if (!slots.length) {
    finishBrandLogoBoot();
    return false;
  }

  let pending = 0;
  const settleOne = () => {
    pending -= 1;
    if (pending <= 0) finishBrandLogoBoot();
  };

  slots.forEach((slot) => {
    const isLarge = slot.hasAttribute('data-brand-logo-lg');
    slot.classList.add('has-brand-image');
    slot.textContent = '';

    let img = slot.querySelector('img.brand-logo-img');
    if (!img) {
      img = document.createElement('img');
      img.alt = 'ManuSilva';
      img.className = isLarge ? 'brand-logo-img brand-logo-img--lg' : 'brand-logo-img';
      img.decoding = 'async';
      img.loading = 'eager';
      img.setAttribute('fetchpriority', 'high');
      slot.appendChild(img);
    }

    pending += 1;
    bindLogoReveal(slot, img, settleOne);
    slot.removeAttribute('aria-hidden');
  });

  root.querySelectorAll('[data-hide-if-logo]').forEach((el) => {
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
  });

  if (pending <= 0) finishBrandLogoBoot();

  return true;
}
