/**
 * Nomes de ficheiro PDF e metadados empilhadores.
 */

import { PDF_DOCUMENT_TITLES } from './mock_data.js';
import { getJobsSnapshot } from './trabalhos-db.js';
import { buildReportPdfFilename } from './pdf-storage.js';
import { getServiceType } from './entity-lookups.js';
import {
  buildEmpilhadoresMachineFilenameTag,
  getEmpilhadoresMaquinasFromReport,
} from './views/relatorio-empilhadores-maquinas.js';

export function getReportFilename(report) {
  const job = report?.jobId
    ? getJobsSnapshot().find((j) => String(j.id) === String(report.jobId))
    : null;
  const service = getServiceType(report?.serviceType);
  const serviceTitle =
    PDF_DOCUMENT_TITLES[report?.serviceType] || service?.label || report?.serviceType;
  const machineTag = report?.pdfMachineTag ? String(report.pdfMachineTag) : null;
  return buildReportPdfFilename(job, report, { serviceTitle, machineTag });
}

export function resolveEmpilhadoresPdfMachineIndex(report) {
  const idx = Number(report?.pdfMachineIndex);
  return Number.isFinite(idx) && idx >= 0 ? idx : 0;
}

export function withEmpilhadoresPdfMeta(report, machineIndex) {
  const maquinas = getEmpilhadoresMaquinasFromReport(report);
  const idx = Math.max(0, Math.min(machineIndex, maquinas.length - 1));
  const row = maquinas[idx] || {};
  return {
    ...report,
    pdfMachineIndex: idx,
    pdfMachineTag: buildEmpilhadoresMachineFilenameTag(row, idx),
  };
}

export function yieldToMain() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
