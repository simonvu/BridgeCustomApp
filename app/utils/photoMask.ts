import * as fabric from "fabric";

export const MASK_SHAPES = [
  "RECTANGLE",
  "ROUNDED",
  "CIRCLE",
  "HEART",
  "STAR",
  "HEXAGON",
  "CUSTOM",
] as const;

export type MaskShape = (typeof MASK_SHAPES)[number] | string;

type LayerLike = {
  id: string;
  layerType: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation?: number;
  isVisible?: boolean;
  maskLayerId?: string;
  parentPhotoUploadId?: string;
  properties?: {
    maskShape?: string;
    maskAssetUrl?: string;
    borderRadius?: number;
  };
};

export type MaskLiveGeom = {
  width: number;
  height: number;
  left: number;
  top: number;
  angle: number;
};

const MAX_MASK_PROCESS_DIM = 2048;
const ALPHA_NOISE_CUTOFF = 8;
const OPAQUE_ALPHA_FLOOR = 250;
const FLOOD_WHITE_BRIGHTNESS = 180;

const customMaskCache = new Map<string, HTMLCanvasElement>();
const customMaskInflight = new Map<string, Promise<HTMLCanvasElement>>();

const PATH_SHAPES: Record<string, string> = {
  HEART:
    "M 50 90 C 20 65 0 45 0 25 C 0 10 12 0 27 0 C 38 0 46 6 50 14 C 54 6 62 0 73 0 C 88 0 100 10 100 25 C 100 45 80 65 50 90 Z",
  STAR: "M 50 0 L 63 35 L 100 38 L 72 63 L 80 100 L 50 80 L 20 100 L 28 63 L 0 38 L 37 35 Z",
  HEXAGON: "M 50 0 L 100 25 L 100 75 L 50 100 L 0 75 L 0 25 Z",
};

function clipKey(shape: string, props: { maskAssetUrl?: string; borderRadius?: number }): string {
  const customReady =
    shape === "CUSTOM" && Boolean(props.maskAssetUrl) && customMaskCache.has(props.maskAssetUrl as string);
  return `${shape}|${props.maskAssetUrl || ""}|${Number(props.borderRadius) || 16}|${customReady ? "img" : "box"}`;
}

function roundedRadii(width: number, height: number, borderRadius?: number): { rx: number; ry: number } {
  const r = Math.min(Math.max(0, Number(borderRadius) || 16), width / 2, height / 2);
  return { rx: r, ry: r };
}

function circleRadii(width: number, height: number): { rx: number; ry: number } {
  return { rx: width / 2, ry: height / 2 };
}

/**
 * Convert an uploaded mask (alpha PNG or black-on-white line art) into a
 * black RGB / alpha canvas. Fabric 7 clipPath uses destination-in on this alpha.
 */
export function processCustomMaskImage(img: HTMLImageElement): HTMLCanvasElement {
  const srcW = Math.max(1, img.naturalWidth || img.width || 100);
  const srcH = Math.max(1, img.naturalHeight || img.height || 100);
  const scale = Math.min(1, MAX_MASK_PROCESS_DIM / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const pixelCount = w * h;

  let fullyTransparent = 0;
  let partialAlpha = 0;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a < ALPHA_NOISE_CUTOFF) fullyTransparent++;
    else if (a < OPAQUE_ALPHA_FLOOR) partialAlpha++;
  }

  const hasRealAlpha = fullyTransparent > pixelCount * 0.002 || partialAlpha > pixelCount * 0.01;

  if (hasRealAlpha) {
    // Keep anti-aliased alpha so custom PNG edges stay smooth under destination-in.
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      if (data[i + 3] < ALPHA_NOISE_CUTOFF) data[i + 3] = 0;
    }
  } else {
    // Opaque line-art: flood-fill from the border to drop the exterior background.
    const isExterior = new Uint8Array(pixelCount);
    const seen = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let qHead = 0;
    let qTail = 0;

    const enqueue = (idx: number) => {
      if (idx < 0 || idx >= pixelCount || seen[idx]) return;
      seen[idx] = 1;
      queue[qTail++] = idx;
    };

    for (let x = 0; x < w; x++) {
      enqueue(x);
      enqueue((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      enqueue(y * w);
      enqueue(y * w + (w - 1));
    }

    while (qHead < qTail) {
      const idx = queue[qHead++];
      const px = idx * 4;
      const brightness = (data[px] + data[px + 1] + data[px + 2]) / 3;
      if (brightness < FLOOD_WHITE_BRIGHTNESS) continue;

      isExterior[idx] = 1;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x > 0) enqueue(idx - 1);
      if (x < w - 1) enqueue(idx + 1);
      if (y > 0) enqueue(idx - w);
      if (y < h - 1) enqueue(idx + w);
    }

    for (let idx = 0; idx < pixelCount; idx++) {
      const px = idx * 4;
      data[px] = 0;
      data[px + 1] = 0;
      data[px + 2] = 0;
      data[px + 3] = isExterior[idx] ? 0 : 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function getCachedCustomMask(url: string): HTMLCanvasElement | undefined {
  return customMaskCache.get(url);
}

export function preloadCustomMaskImage(url: string, onLoaded?: () => void): void {
  if (!url) return;
  if (customMaskCache.has(url)) {
    return;
  }

  let pending = customMaskInflight.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const processed = processCustomMaskImage(img);
        customMaskCache.set(url, processed);
        customMaskInflight.delete(url);
        resolve(processed);
      };
      img.onerror = () => {
        customMaskInflight.delete(url);
        reject(new Error(`Failed to load mask: ${url}`));
      };
      img.src = url;
    });
    customMaskInflight.set(url, pending);
  }

  pending.then(() => onLoaded?.()).catch(() => {});
}

