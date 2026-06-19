/**
 * Encaixe de imagens nos PDFs preservando proporção (object-fit: contain).
 */

export function fitImageInBox(boxX, boxY, boxW, boxH, imgW, imgH, padding = 0.6) {
  const innerW = Math.max(1, boxW - padding * 2);
  const innerH = Math.max(1, boxH - padding * 2);
  const imgWidth = Math.max(1, imgW);
  const imgHeight = Math.max(1, imgH);
  const scale = Math.min(innerW / imgWidth, innerH / imgHeight);
  const w = imgWidth * scale;
  const h = imgHeight * scale;
  const x = boxX + padding + (innerW - w) / 2;
  const y = boxY + padding + (innerH - h) / 2;
  return { x, y, w, h };
}

export function getDataUrlImageDimensions(dataUrl) {
  if (!dataUrl || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width || 1,
        height: img.naturalHeight || img.height || 1,
      });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * @param {import('jspdf').jsPDF} doc
 */
export async function pdfAddImageContained(doc, dataUrl, boxX, boxY, boxW, boxH, options = {}) {
  const dims = await getDataUrlImageDimensions(dataUrl);
  if (!dims) return false;

  const fit = fitImageInBox(boxX, boxY, boxW, boxH, dims.width, dims.height, options.padding ?? 0.6);
  const fmt = String(dataUrl).includes('image/png')
    ? 'PNG'
    : String(dataUrl).includes('image/webp')
      ? 'WEBP'
      : 'JPEG';

  doc.addImage(dataUrl, fmt, fit.x, fit.y, fit.w, fit.h, undefined, options.compress ?? 'FAST');
  return true;
}
