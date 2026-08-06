/**
 * Metadados do bloco Data / Visitas / Técnico por tipo de relatório.
 */

import {
  formatPdfConclusionDate,
  formatPdfJobDateOnly,
  formatPdfServiceDateOnly,
  resolveFolhaAvariasConclusionDate,
  resolveFolhaAvariasServiceDate,
} from './pdf-format-utils.js';
import { PDF_SECTION_GAP_MM } from './pdf-design-system.js';

function buildConclusionAwareServiceInfoMeta(report, job, values, metaBottomGapMm) {
  const conclusionDate = formatPdfConclusionDate(values);
  const jobDate = formatPdfJobDateOnly(job, report);
  const meta = {
    numeroVisitas: null,
    deslocacao: null,
    technician: null,
    metaBottomGapMm,
  };

  if (conclusionDate) {
    meta.serviceDateLabel = 'Data de Conclusão';
    meta.serviceDate = conclusionDate;
    if (jobDate && jobDate !== conclusionDate) {
      meta.scheduledDateLabel = 'Data do Serviço';
      meta.scheduledDate = jobDate;
    }
  } else {
    meta.serviceDate = formatPdfServiceDateOnly(report, job, values);
  }

  return meta;
}

export function buildCorretivaServiceInfoMeta(report, job, values, visitCount) {
  const meta = buildConclusionAwareServiceInfoMeta(
    report,
    job,
    values,
    PDF_SECTION_GAP_MM,
  );
  meta.numeroVisitas = visitCount;
  return meta;
}

export function buildRavServiceInfoMeta(report, job, values) {
  return buildConclusionAwareServiceInfoMeta(report, job, values, PDF_SECTION_GAP_MM);
}

export function buildGrandesServiceInfoMeta(report, job, values, visitCount) {
  const meta = buildConclusionAwareServiceInfoMeta(
    report,
    job,
    values,
    /** Densidade própria do layout Grandes (não tipografia) */
    2.1,
  );
  meta.numeroVisitas = visitCount;
  return meta;
}

export function buildEmpilhadoresServiceInfoMeta(report, job, values, visitCount) {
  const meta = buildConclusionAwareServiceInfoMeta(report, job, values, PDF_SECTION_GAP_MM);
  meta.numeroVisitas = visitCount;
  return meta;
}

export function buildFolhaAvariasServiceInfoMeta(report, job, values) {
  const conclusionDate = resolveFolhaAvariasConclusionDate(values);
  const serviceDate = resolveFolhaAvariasServiceDate(values, job, report);

  const meta = {
    /** Visitas ficam só na tabela «Datas de Intervenção» — evitar duplicar no cabeçalho. */
    numeroVisitas: null,
    deslocacao: null,
    technician: null,
    metaBottomGapMm: PDF_SECTION_GAP_MM,
  };

  if (conclusionDate) {
    meta.serviceDateLabel = 'Data de Conclusão';
    meta.serviceDate = conclusionDate;
    if (serviceDate && serviceDate !== conclusionDate) {
      meta.scheduledDateLabel = 'Data do Serviço';
      meta.scheduledDate = serviceDate;
    }
  } else {
    meta.serviceDate = formatPdfServiceDateOnly(report, job, values);
  }

  return meta;
}
