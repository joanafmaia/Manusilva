/**
 * Ícones SVG partilhados — identidade clínica (sem emojis no UI).
 */

const S =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

/** @type {Record<string, string>} */
export const MS_ICON_SVGS = {
  wrench: `<svg class="ms-icon-svg" ${S}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  factory: `<svg class="ms-icon-svg" ${S}><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/></svg>`,
  cog: `<svg class="ms-icon-svg" ${S}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  battery: `<svg class="ms-icon-svg" ${S}><rect x="2" y="7" width="16" height="10" rx="2"/><line x1="22" y1="11" x2="22" y2="13"/><line x1="6" y1="11" x2="6" y2="13"/><line x1="10" y1="11" x2="10" y2="13"/></svg>`,
  clipboard: `<svg class="ms-icon-svg" ${S}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>`,
  shield: `<svg class="ms-icon-svg" ${S}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  bolt: `<svg class="ms-icon-svg" ${S}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  camera: `<svg class="ms-icon-svg" ${S}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`,
  eye: `<svg class="ms-icon-svg" ${S}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  pencil: `<svg class="ms-icon-svg" ${S}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  play: `<svg class="ms-icon-svg" ${S}><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  bell: `<svg class="ms-icon-svg" ${S}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  check: `<svg class="ms-icon-svg" ${S}><path d="M20 6 9 17l-5-5"/></svg>`,
  pending: `<svg class="ms-icon-svg" ${S}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  euro: `<svg class="ms-icon-svg" ${S}><path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"/></svg>`,
  draft: `<svg class="ms-icon-svg" ${S}><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>`,
  approved: `<svg class="ms-icon-svg" ${S}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
  rejected: `<svg class="ms-icon-svg" ${S}><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
  info: `<svg class="ms-icon-svg" ${S}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  warning: `<svg class="ms-icon-svg" ${S}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  folder: `<svg class="ms-icon-svg" ${S}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  close: `<svg class="ms-icon-svg" ${S}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};

/** Compatibilidade com emojis legados nos dados. */
const LEGACY_EMOJI_KEYS = {
  '🔧': 'wrench',
  '🏭': 'factory',
  '⚙️': 'cog',
  '🔋': 'battery',
  '📋': 'clipboard',
  '🛡️': 'shield',
  '⚡': 'bolt',
  '📸': 'camera',
  '👁️': 'eye',
  '✏️': 'pencil',
  '▶': 'play',
  '🔔': 'bell',
  '✅': 'check',
  '🟡': 'pending',
  '💶': 'euro',
  '⚪': 'draft',
  '🟢': 'approved',
  '🔴': 'rejected',
};

/**
 * @param {string | undefined | null} icon
 * @returns {string}
 */
export function resolveIconKey(icon) {
  if (!icon) return 'clipboard';
  if (MS_ICON_SVGS[icon]) return icon;
  return LEGACY_EMOJI_KEYS[icon] || 'clipboard';
}

/**
 * @param {string | undefined | null} icon
 * @param {string} [className]
 * @returns {string}
 */
export function msIconHtml(icon, className = 'ms-icon') {
  const key = resolveIconKey(icon);
  const svg = MS_ICON_SVGS[key] || MS_ICON_SVGS.clipboard;
  return `<span class="${className}" aria-hidden="true">${svg}</span>`;
}

/**
 * @param {{ icon?: string } | null | undefined} service
 * @param {string} [className]
 * @returns {string}
 */
export function serviceIconHtml(service, className = 'ms-icon') {
  return msIconHtml(service?.icon, className);
}