export function findLinkedMaskLayer<T extends LayerLike>(layers: T[], photoLayer: T | undefined): T | undefined {
  if (!photoLayer) return undefined;
  return layers.find(
    (l) =>
      l.id === photoLayer.maskLayerId ||
      (l.layerType === "MASK" && l.parentPhotoUploadId === photoLayer.id)
  );
}

export function findLinkedPhotoLayer<T extends LayerLike>(layers: T[], maskLayer: T): T | undefined {
  return layers.find((l) => l.maskLayerId === maskLayer.id || l.id === maskLayer.parentPhotoUploadId);
}

export function getMaskLiveGeometry(maskObj: fabric.Object | undefined, maskLayer: LayerLike): MaskLiveGeom {
  if (maskObj) {
    const scaleX = maskObj.scaleX || 1;
    const scaleY = maskObj.scaleY || 1;
    let width: number;
    let height: number;
    if (maskObj instanceof fabric.Path) {
      width = Math.max(10, (maskObj.width || 100) * scaleX);
      height = Math.max(10, (maskObj.height || 100) * scaleY);
    } else if (maskObj instanceof fabric.Image) {
      const el = maskObj.getElement?.();
      width = Math.max(10, (el?.width || maskObj.width || 100) * scaleX);
      height = Math.max(10, (el?.height || maskObj.height || 100) * scaleY);
    } else {
      width = Math.max(10, (maskObj.width || maskLayer.width || 100) * scaleX);
      height = Math.max(10, (maskObj.height || maskLayer.height || 100) * scaleY);
    }
    return {
      width,
      height,
      left: maskObj.left || 0,
      top: maskObj.top || 0,
      angle: maskObj.angle || 0,
    };
  }

  return {
    width: maskLayer.width,
    height: maskLayer.height,
    left: maskLayer.posX + maskLayer.width / 2,
    top: maskLayer.posY + maskLayer.height / 2,
    angle: maskLayer.rotation || 0,
  };
}

function updateMaskClipGeometry(
  clip: fabric.Object,
  shape: string,
  geom: MaskLiveGeom,
  borderRadius?: number
) {
  const { width, height, left, top, angle } = geom;
  if (clip instanceof fabric.Path) {
    const pathW = clip.width || 100;
    const pathH = clip.height || 100;
    clip.set({
      left,
      top,
      angle,
      scaleX: width / pathW,
      scaleY: height / pathH,
      dirty: true,
    });
  } else if (clip instanceof fabric.Image) {
    const el = clip.getElement?.();
    const nativeW = Math.max(1, el?.width || clip.width || 1);
    const nativeH = Math.max(1, el?.height || clip.height || 1);
    clip.set({
      left,
      top,
      angle,
      scaleX: width / nativeW,
      scaleY: height / nativeH,
      dirty: true,
    });
  } else {
    const radii =
      shape === "CIRCLE"
        ? circleRadii(width, height)
        : shape === "ROUNDED"
          ? roundedRadii(width, height, borderRadius)
          : { rx: 0, ry: 0 };
    clip.set({
      left,
      top,
      angle,
      width,
      height,
      scaleX: 1,
      scaleY: 1,
      rx: radii.rx,
      ry: radii.ry,
      dirty: true,
    });
  }
  clip.setCoords();
}

/**
 * Build the on-stage mask guide OR an absolute clipPath.
 * Custom PNG clipPaths use a Fabric Image so destination-in respects alpha.
 * Stage guides for CUSTOM stay as a dashed rect (reliable hit target).
 */
