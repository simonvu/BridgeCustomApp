import sharp from "sharp";

const ALPHA_CUTOFF = 12;

/**
 * Trim transparent (and near-transparent) margins, then center the artwork in a
 * square PNG. Used for clip-art option swatches so 1000×1000 assets with a small
 * drawing don't look like a tiny icon in a sea of checkerboard.
 */
export async function generateTrimmedSquarePng(imageBuffer: Buffer, size = 256): Promise<Buffer> {
  const normalized = await sharp(imageBuffer).rotate().ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(normalized).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const channels = info.channels;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * channels + 3];
      if (a > ALPHA_CUTOFF) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const hasContent = maxX >= minX && maxY >= minY;
  const crop = hasContent
    ? { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : { left: 0, top: 0, width: w, height: h };

  const cropAspect = crop.width / Math.max(1, crop.height);
  const paddingRatio = cropAspect > 2.2 || cropAspect < 0.45 ? 0.06 : 0.08;
  const padding = Math.round(size * paddingRatio);
  const maxArea = Math.max(1, size - padding * 2);
  const scale = Math.min(maxArea / crop.width, maxArea / crop.height);
  const drawW = Math.max(1, Math.round(crop.width * scale));
  const drawH = Math.max(1, Math.round(crop.height * scale));
  const left = Math.round((size - drawW) / 2);
  const top = Math.round((size - drawH) / 2);

  const artwork = await sharp(normalized).extract(crop).resize(drawW, drawH).png().toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: artwork, left, top }])
    .png()
    .toBuffer();
}

/**
 * Tự động tạo ảnh thu nhỏ Thumbnail (WebP format, width max 400px, quality 80%)
 * Giúp tối ưu dung lượng từ 5MB-10MB xuống chỉ còn 20KB-40KB khi hiển thị trên giao diện!
 */
export async function generateThumbnail(imageBuffer: Buffer): Promise<{
  buffer: Buffer;
  contentType: string;
  extension: string;
  width?: number;
  height?: number;
} | null> {
  try {
    const metadata = await sharp(imageBuffer).metadata();

    if (!metadata || !metadata.format) {
      return null;
    }

    // Resize ảnh về chiều rộng tối đa 400px, giữ nguyên tỉ lệ khung hình, xuất định dạng WebP siêu nhẹ
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize({
        width: 400,
        withoutEnlargement: true,
        fit: "inside",
      })
      .webp({ quality: 80 })
      .toBuffer();

    const thumbMeta = await sharp(thumbnailBuffer).metadata();

    return {
      buffer: thumbnailBuffer,
      contentType: "image/webp",
      extension: "webp",
      width: thumbMeta.width,
      height: thumbMeta.height,
    };
  } catch (error) {
    console.error("⚠️ Cannot generate thumbnail via sharp (non-image or corrupt file):", error);
    return null;
  }
}
