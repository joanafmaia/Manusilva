/**
 * Metadados do bloco Data / Visitas / Técnico por tipo de relatório.
 */

import {
  formatPdfConclusionDate,
  formatPdfJobDateOnly,
  formatPdfServiceDateOnly,
  formatPdfNumeroVisitas,
} from './pdf-format-utils.js';
import { PDF_SECTION_GAP_MM } from './pdf-design-system.js';

const CORRETIVA_SECTION_GAP_MM = 3.5;
const GRANDES_SECTION_GAP_MM = 2.1;
const RAV_SECTION_GAP_MM = 2.8;
const FOLHA_AVARIAS_SECTION_GAP_MM = 2.8;

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
    CORRETIVA_SECTION_GAP_MM,
  );
  meta.numeroVisitas = visitCount;
  return meta;
}

export function buildRavServiceInfoMeta(report, job, values) {
  return buildConclusionAwareServiceInfoMeta(report, job, values, RAV_SECTION_GAP_MM);
}

export function buildGrandesServiceInfoMeta(report, job, values, visitCount) {
  const meta = buildConclusionAwareServiceInfoMeta(
    report,
    job,
    values,
    GRANDES_SECTION_GAP_MM,
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
  const visitCount = formatPdfNumeroVisitas(values);
  const meta = buildConclusionAwareServiceInfoMeta(
    report,
    job,
    { ...values, data_de_conclusao: values.data_de_conclusao || values.data_1 || '' },
    FOLHA_AVARIAS_SECTION_GAP_MM,
  );
  meta.numeroVisitas = visitCount;
  return meta;
}
