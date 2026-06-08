/** Versão do motor PDF — incrementar quando o layout mudar (invalida cache do browser). */
export const PDF_REPORT_MODULE = './pdf-report.js?v=4';

export function importPdfReport() {
  return import(PDF_REPORT_MODULE);
}
