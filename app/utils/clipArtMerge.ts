import type { CanvasLayerItem } from "../components/studio/StudioCanvas";

/**
 * Merge helpers for the Clip Art Builder. The goal is to reduce the number of
 * layers a customer ends up interacting with by combining parts of an asset.
 *
 * - CONCAT: reposition selected layers so they sit adjacent in a row/column
 *   (pure geometry, non-destructive). Great for stitching pieces into a strip.
 * - FLATTEN / GROUP are performed in the builder because they need the live
 *   Fabric canvas (rasterize) — see the Clip Art Builder route.
 */

export type ConcatDirection = "row" | "col";

/**
 * Lay the selected layers out adjacent to each other (with an optional gap),
 * starting from the top-left of the current selection. Alignment on the cross
 * axis is centered on the selection's mid line. Returns id -> patch.
 */
export function computeConcat(
  layers: CanvasLayerItem[],
  ids: string[],
  direction: ConcatDirection,
  gap = 0
): Record<string, Partial<CanvasLayerItem>> {
  const patches: Record<string, Partial<CanvasLayerItem>> = {};
  const sel = layers.filter((l) => ids.includes(l.id) && !l.isLocked);
  if (sel.length < 2) return patches;

  const minX = Math.min(...sel.map((l) => l.posX));
  const minY = Math.min(...sel.map((l) => l.posY));

  if (direction === "row") {
    const sorted = [...sel].sort((a, b) => a.posX - b.posX);
    const maxH = Math.max(...sorted.map((l) => l.height));
    const midY = minY + maxH / 2;
    let cursor = minX;
    sorted.forEach((l) => {
      patches[l.id] = { posX: Math.round(cursor), posY: Math.round(midY - l.height / 2) };
      cursor += l.width + gap;
    });
  } else {
    const sorted = [...sel].sort((a, b) => a.posY - b.posY);
    const maxW = Math.max(...sorted.map((l) => l.width));
    const midX = minX + maxW / 2;
    let cursor = minY;
    sorted.forEach((l) => {
      patches[l.id] = { posY: Math.round(cursor), posX: Math.round(midX - l.width / 2) };
      cursor += l.height + gap;
    });
  }
  return patches;
}

/**
 * Convert a data URL (from a Fabric export) into a File for /api/upload.
 */
export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [head, b64] = dataUrl.split(",");
  const mimeMatch = head.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], fileName, { type: mime });
}
