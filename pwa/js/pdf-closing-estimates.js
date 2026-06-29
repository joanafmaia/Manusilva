/**
 * Estimativas de altura — fotos de intervenção, polaroid e assinaturas.
 */

import {
  PDF_INTERVENTION_FOTO_BAR_H_MM,
  PDF_INTERVENTION_FOTO_GRID_MARGIN_TOP_MM,
  PDF_INTERVENTION_FOTO_CAPTION_H_MM,
  PDF_INTERVENTION_FOTO_MAX_H_MM,
  estimatePdfInterventionFotosHeight,
} from './pdf-design-system.js';

export const SIGNATURE_LABEL_GAP_MM = 6;

export function estimatePdfInterventionFotosOverhead(bottomGapMm = 4) {
  return (
    PDF_INTERVENTION_FOTO_BAR_H_MM +
    PDF_INTERVENTION_FOTO_GRID_MARGIN_TOP_MM +
    PDF_INTERVENTION_FOTO_CAPTION_H_MM +
    bottomGapMm
  );
}

export function estimateInterventionFotografiasHeight(bottomGap = 4) {
  return estimatePdfInterventionFotosHeight(bottomGap);
}

export function estimatePolaroidSectionHeight(hasFotos, profile, opts = {}) {
  if (!hasFotos) return 0;
  const imgH = profile?.polaroidMm ?? PDF_INTERVENTION_FOTO_MAX_H_MM;
  const bottomGap = opts.bottomGap ?? profile?.polaroidBottom ?? 4;
  return (
    PDF_INTERVENTION_FOTO_BAR_H_MM +
    PDF_INTERVENTION_FOTO_GRID_MARGIN_TOP_MM +
    imgH +
    PDF_INTERVENTION_FOTO_CAPTION_H_MM +
    bottomGap
  );
}

export function estimateSignaturesHeight(profile) {
  return profile.sigTop + profile.sigImg + SIGNATURE_LABEL_GAP_MM + 10;
}

export function resolveAdaptiveClosingPhotoHeight(availableMm, profile, bottomGap = 2) {
  const preferred = profile.polaroidMm ?? PDF_INTERVENTION_FOTO_MAX_H_MM;
  if (availableMm <= 0) return preferred;
  const maxImg =
    availableMm - estimatePdfInterventionFotosOverhead(bottomGap) - estimateSignaturesHeight(profile);
  if (maxImg >= preferred) return preferred;
  if (maxImg >= 24) return maxImg;
  return preferred;
}
