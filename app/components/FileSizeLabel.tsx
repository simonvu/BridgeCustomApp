import { useEffect, useState } from "react";
import { formatBytes, formatFileSizeWithDimensions, formatPixelSize } from "../utils/mediaMeta";

export function FileSizeLabel({
  fileSize,
  dimensions,
  url,
  isImage,
  className,
}: {
  fileSize?: number;
  dimensions?: string | null;
  url?: string | null;
  isImage?: boolean;
  className?: string;
}) {
  const stored = formatPixelSize(dimensions);
  const [px, setPx] = useState<string | null>(stored);

  useEffect(() => {
    setPx(stored);
    if (stored || !isImage || !url) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setPx(`${img.naturalWidth}×${img.naturalHeight}px`);
      }
    };
    img.src = url;
  }, [stored, isImage, url]);

  const size = fileSize && fileSize > 0 ? formatBytes(fileSize) : "";
  const label = size && px ? `${size} (${px})` : size || px || "";
  if (!label) return null;
  return (
    <span className={className} title={label}>
      {label}
    </span>
  );
}

export { formatFileSizeWithDimensions };
