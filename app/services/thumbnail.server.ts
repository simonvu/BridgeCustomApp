import sharp from "sharp";

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
