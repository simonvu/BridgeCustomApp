import type { CanvasLayerItem } from "../components/studio/StudioCanvas";

/**
 * Clip Art import + auto-arrange helpers.
 *
 * When a purchased clip-art set is imported, its parts are usually either:
 *  - full-canvas layer PNGs (each the same size, object already placed) — we
 *    detect this and stack them at full size to reconstruct the composition; or
 *  - scattered sprites of different sizes — we lay them out on a neat grid.
 *
 * Plus align / distribute helpers to tidy layers manually.
 */

function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export interface ImportSource {
  url: string;
  name?: string;
}

export interface ArrangeResult {
  mode: "FULL" | "GRID";
  layers: CanvasLayerItem[];
  canvasWidth: number;
  canvasHeight: number;
}

function cleanName(name?: string, fallback = "Layer"): string {
  if (!name) return fallback;
  let n = name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim();
  if (!n) return fallback;
  return n.replace(/\b\w/g, (c) => c.toUpperCase());
}

function makeAssetLayer(
  src: ImportSource,
  idx: number,
  geo: { posX: number; posY: number; width: number; height: number },
  natural: { w: number; h: number }
): CanvasLayerItem {
  return {
    id: `layer_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName(src.name, `Part ${idx + 1}`),
    layerType: "ASSET",
    zIndex: idx,
    posX: Math.round(geo.posX),
    posY: Math.round(geo.posY),
    width: Math.round(geo.width),
    height: Math.round(geo.height),
    rotation: 0,
    isVisible: true,
    isLocked: false,
    properties: {
      assetUrl: src.url,
      opacity: 1,
      naturalWidth: natural.w,
      naturalHeight: natural.h,
      aspectRatio: natural.w / Math.max(1, natural.h),
    },
  };
}

/**
 * Load every image, detect the layout type, and return positioned ASSET layers.
 */
export async function analyzeAndArrangeImages(
  sources: ImportSource[],
  canvasW: number,
  canvasH: number
): Promise<ArrangeResult> {
  const loaded = await Promise.all(
    sources.map(async (s) => {
      const img = await loadImg(s.url);
      return img ? { src: s, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height } : null;
    })
  );
  const items = loaded.filter(Boolean) as { src: ImportSource; w: number; h: number }[];
  if (items.length === 0) {
    return { mode: "GRID", layers: [], canvasWidth: canvasW, canvasHeight: canvasH };
  }

  // Detect "full-canvas" sets: every image shares (nearly) the same dimensions.
  const first = items[0];
  const sameSize = items.every(
    (it) => Math.abs(it.w - first.w) / first.w < 0.02 && Math.abs(it.h - first.h) / first.h < 0.02
  );

  if (sameSize && items.length > 1) {
    // Reconstruct the original composition by stacking each full-size layer.
    const cw = first.w;
    const ch = first.h;
    const layers = items.map((it, idx) =>
      makeAssetLayer(it.src, idx, { posX: 0, posY: 0, width: cw, height: ch }, { w: it.w, h: it.h })
    );
    return { mode: "FULL", layers, canvasWidth: cw, canvasHeight: ch };
  }

  // Scattered sprites -> lay out on a centered grid, each scaled to fit its cell.
  const n = items.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const pad = Math.round(Math.min(canvasW, canvasH) * 0.04);
  const cellW = (canvasW - pad * (cols + 1)) / cols;
  const cellH = (canvasH - pad * (rows + 1)) / rows;

  const layers = items.map((it, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const scale = Math.min(cellW / it.w, cellH / it.h, 1);
    const w = Math.max(8, it.w * scale);
    const h = Math.max(8, it.h * scale);
    const cellX = pad + col * (cellW + pad);
    const cellY = pad + row * (cellH + pad);
    const posX = cellX + (cellW - w) / 2;
    const posY = cellY + (cellH - h) / 2;
    return makeAssetLayer(it.src, idx, { posX, posY, width: w, height: h }, { w: it.w, h: it.h });
  });

  return { mode: "GRID", layers, canvasWidth: canvasW, canvasHeight: canvasH };
}

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

function selectionBBox(layers: CanvasLayerItem[], ids: string[]) {
  const sel = layers.filter((l) => ids.includes(l.id));
  if (sel.length === 0) return null;
  const minX = Math.min(...sel.map((l) => l.posX));
  const minY = Math.min(...sel.map((l) => l.posY));
  const maxX = Math.max(...sel.map((l) => l.posX + l.width));
  const maxY = Math.max(...sel.map((l) => l.posY + l.height));
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, sel };
}

/**
 * Align the selected layers to their common bounding box (2+ selected), or to
 * the canvas when only one layer is selected. Returns a map of id -> patch.
 */
export function computeAlign(
  layers: CanvasLayerItem[],
  ids: string[],
  mode: AlignMode,
  canvasW: number,
  canvasH: number
): Record<string, Partial<CanvasLayerItem>> {
  const patches: Record<string, Partial<CanvasLayerItem>> = {};
  const box = selectionBBox(layers, ids);
  if (!box) return patches;

  const useCanvas = box.sel.length < 2;
  const minX = useCanvas ? 0 : box.minX;
  const maxX = useCanvas ? canvasW : box.maxX;
  const minY = useCanvas ? 0 : box.minY;
  const maxY = useCanvas ? canvasH : box.maxY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  box.sel.forEach((l) => {
    if (l.isLocked) return;
    if (mode === "left") patches[l.id] = { posX: Math.round(minX) };
    else if (mode === "right") patches[l.id] = { posX: Math.round(maxX - l.width) };
    else if (mode === "hcenter") patches[l.id] = { posX: Math.round(cx - l.width / 2) };
    else if (mode === "top") patches[l.id] = { posY: Math.round(minY) };
    else if (mode === "bottom") patches[l.id] = { posY: Math.round(maxY - l.height) };
    else if (mode === "vcenter") patches[l.id] = { posY: Math.round(cy - l.height / 2) };
  });
  return patches;
}

/**
 * Distribute 3+ selected layers with even gaps along an axis.
 */
export function computeDistribute(
  layers: CanvasLayerItem[],
  ids: string[],
  axis: "h" | "v"
): Record<string, Partial<CanvasLayerItem>> {
  const patches: Record<string, Partial<CanvasLayerItem>> = {};
  const sel = layers.filter((l) => ids.includes(l.id) && !l.isLocked);
  if (sel.length < 3) return patches;

  if (axis === "h") {
    const sorted = [...sel].sort((a, b) => a.posX - b.posX);
    const left = sorted[0].posX;
    const right = sorted[sorted.length - 1].posX + sorted[sorted.length - 1].width;
    const totalW = sorted.reduce((s, l) => s + l.width, 0);
    const gap = (right - left - totalW) / (sorted.length - 1);
    let cursor = left;
    sorted.forEach((l) => {
      patches[l.id] = { posX: Math.round(cursor) };
      cursor += l.width + gap;
    });
  } else {
    const sorted = [...sel].sort((a, b) => a.posY - b.posY);
    const top = sorted[0].posY;
    const bottom = sorted[sorted.length - 1].posY + sorted[sorted.length - 1].height;
    const totalH = sorted.reduce((s, l) => s + l.height, 0);
    const gap = (bottom - top - totalH) / (sorted.length - 1);
    let cursor = top;
    sorted.forEach((l) => {
      patches[l.id] = { posY: Math.round(cursor) };
      cursor += l.height + gap;
    });
  }
  return patches;
}
