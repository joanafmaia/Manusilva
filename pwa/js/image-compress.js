/**
 * Compressão de fotos para relatórios — reduz peso antes de IndexedDB / upload.
 */

export const IMAGE_COMPRESS_MAX_WIDTH = 1280;
export const IMAGE_COMPRESS_QUALITY = 0.7;

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    img.src = src;
  });
}

function scaledDimensions(width, height, maxWidth) {
  if (!width || width <= maxWidth) {
    return { width: width || maxWidth, height: height || maxWidth };
  }
  const ratio = maxWidth / width;
  return {
    width: maxWidth,
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasToJpegDataUrl(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality);
}

function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Data URL inválida.');
  const mime = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Comprime bitmap para JPEG (máx. largura + qualidade).
 * @param {CanvasImageSource} source
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 */
export function compressImageSource(
  source,
  sourceWidth,
  sourceHeight,
  options = {},
) {
  const maxWidth = options.maxWidth ?? IMAGE_COMPRESS_MAX_WIDTH;
  const quality = options.quality ?? IMAGE_COMPRESS_QUALITY;
  const { width, height } = scaledDimensions(sourceWidth, sourceHeight, maxWidth);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  const dataUrl = canvasToJpegDataUrl(canvas, quality);
  const blob = dataUrlToBlob(dataUrl);
  const baseName = options.filename?.replace(/\.[^.]+$/, '') || `foto_${Date.now()}`;
  const file = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });

  return { file, blob, dataUrl, width, height };
}

/** @param {File|Blob} file */
export async function compressImageFile(file, options = {}) {
  if (!file || !(file instanceof Blob)) {
    throw new Error('Ficheiro de imagem inválido.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    return compressImageSource(img, img.naturalWidth || img.width, img.naturalHeight || img.height, {
      ...options,
      filename: options.filename || (file.name || 'foto'),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** @param {string} dataUrl */
export async function compressDataUrl(dataUrl, options = {}) {
  const src = String(dataUrl || '').trim();
  if (!src.startsWith('data:image')) {
    throw new Error('Imagem em base64 inválida.');
  }
  const img = await loadImageElement(src);
  return compressImageSource(img, img.naturalWidth || img.width, img.naturalHeight || img.height, options);
}

export { dataUrlToBlob };
