export function formatBytes(bytes: number, decimals = 1) {
  if (bytes == null || bytes < 0 || Number.isNaN(bytes)) return "";
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatPixelSize(
  dimensions?: string | null,
  widthPx?: number | null,
  heightPx?: number | null
): string | null {
  if (typeof widthPx === "number" && typeof heightPx === "number" && widthPx > 0 && heightPx > 0) {
    return `${widthPx}×${heightPx}px`;
  }
  if (!dimensions) return null;
  const match = String(dimensions).match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!match) return null;
  return `${Number(match[1])}×${Number(match[2])}px`;
}

export function formatFileSizeWithDimensions(
  fileSize: number,
  dimensions?: string | null,
  widthPx?: number | null,
  heightPx?: number | null
) {
  const size = formatBytes(fileSize);
  const px = formatPixelSize(dimensions, widthPx, heightPx);
  if (size && px) return `${size} (${px})`;
  return size || px || "";
}