export function createFabricMaskObject(
  shape: string,
  width: number,
  height: number,
  left: number,
  top: number,
  options: any = {}
): fabric.Object {
  const originX = options.originX || "center";
  const originY = options.originY || "center";
  const maskAssetUrl = options.maskAssetUrl || options.assetUrl;
  const absolutePositioned = Boolean(options.absolutePositioned);
  const angle = options.angle || 0;
  const borderRadius = options.borderRadius || 16;

  const {
    borderRadius: _br,
    rx: _optRx,
    ry: _optRy,
    maskAssetUrl: _url,
    assetUrl: _assetUrl,
    originX: _ox,
    originY: _oy,
    absolutePositioned: _abs,
    ...restOptions
  } = options;

  if (shape === "CUSTOM" && maskAssetUrl) {
    const processed = customMaskCache.get(maskAssetUrl);
    if (processed && absolutePositioned) {
      return new fabric.Image(processed, {
        left,
        top,
        originX,
        originY,
        angle,
        scaleX: width / Math.max(1, processed.width),
        scaleY: height / Math.max(1, processed.height),
        absolutePositioned: true,
        selectable: false,
        evented: false,
        objectCaching: true,
        strokeWidth: 0,
      });
    }

    if (!processed) {
      preloadCustomMaskImage(maskAssetUrl);
    }

    return new fabric.Rect({
      left,
      top,
      width,
      height,
      rx: 8,
      ry: 8,
      originX,
      originY,
      angle,
      absolutePositioned,
      strokeUniform: true,
      ...restOptions,
    });
  }

  if (shape === "CIRCLE") {
    const { rx, ry } = circleRadii(width, height);
    return new fabric.Rect({
      left,
      top,
      width,
      height,
      originX,
      originY,
      angle,
      absolutePositioned,
      strokeUniform: true,
      ...restOptions,
      rx,
      ry,
    });
  }

  if (shape === "ROUNDED") {
    const { rx, ry } = roundedRadii(width, height, borderRadius);
    return new fabric.Rect({
      left,
      top,
      width,
      height,
      originX,
      originY,
      angle,
      absolutePositioned,
      strokeUniform: true,
      ...restOptions,
      rx,
      ry,
    });
  }

  const pathStr = PATH_SHAPES[shape];
  if (pathStr) {
    const path = new fabric.Path(pathStr, {
      left,
      top,
      originX,
      originY,
      angle,
      absolutePositioned,
      strokeUniform: true,
      ...restOptions,
    });
    const pathW = path.width || 100;
    const pathH = path.height || 100;
    path.set({
      scaleX: width / pathW,
      scaleY: height / pathH,
    });
    return path;
  }

  // RECTANGLE and unknown shapes: sharp corners (ignore leftover rx from options)
  return new fabric.Rect({
    left,
    top,
    width,
    height,
    originX,
    originY,
    angle,
    absolutePositioned,
    strokeUniform: true,
    ...restOptions,
    rx: 0,
    ry: 0,
  });
}

/**
 * Keep the photo's clipPath in sync with the mask window (stage space).
 * Mutates geometry in place during drag/scale so we don't re-parse paths at 60fps.
 */
export function applyPhotoMaskClipPath(
  photoObj: fabric.Object,
  maskLayer: LayerLike,
  geom: MaskLiveGeom
): void {
  const props = maskLayer.properties || {};
  const shape = props.maskShape || "RECTANGLE";
  const nextKey = clipKey(shape, props);
  const existing = photoObj.clipPath as (fabric.Object & { _maskClipKey?: string }) | undefined;

  if (existing && existing._maskClipKey === nextKey) {
    updateMaskClipGeometry(existing, shape, geom, props.borderRadius);
    photoObj.dirty = true;
    return;
  }

  const created = createFabricMaskObject(shape, geom.width, geom.height, geom.left, geom.top, {
    borderRadius: props.borderRadius || 16,
    maskAssetUrl: props.maskAssetUrl,
    originX: "center",
    originY: "center",
    absolutePositioned: true,
    angle: geom.angle,
    strokeWidth: 0,
    stroke: undefined,
    fill: "#000000",
    selectable: false,
    evented: false,
    objectCaching: true,
  });
  (created as any)._maskClipKey = nextKey;
  photoObj.clipPath = created;
  photoObj.dirty = true;
}

export function clearPhotoMaskClipPath(photoObj: fabric.Object): void {
  if (photoObj.clipPath) {
    photoObj.clipPath = undefined;
    photoObj.dirty = true;
  }
}
