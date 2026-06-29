/**
 * Carregamento e compressão de imagens para PDF.
 */

const PDF_IMAGE_MAX_PX = 900;
const PDF_IMAGE_JPEG_QUALITY = 0.72;

export async function compressImageForPdf(
  dataUrl,
  maxPx = PDF_IMAGE_MAX_PX,
  quality = PDF_IMAGE_JPEG_QUALITY,
) {
  if (!dataUrl || typeof document === 'undefined') return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxPx / Math.max(width, height, 1));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function blobToDataUrlForPdf(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Leitura da imagem falhou.'));
    reader.readAsDataURL(blob);
  });
}

export function loadImageViaCanvas(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function loadImageForPdf(url) {
  if (!url) return null;
  let dataUrl = url;
  if (url.startsWith('data:')) {
    return compressImageForPdf(dataUrl);
  }
  if (url.startsWith('blob:')) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      dataUrl = await blobToDataUrlForPdf(await res.blob());
      return compressImageForPdf(dataUrl);
    } catch (err) {
      console.warn('[PDF] Não foi possível carregar blob:', url, err);
      return null;
    }
  }
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) {
      dataUrl = await blobToDataUrlForPdf(await res.blob());
      return compressImageForPdf(dataUrl);
    }
  } catch (err) {
    console.warn('[PDF] fetch imagem falhou, a tentar canvas:', url, err);
  }
  const viaCanvas = await loadImageViaCanvas(url);
  if (viaCanvas) return compressImageForPdf(viaCanvas);
  return null;
}

export function detectImageFormat(dataUrl) {
  if (String(dataUrl).includes('image/png')) return 'PNG';
  if (String(dataUrl).includes('image/webp')) return 'WEBP';
  return 'JPEG';
}
