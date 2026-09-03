/**
 * Auto-generates a trimmed, balanced 1:1 square PNG thumbnail from an image URL.
 * Client trim uses a blob fetch so the canvas is not CORS-tainted.
 * Persistence goes through /api/swatch-thumb (sharp) when available.
 */

const ALPHA_CUTOFF = 10;
const displayCache = new Map<string, string>();

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function renderTrimmedSquare(img: HTMLImageElement, size: number): string {
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
  if (!tempCtx) throw new Error("no 2d context");

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("empty image");
  tempCanvas.width = w;
  tempCanvas.height = h;
  tempCtx.drawImage(img, 0, 0);

  const { data } = tempCtx.getImageData(0, 0, w, h);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > ALPHA_CUTOFF) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const hasContent = maxX >= minX && maxY >= minY;
  const cropX = hasContent ? minX : 0;
  const cropY = hasContent ? minY : 0;
  const cropW = hasContent ? maxX - minX + 1 : w;
  const cropH = hasContent ? maxY - minY + 1 : h;

  const squareCanvas = document.createElement("canvas");
  squareCanvas.width = size;
  squareCanvas.height = size;
  const squareCtx = squareCanvas.getContext("2d");
  if (!squareCtx) throw new Error("no 2d context");

  const cropAspect = cropW / Math.max(1, cropH);
  const paddingRatio = cropAspect > 2.2 || cropAspect < 0.45 ? 0.06 : 0.08;
  const padding = size * paddingRatio;
  const maxArea = size - padding * 2;
  const scale = Math.min(maxArea / cropW, maxArea / cropH);
  const drawW = cropW * scale;
  const drawH = cropH * scale;
  const drawX = (size - drawW) / 2;
  const drawY = (size - drawH) / 2;

  squareCtx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, drawX, drawY, drawW, drawH);
  return squareCanvas.toDataURL("image/png");
}

async function generateViaApi(imageUrl: string, size: number): Promise<string> {
  const res = await fetch("/api/swatch-thumb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: imageUrl, size }),
  });
  const data = await res.json();
  if (data?.success && data.url) return data.url as string;
  throw new Error(data?.error || "swatch-thumb failed");
}

/** Client-only trim for studio swatches. Does not upload. */
export async function trimToSquareDataUrl(imageUrl: string, size = 128): Promise<string> {
  if (!imageUrl) return "";
  const key = `${imageUrl}|${size}`;
  const cached = displayCache.get(key);
  if (cached) return cached;

  const fromBlob = async () => {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await loadImageElement(objectUrl);
      return renderTrimmedSquare(img, size);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  try {
    const out = await fromBlob();
    displayCache.set(key, out);
    return out;
  } catch {
    try {
      const img = await loadImageElement(imageUrl);
      const out = renderTrimmedSquare(img, size);
      displayCache.set(key, out);
      return out;
    } catch (err) {
      console.warn("Client-side thumbnail trim failed:", err);
      return imageUrl;
    }
  }
}

export async function autoGenerateSquareThumbnail(imageUrl: string, size = 200): Promise<string> {
  if (!imageUrl) return "";

  try {
    return await generateViaApi(imageUrl, size);
  } catch (apiErr) {
    console.warn("Server swatch trim failed, trying client canvas:", apiErr);
  }

  const dataUrl = await trimToSquareDataUrl(imageUrl, size);
  return dataUrl || imageUrl;
}
