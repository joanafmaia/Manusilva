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

/**
 * Substitui placeholders [data-brand-logo] por <img> e oculta títulos redundantes.
 * @param {ParentNode} [root]
 * @returns {boolean} true se o logo Base64 estiver configurado
 */
export function applyBrandLogo(root = document) {
  if (!isLogoConfigured()) return false;

  root.querySelectorAll('[data-brand-logo], [data-brand-logo-lg]').forEach((slot) => {
    const isLarge = slot.hasAttribute('data-brand-logo-lg');
    slot.classList.add('has-brand-image');
    slot.textContent = '';

    const img = document.createElement('img');
    img.src = MANUSILVA_LOGO;
    img.alt = 'ManuSilva';
    img.className = isLarge ? 'brand-logo-img brand-logo-img--lg' : 'brand-logo-img';
    img.decoding = 'async';
    img.loading = 'eager';
    slot.appendChild(img);
    slot.removeAttribute('aria-hidden');
  });

  root.querySelectorAll('[data-hide-if-logo]').forEach((el) => {
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
  });

  return true;
}
