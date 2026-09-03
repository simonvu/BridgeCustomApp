import type { CanvasLayerItem } from "../components/studio/StudioCanvas";

/**
 * Merge helpers for the Clip Art Builder. The goal is to reduce the number of
 * layers a customer ends up interacting with by combining parts of an asset.
 *
 * - CONCAT (geometry): reposition selected layers so they sit adjacent in a
 *   row/column (non-destructive). See computeConcat.
 * - OPTION MERGE: Parallel (zip by index), Combination (cartesian product),
 *   Concat (join option lists). Rasterizing is done offscreen in this module.
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

export type OptionMergeType = "parallel" | "combination" | "concat";

export type MergeOptionInput = {
  id?: string;
  label?: string;
  value?: string;
  assetImageUrl?: string;
  swatchImageUrl?: string;
  isEmpty?: boolean;
  isVisible?: boolean;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  flipH?: boolean;
  flipV?: boolean;
};

export type MergeLayerInput = {
  id: string;
  name: string;
  zIndex: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  properties?: {
    assetUrl?: string;
    opacity?: number;
    flipH?: boolean;
    flipV?: boolean;
  };
};

export type MergePlacement = {
  url: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  flipH: boolean;
  flipV: boolean;
  zIndex: number;
};

export type MergeCombo = {
  label: string;
  placements: MergePlacement[];
  sourceOptions: MergeOptionInput[];
};

export type MergeGroup = {
  layer: MergeLayerInput;
  options: MergeOptionInput[];
  hasEmpty: boolean;
};

function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((row) => list.map((item) => [...row, item])), [[]]);
}

export function visibleMergeOptions(options: MergeOptionInput[]): MergeOptionInput[] {
  return options.filter((o) => o.isVisible !== false && !o.isEmpty);
}

export function optionPlacement(layer: MergeLayerInput, option?: MergeOptionInput | null): MergePlacement | null {
  const url = String(option?.assetImageUrl || layer.properties?.assetUrl || "");
  if (!url) return null;
  return {
    url,
    posX: option?.posX ?? layer.posX,
    posY: option?.posY ?? layer.posY,
    width: option?.width ?? layer.width,
    height: option?.height ?? layer.height,
    rotation: option?.rotation ?? layer.rotation ?? 0,
    opacity: option?.opacity ?? layer.properties?.opacity ?? 1,
    flipH: Boolean(option?.flipH ?? layer.properties?.flipH),
    flipV: Boolean(option?.flipV ?? layer.properties?.flipV),
    zIndex: layer.zIndex,
  };
}

export function comboLabel(options: MergeOptionInput[]): string {
  return options
    .map((o) => String(o.label || o.value || "").trim())
    .filter(Boolean)
    .join(" + ");
}

export function countMergedOptions(groups: MergeGroup[], type: OptionMergeType): number {
  const sizes = groups.map((g) => Math.max(1, g.options.length));
  if (type === "parallel") return Math.min(...sizes);
  if (type === "combination") return sizes.reduce((n, s) => n * s, 1);
  return sizes.reduce((n, s) => n + s, 0);
}

export function buildMergeCombos(
  groups: MergeGroup[],
  type: OptionMergeType,
  concat?: { useFirstOption?: boolean; newOptionName?: string }
): MergeCombo[] {
  if (groups.length < 2) return [];

  if (type === "concat") {
    const useFirst = concat?.useFirstOption !== false;
    const prefix = String(concat?.newOptionName || "").trim();
    const combos: MergeCombo[] = [];
    let i = 0;
    groups.forEach((g) => {
      g.options.forEach((opt) => {
        i += 1;
        const placement = optionPlacement(g.layer, opt);
        if (!placement) return;
        combos.push({
          label: useFirst ? String(opt.label || opt.value || `Option ${i}`) : `${prefix || "Option"} ${i}`,
          placements: [placement],
          sourceOptions: [opt],
        });
      });
    });
    return combos;
  }

  const lists = groups.map((g) => (g.options.length > 0 ? g.options : [{ label: g.layer.name, assetImageUrl: g.layer.properties?.assetUrl }]));
  const rows =
    type === "parallel"
      ? Array.from({ length: Math.min(...lists.map((l) => l.length)) }, (_, i) => lists.map((l) => l[i]))
      : cartesian(lists);

  return rows
    .map((opts) => {
      const placements = groups
        .map((g, idx) => optionPlacement(g.layer, opts[idx]))
        .filter((p): p is MergePlacement => Boolean(p))
        .sort((a, b) => a.zIndex - b.zIndex);
      if (placements.length === 0) return null;
      return { label: comboLabel(opts) || "Merged", placements, sourceOptions: opts };
    })
    .filter((c): c is MergeCombo => Boolean(c));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

export function unionBBox(placements: MergePlacement[]): { minX: number; minY: number; width: number; height: number } {
  const minX = Math.min(...placements.map((p) => p.posX));
  const minY = Math.min(...placements.map((p) => p.posY));
  const maxX = Math.max(...placements.map((p) => p.posX + p.width));
  const maxY = Math.max(...placements.map((p) => p.posY + p.height));
  return {
    minX: Math.round(minX),
    minY: Math.round(minY),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
  };
}

export async function rasterizePlacements(placements: MergePlacement[]): Promise<string> {
  if (placements.length === 0) return "";
  const bbox = unionBBox(placements);
  const canvas = document.createElement("canvas");
  canvas.width = bbox.width;
  canvas.height = bbox.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const images = await Promise.all(placements.map((p) => loadImage(p.url)));
  placements.forEach((p, i) => {
    const img = images[i];
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity ?? 1));
    ctx.translate(p.posX - bbox.minX + p.width / 2, p.posY - bbox.minY + p.height / 2);
    ctx.rotate(((p.rotation || 0) * Math.PI) / 180);
    ctx.scale(p.flipH ? -1 : 1, p.flipV ? -1 : 1);
    ctx.drawImage(img, -p.width / 2, -p.height / 2, p.width, p.height);
    ctx.restore();
  });
  return canvas.toDataURL("image/png");
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
