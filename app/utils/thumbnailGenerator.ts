/**
 * Auto-generates a trimmed, balanced 1:1 square PNG thumbnail from an image URL.
 * Automatically trims transparent margins for PNG files and centers the content in a square frame.
 */
export async function autoGenerateSquareThumbnail(imageUrl: string, size = 200): Promise<string> {
  return new Promise((resolve) => {
    if (!imageUrl) return resolve("");

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return resolve(imageUrl);

        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        tempCanvas.width = w;
        tempCanvas.height = h;
        tempCtx.drawImage(img, 0, 0);

        // Scan pixels to trim surrounding transparent area
        const imgData = tempCtx.getImageData(0, 0, w, h);
        const data = imgData.data;

        let minX = w, minY = h, maxX = 0, maxY = 0;
        let hasContent = false;

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const alpha = data[(y * w + x) * 4 + 3];
            if (alpha > 10) { // non-transparent pixel threshold
              hasContent = true;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        let cropX = 0, cropY = 0, cropW = w, cropH = h;
        if (hasContent && maxX >= minX && maxY >= minY) {
          cropX = minX;
          cropY = minY;
          cropW = maxX - minX + 1;
          cropH = maxY - minY + 1;
        }

        // Render onto square 1:1 canvas with padding
        const squareCanvas = document.createElement("canvas");
        squareCanvas.width = size;
        squareCanvas.height = size;
        const squareCtx = squareCanvas.getContext("2d");
        if (!squareCtx) return resolve(imageUrl);

        const padding = size * 0.08;
        const maxArea = size - padding * 2;
        const scale = Math.min(maxArea / cropW, maxArea / cropH);

        const drawW = cropW * scale;
        const drawH = cropH * scale;
        const drawX = (size - drawW) / 2;
        const drawY = (size - drawH) / 2;

        squareCtx.drawImage(
          tempCanvas,
          cropX, cropY, cropW, cropH,
          drawX, drawY, drawW, drawH
        );

        resolve(squareCanvas.toDataURL("image/png"));
      } catch (err) {
        console.warn("⚠️ Client-side thumbnail generation fallback to original URL:", err);
        resolve(imageUrl);
      }
    };
    img.onerror = () => resolve(imageUrl);
    img.src = imageUrl;
  });
}
