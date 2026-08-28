import React, { useEffect, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import { ZoomIn, ZoomOut, RotateCcw, Grid, Eye } from "lucide-react";
import { ensureFontLoaded, FontItem } from "../../utils/fontLoader";
import { generateWordSearchPuzzle } from "../../utils/wordSearchEngine";
import { resolveDoodleStyleAssignments, loadAndTrimImage } from "../../utils/doodleAlphabetEngine";

export interface CanvasLayerItem {
  id: string;
  name: string;
  layerType: "BACKGROUND" | "ASSET" | "TEXT" | "PHOTO_UPLOAD" | "OVERLAY" | "MASK" | "WORD_SEARCH_PUZZLE" | "DOODLE_ALPHABET";
  zIndex: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  scaleX?: number;
  scaleY?: number;
  isVisible: boolean;
  isLocked: boolean;
  properties?: any; // { text, font, color, assetUrl, alignment, maskShape, borderRadius... }
  linkedFieldId?: string;
  maskLayerId?: string;
  parentPhotoUploadId?: string;
}

// Helper to process any custom uploaded mask image into a pure transparent alpha mask (using BFS flood-fill for line-art/outlines)
export function processCustomMaskImage(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const w = img.naturalWidth || img.width || 100;
  const h = img.naturalHeight || img.height || 100;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Check if image has existing alpha channel transparency
  let hasAlphaTransparency = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) {
      hasAlphaTransparency = true;
      break;
    }
  }

  if (hasAlphaTransparency) {
    // Transparent PNG: make all visible pixels solid black mask
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 20) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      } else {
        data[i + 3] = 0;
      }
    }
  } else {
    // Opaque image (black shape or outline on white background):
    // Use BFS Flood-Fill from outer edges to separate exterior background from interior shape
    const isExterior = new Uint8Array(w * h);
    const queue: number[] = [];

    // Add all 4 outer border pixels to the queue
    for (let x = 0; x < w; x++) {
      queue.push(x); // top row
      queue.push((h - 1) * w + x); // bottom row
    }
    for (let y = 0; y < h; y++) {
      queue.push(y * w); // left column
      queue.push(y * w + (w - 1)); // right column
    }

    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      if (isExterior[idx]) continue;

      const pxOffset = idx * 4;
      const r = data[pxOffset];
      const g = data[pxOffset + 1];
      const b = data[pxOffset + 2];
      const brightness = (r + g + b) / 3;

      // If this pixel is light/white (background pixel), mark as exterior and flood to neighbors
      if (brightness >= 180) {
        isExterior[idx] = 1;
        const x = idx % w;
        const y = Math.floor(idx / w);

        if (x > 0 && !isExterior[idx - 1]) queue.push(idx - 1);
        if (x < w - 1 && !isExterior[idx + 1]) queue.push(idx + 1);
        if (y > 0 && !isExterior[idx - w]) queue.push(idx - w);
        if (y < h - 1 && !isExterior[idx + w]) queue.push(idx + w);
      }
    }

    // Convert pixels: exterior pixels -> transparent (a=0), non-exterior (stroke + interior) -> opaque black (a=255)
    for (let idx = 0; idx < w * h; idx++) {
      const pxOffset = idx * 4;
      if (isExterior[idx]) {
        data[pxOffset + 3] = 0; // Transparent background
      } else {
        data[pxOffset] = 0;       // R
        data[pxOffset + 1] = 0;   // G
        data[pxOffset + 2] = 0;   // B
        data[pxOffset + 3] = 255; // Solid opaque mask interior & stroke
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// Helper to strictly enforce Fabric canvas z-index stacking order (lowest zIndex at index 0, highest zIndex at top)
export function enforceZIndexOrder(fc: fabric.Canvas, visibleLayers: CanvasLayerItem[]) {
  if (!fc) return;
  const sortedVisibleLayers = [...visibleLayers].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  sortedVisibleLayers.forEach((l, targetIdx) => {
    const fabObj = fc.getObjects().find((o: any) => o.layerId === l.id);
    if (fabObj) {
      if (typeof (fc as any).moveObjectTo === "function") {
        (fc as any).moveObjectTo(fabObj, targetIdx);
      } else if (typeof (fabObj as any).moveTo === "function") {
        (fabObj as any).moveTo(targetIdx);
      }
    }
  });
  fc.requestRenderAll();
}

// Helper to composite a photo image inside a custom mask canvas at relative position and bounds
export function renderClippedPhotoCanvas(
  photoImg: HTMLImageElement | HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  photoW: number,
  photoH: number,
  maskRelX: number,
  maskRelY: number,
  maskW: number,
  maskH: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const canvasW = Math.max(10, Math.round(photoW || 300));
  const canvasH = Math.max(10, Math.round(photoH || 300));
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  if (!maskCanvas) {
    try {
      ctx.drawImage(photoImg, 0, 0, canvasW, canvasH);
    } catch (e) {
      // ignore
    }
    return canvas;
  }

  try {
    // 1. Draw full photo image inside photo layer bounds (0, 0, photoW, photoH)
    ctx.drawImage(photoImg, 0, 0, canvasW, canvasH);

    // 2. Prepare offscreen mask canvas scaled and positioned at relative mask bounds
    const maskLayerCanvas = document.createElement("canvas");
    maskLayerCanvas.width = canvasW;
    maskLayerCanvas.height = canvasH;
    const maskCtx = maskLayerCanvas.getContext("2d");
    if (maskCtx) {
      maskCtx.drawImage(
        maskCanvas,
        Math.round(maskRelX),
        Math.round(maskRelY),
        Math.max(1, Math.round(maskW)),
        Math.max(1, Math.round(maskH))
      );
    }

    // 3. Composite mask onto photo using destination-in (keeps photo pixels ONLY where mask is visible)
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskLayerCanvas, 0, 0);
  } catch (err) {
    console.warn("renderClippedPhotoCanvas error:", err);
  }

  return canvas;
}

// Cache memory for custom mask PNG/SVG processed canvases
const customMaskCache = new Map<string, HTMLCanvasElement>();

export function preloadCustomMaskImage(url: string, onLoaded?: () => void) {
  if (!url) return;
  if (customMaskCache.has(url)) {
    if (onLoaded) onLoaded();
    return;
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const processed = processCustomMaskImage(img);
    customMaskCache.set(url, processed);
    if (onLoaded) onLoaded();
  };
  img.src = url;
}

export function createFabricMaskObject(
  shape: string,
  width: number,
  height: number,
  left: number,
  top: number,
  options: any = {}
): fabric.Object {
  const rx = options.borderRadius || 16;
  const originX = options.originX || "center";
  const originY = options.originY || "center";
  const maskAssetUrl = options.maskAssetUrl || options.assetUrl;

  if (shape === "CUSTOM" && maskAssetUrl) {
    if (!customMaskCache.has(maskAssetUrl)) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const processedCanvas = processCustomMaskImage(img);
        customMaskCache.set(maskAssetUrl, processedCanvas);

        const fc = globalActiveFabricCanvas;
        if (fc) {
          fc.getObjects().forEach((o: any) => {
            if (o instanceof fabric.Image && (o as any)._rawImageElement) {
              const rawImgEl = (o as any)._rawImageElement;
              const photoLayerId = o.layerId;
              const currentLayers = layersRef.current || [];
              const photoLayer = currentLayers.find((l) => l.id === photoLayerId);
              const linkedMask = currentLayers.find(
                (l) => l.id === photoLayer?.maskLayerId || (l.layerType === "MASK" && l.parentPhotoUploadId === photoLayerId)
              );

              const activeMask =
                linkedMask ||
                currentLayers.find(
                  (l) => l.layerType === "MASK" && l.properties?.maskShape === "CUSTOM" && l.properties?.maskAssetUrl === maskAssetUrl
                );

              if (activeMask && activeMask.properties?.maskAssetUrl === maskAssetUrl) {
                const photoW = photoLayer ? photoLayer.width : o.width * (o.scaleX || 1);
                const photoH = photoLayer ? photoLayer.height : o.height * (o.scaleY || 1);
                const maskW = activeMask.width;
                const maskH = activeMask.height;
                const maskRelX = photoLayer ? activeMask.posX - photoLayer.posX : 0;
                const maskRelY = photoLayer ? activeMask.posY - photoLayer.posY : 0;

                const clippedCanvas = renderClippedPhotoCanvas(
                  rawImgEl,
                  processedCanvas,
                  photoW,
                  photoH,
                  maskRelX,
                  maskRelY,
                  maskW,
                  maskH
                );
                o.setElement(clippedCanvas);
                o.set({
                  scaleX: photoW / clippedCanvas.width,
                  scaleY: photoH / clippedCanvas.height,
                  clipPath: undefined,
                });
                (o as any)._isClippedCanvas = true;
                o.setCoords();
              }
            }
          });
          fc.requestRenderAll();
        }
      };
      img.src = maskAssetUrl;
    }

    // Always return a clean purple dashed guide rect for stage display
    return new fabric.Rect({
      left,
      top,
      width,
      height,
      rx: 8,
      ry: 8,
      originX,
      originY,
      absolutePositioned: options.absolutePositioned || false,
      strokeUniform: true,
      ...options,
    });
  }

  if (shape === "RECTANGLE") {
    const { borderRadius, rx: optRx, ry: optRy, ...restOptions } = options;
    return new fabric.Rect({
      left,
      top,
      width,
      height,
      originX,
      originY,
      absolutePositioned: options.absolutePositioned || false,
      strokeUniform: true,
      ...restOptions,
      rx: 0,
      ry: 0,
    });
  }

  if (shape === "CIRCLE") {
    return new fabric.Rect({
      left,
      top,
      width,
      height,
      rx: width / 2,
      ry: height / 2,
      originX,
      originY,
      absolutePositioned: options.absolutePositioned || false,
      strokeUniform: true,
      ...options,
    });
  }

  if (shape === "ROUNDED") {
    return new fabric.Rect({
      left,
      top,
      width,
      height,
      rx: Math.min(rx, width / 2, height / 2),
      ry: Math.min(rx, width / 2, height / 2),
      originX,
      originY,
      absolutePositioned: options.absolutePositioned || false,
      strokeUniform: true,
      ...options,
    });
  }

  let pathStr = "";
  if (shape === "HEART") {
    pathStr =
      "M 50 90 C 20 65 0 45 0 25 C 0 10 12 0 27 0 C 38 0 46 6 50 14 C 54 6 62 0 73 0 C 88 0 100 10 100 25 C 100 45 80 65 50 90 Z";
  } else if (shape === "STAR") {
    pathStr =
      "M 50 0 L 63 35 L 100 38 L 72 63 L 80 100 L 50 80 L 20 100 L 28 63 L 0 38 L 37 35 Z";
  } else if (shape === "HEXAGON") {
    pathStr =
      "M 50 0 L 100 25 L 100 75 L 50 100 L 0 75 L 0 25 Z";
  }

  if (pathStr) {
    const rawPath = new fabric.Path(pathStr);
    const pathW = rawPath.width || 100;
    const pathH = rawPath.height || 100;

    return new fabric.Path(pathStr, {
      left,
      top,
      scaleX: width / pathW,
      scaleY: height / pathH,
      originX,
      originY,
      absolutePositioned: options.absolutePositioned || false,
      strokeUniform: true,
      ...options,
    });
  }

  // Fallback RECTANGLE (100% sharp)
  const { borderRadius, rx: optRx, ry: optRy, ...restOptions } = options;
  return new fabric.Rect({
    left,
    top,
    width,
    height,
    originX,
    originY,
    absolutePositioned: options.absolutePositioned || false,
    strokeUniform: true,
    ...restOptions,
    rx: 0,
    ry: 0,
  });
}

interface StudioCanvasProps {
  widthPx: number;
  heightPx: number;
  layers: CanvasLayerItem[];
  fields?: any[];
  selectedLayerId: string | null;
  selectedLayerIds?: string[];
  onSelectLayer: (layerId: string | null, isMultiKey?: boolean) => void;
  onUpdateLayer: (layerId: string, updatedProps: Partial<CanvasLayerItem>) => void;
  onUpdateField?: (fieldId: string, updatedProps: any) => void;
  bgUrl?: string | null;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  showGrid?: boolean;
  workspaceBgColor?: string;
  isPreviewMode?: boolean;
  onToggleGrid?: () => void;
  fonts?: FontItem[];
  doodlePacks?: any[];
}

/**
 * Creates Mathematically Symmetrical Bezier Curve Path for Fabric.js Text-on-Path
 * Guarantees pathOffset = (0, 0) for zero rendering matrix error and 100% horizontal symmetry
 */
function createFabricCurvePath(
  containerWidth: number,
  containerHeight: number,
  curveAngleDeg: number,
  fontSize: number = 36
): fabric.Path | null {
  if (!curveAngleDeg || Math.abs(curveAngleDeg) < 2) return null;

  const angleDeg = Math.max(-360, Math.min(360, curveAngleDeg));
  const isSmile = angleDeg < 0;
  const halfW = Math.max(20, containerWidth / 2);
  
  // Calculate maximum allowable Sagitta so the curve + font height stay 100% inside containerHeight
  const effectiveFontHeight = Math.min(fontSize * 0.85, containerHeight * 0.7);
  const maxSagitta = Math.max(10, containerHeight - effectiveFontHeight);
  const sagitta = (Math.min(180, Math.abs(angleDeg)) / 180) * maxSagitta;

  const yStartEnd = isSmile ? -sagitta / 2 : sagitta / 2;
  const yControl = isSmile ? sagitta / 2 : -sagitta / 2;

  const pathStr = `M ${(-halfW).toFixed(2)} ${yStartEnd.toFixed(2)} Q 0 ${yControl.toFixed(2)} ${halfW.toFixed(2)} ${yStartEnd.toFixed(2)}`;
  return new fabric.Path(pathStr, { fill: "", stroke: "" });
}

/**
 * Applies Text Case Transformations (UPPERCASE, LOWERCASE, TITLECASE)
 */
function applyTextCase(text: string, textCase?: string): string {
  if (!text) return "";
  if (textCase === "UPPERCASE") return text.toUpperCase();
  if (textCase === "LOWERCASE") return text.toLowerCase();
  if (textCase === "TITLECASE") {
    return text.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  }
  return text;
}

/**
 * Calculates font size so text fits 100% inside container width if autoFit is enabled
 */
function getFitFontSize(
  textStr: string,
  fontFamily: string,
  baseFontSize: number,
  containerWidth: number,
  isAutoFit: boolean = true,
  fontWeight: string = "normal"
): number {
  if (!isAutoFit || !textStr || containerWidth <= 0) return baseFontSize;
  try {
    const targetWidth = Math.max(10, containerWidth - 6);
    let currentFontSize = baseFontSize;

    for (let pass = 0; pass < 15; pass++) {
      const tempText = new fabric.Text(textStr, {
        fontFamily: fontFamily,
        fontSize: currentFontSize,
        fontWeight: fontWeight,
      });
      const measuredWidth = tempText.width || 0;
      if (measuredWidth <= targetWidth || currentFontSize <= 6) {
        break;
      }
      const scaleFactor = targetWidth / measuredWidth;
      const nextSize = Math.floor(currentFontSize * scaleFactor);
      if (nextSize >= currentFontSize) {
        currentFontSize -= 1;
      } else {
        currentFontSize = Math.max(6, nextSize);
      }
    }
    return currentFontSize;
  } catch (e) {
    return baseFontSize;
  }
}

export default function StudioCanvas({
  widthPx,
  heightPx,
  layers,
  fields = [],
  selectedLayerId,
  selectedLayerIds = [],
  onSelectLayer,
  onUpdateLayer,
  onUpdateField,
  bgUrl,
  zoom: propZoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  showGrid: propShowGrid,
  workspaceBgColor = "#ffffff",
  isPreviewMode = false,
  onToggleGrid,
  fonts = [],
  doodlePacks = [],
}: StudioCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const isUpdatingFromFabricRef = useRef(false);
  const pendingFrameUpdatesRef = useRef<{ [layerId: string]: { posX: number; posY: number; width: number; height: number } }>({});

  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const fieldsRef = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  const onUpdateLayerRef = useRef(onUpdateLayer);
  useEffect(() => {
    onUpdateLayerRef.current = onUpdateLayer;
  }, [onUpdateLayer]);

  const [internalZoom, setInternalZoom] = useState(1);
  const [internalShowGrid, setInternalShowGrid] = useState(true);
  const [maskCacheVersion, setMaskCacheVersion] = useState(0);

  const zoom = propZoom !== undefined ? propZoom : internalZoom;
  const showGrid = propShowGrid !== undefined ? propShowGrid : internalShowGrid;

  const setZoom = useCallback((action: number | ((prev: number) => number)) => {
    setInternalZoom(action);
  }, []);

  // Preload all fonts used in TEXT and WORD_SEARCH_PUZZLE layers as soon as layers load
  useEffect(() => {
    const textLayers = layers.filter((l) => l.layerType === "TEXT" || l.layerType === "WORD_SEARCH_PUZZLE");
    textLayers.forEach((l) => {
      const font = l.properties?.fontFamily || l.properties?.gridFontFamily;
      if (font) {
        ensureFontLoaded(font, fonts).catch(() => {});
      }
    });
  }, [layers, fonts]);

  // Global Event Listener when ANY font finishes downloading in browser
  useEffect(() => {
    const handleFontLoaded = (e: any) => {
      const fc = fabricCanvasRef.current;
      if (!fc) return;

      const loadedFamily = e.detail?.fontFamily;

      fc.getObjects().forEach((obj: any) => {
        if (obj.layerId) {
          const layer = layersRef.current.find((item) => item.id === obj.layerId);
          if (layer && layer.layerType === "TEXT") {
            const props = layer.properties || {};
            const font = props.fontFamily || "Roboto";

            if (!loadedFamily || font.toLowerCase() === loadedFamily.toLowerCase()) {
              const rawTextStr = props.text !== undefined ? props.text : layer.name;
              const textStr = applyTextCase(rawTextStr, props.textCase);
              const fontWeight = props.fontWeight || "normal";
              const baseFontSize = Number(props.fontSize) || 36;
              const isAutoFit = Boolean((props.autoFit !== false) && !props.allowMultiline);
              const freshFontSize = getFitFontSize(textStr, font, baseFontSize, layer.width, isAutoFit, fontWeight);
              const hAlign = props.align || "center";
              const vAlign = props.verticalAlign || "middle";

              if (obj instanceof fabric.Text || obj instanceof fabric.Textbox) {
                obj.set({
                  fontFamily: font,
                  fontSize: freshFontSize,
                  textAlign: hAlign,
                  dirty: true,
                });
                obj.initDimensions();
              }
            }
          }
        }
      });
      fc.requestRenderAll();
    };

    window.addEventListener("studio:font-loaded", handleFontLoaded);
    return () => {
      window.removeEventListener("studio:font-loaded", handleFontLoaded);
    };
  }, []);

  // Auto-fit zoom on initial mount
  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 100;
      const containerHeight = containerRef.current.clientHeight - 100;
      if (containerWidth > 0 && containerHeight > 0) {
        const scaleX = containerWidth / widthPx;
        const scaleY = containerHeight / heightPx;
        const autoZoom = Math.min(scaleX, scaleY, 1);
        setZoom(Math.max(0.2, Math.round(autoZoom * 100) / 100));
      }
    }
  }, [widthPx, heightPx, setZoom]);

  // Initialize Fabric.js Canvas
  useEffect(() => {
    if (!canvasElRef.current) return;

    if ((canvasElRef.current as any).__fabric) {
      try {
        (canvasElRef.current as any).__fabric.dispose();
      } catch (e) {
        // ignore
      }
      delete (canvasElRef.current as any).__fabric;
    }

    if (fabricCanvasRef.current) {
      try {
        fabricCanvasRef.current.dispose();
      } catch (e) {
        // ignore
      }
      fabricCanvasRef.current = null;
    }

    // Configure Fabric.js Controls Styling (Professional Blue Theme)
    fabric.FabricObject.prototype.transparentCorners = false;
    fabric.FabricObject.prototype.cornerColor = "#4f46e5";
    fabric.FabricObject.prototype.cornerStyle = "circle";
    fabric.FabricObject.prototype.borderColor = "#4f46e5";
    fabric.FabricObject.prototype.borderDashArray = [4, 4];
    fabric.FabricObject.prototype.cornerSize = 10;

    const fabricCanvas = new fabric.Canvas(canvasElRef.current, {
      width: widthPx,
      height: heightPx,
      selection: true,
      preserveObjectStacking: true,
    });

    fabricCanvasRef.current = fabricCanvas;
    globalActiveFabricCanvas = fabricCanvas;

    // Handle Object Scaling (Disable font distortion & dynamically recalculate live Auto-Fit)
    const handleObjectScaling = (e: any) => {
      const target = e.target;
      if (!target || !target.layerId) return;

      const scaleX = target.scaleX || 1;
      const scaleY = target.scaleY || 1;
      const newWidth = Math.round((target.width || 100) * scaleX);
      const newHeight = Math.round((target.height || 100) * scaleY);

      const targetLayer = layersRef.current.find((l) => l.id === target.layerId);

      if (target instanceof fabric.Group && targetLayer?.layerType === "TEXT") {
        target.set({
          width: newWidth,
          height: newHeight,
          scaleX: 1,
          scaleY: 1,
        });

        const childObjs = target.getObjects();
        const frameRect = childObjs[0] as fabric.Rect;
        const textObj = childObjs[1] as fabric.Text;

        if (frameRect) {
          frameRect.set({
            width: newWidth,
            height: newHeight,
            scaleX: 1,
            scaleY: 1,
          });
        }

        if (textObj) {
          const props = targetLayer?.properties || {};
          const isAutoFit = props.autoFit !== false;
          const baseFontSize = Number(props.fontSize) || 36;
          const fontFamily = props.fontFamily || "Roboto";
          const textStr = textObj.text || targetLayer?.name || "";
          const hAlign = props.align || "center";
          const vAlign = props.verticalAlign || "middle";

          const fitFontSize = getFitFontSize(textStr, fontFamily, baseFontSize, newWidth, isAutoFit);

          let textX = 0;
          let textY = 0;

          if (!textObj.path) {
            if (hAlign === "left") textX = -newWidth / 2;
            else if (hAlign === "right") textX = newWidth / 2;

            if (vAlign === "top") textY = -newHeight / 2;
            else if (vAlign === "bottom") textY = newHeight / 2;
          }

          textObj.set({
            left: textX,
            top: textY,
            fontSize: fitFontSize,
            scaleX: 1,
            scaleY: 1,
          });
        }

        target.setCoords();
      }
    };

      // Handle Object Modifications (Move, Scale, Rotate)
      const handleObjectModified = (e: any) => {
        const target = e.target;
        if (!target) return;

        if (target instanceof fabric.ActiveSelection) {
          isUpdatingFromFabricRef.current = true;
          const groupObjects = target.getObjects();
          groupObjects.forEach((obj: any) => {
            if (!obj.layerId) return;
            const matrix = obj.calcTransformMatrix();
            const options = fabric.util.qrDecompose(matrix);

            const newW = Math.round((obj.width || 100) * (obj.scaleX || 1));
            const newH = Math.round((obj.height || 100) * (obj.scaleY || 1));
            const newX = Math.round(options.translateX - newW / 2);
            const newY = Math.round(options.translateY - newH / 2);

            onUpdateLayer(obj.layerId, {
              posX: newX,
              posY: newY,
            });
          });

          setTimeout(() => {
            isUpdatingFromFabricRef.current = false;
          }, 50);
          return;
        }

        if (!target.layerId) return;

        isUpdatingFromFabricRef.current = true;
        const layerId = target.layerId;
        const scaleX = target.scaleX || 1;
        const scaleY = target.scaleY || 1;

        let newWidth = 0;
        let newHeight = 0;

        if (target instanceof fabric.Path) {
          const pathW = target.width || 100;
          const pathH = target.height || 100;
          newWidth = Math.max(10, Math.round(pathW * scaleX));
          newHeight = Math.max(10, Math.round(pathH * scaleY));
        } else if (target instanceof fabric.Image) {
          const nativeW = target.getElement()?.width || target.width || 100;
          const nativeH = target.getElement()?.height || target.height || 100;
          newWidth = Math.max(10, Math.round(nativeW * scaleX));
          newHeight = Math.max(10, Math.round(nativeH * scaleY));
        } else {
          newWidth = Math.max(10, Math.round((target.width || 100) * scaleX));
          newHeight = Math.max(10, Math.round((target.height || 100) * scaleY));
        }

        const newPosX = Math.round((target.left || 0) - newWidth / 2);
        const newPosY = Math.round((target.top || 0) - newHeight / 2);
        const newRotation = Math.round(target.angle || 0);

        // Reset object scale back to 1.0 so scale does not accumulate on top of width/height
        target.set({
          scaleX: 1,
          scaleY: 1,
        });
        target.setCoords();

        if (onUpdateLayerRef.current) {
          onUpdateLayerRef.current(layerId, {
            posX: newPosX,
            posY: newPosY,
            width: newWidth,
            height: newHeight,
            rotation: newRotation,
          });
        }

        setTimeout(() => {
          isUpdatingFromFabricRef.current = false;
        }, 50);
      };

      // Handle Selection Events
      const handleSelectionCreated = (e: any) => {
        if (isUpdatingFromFabricRef.current) return;
        const selected = e.selected || [];
        const selectedIds = selected.map((o: any) => o.layerId).filter(Boolean);

        if (selectedIds.length > 0) {
          if (selectedIds.length === 1) {
            const isMultiKey = e.e ? Boolean(e.e.ctrlKey || e.e.metaKey) : false;
            onSelectLayer(selectedIds[0], isMultiKey);
          } else {
            selectedIds.forEach((id) => onSelectLayer(id, true));
          }
        }
      };

      const handleSelectionCleared = () => {
        if (isUpdatingFromFabricRef.current) return;
        onSelectLayer(null);
      };

      // Handle Live Drag/Scale Transformations (Realtime 60fps Fabric rendering & dynamic clipPath sync)
      const handleLiveTransform = (e: any) => {
        const target = e.target;
        if (!target || !target.layerId) return;

        const targetLayer = layersRef.current.find((l) => l.id === target.layerId);
        if (!targetLayer) return;

        if (targetLayer.layerType === "MASK") {
          const scaleX = target.scaleX || 1;
          const scaleY = target.scaleY || 1;

          let newW = 0;
          let newH = 0;

          if (target instanceof fabric.Path) {
            const pathW = target.width || 100;
            const pathH = target.height || 100;
            newW = Math.max(10, Math.round(pathW * scaleX));
            newH = Math.max(10, Math.round(pathH * scaleY));
          } else if (target instanceof fabric.Image) {
            const nativeW = (target as any).getElement?.()?.width || target.width || 100;
            const nativeH = (target as any).getElement?.()?.height || target.height || 100;
            newW = Math.max(10, Math.round(nativeW * scaleX));
            newH = Math.max(10, Math.round(nativeH * scaleY));
          } else {
            newW = Math.max(10, Math.round((target.width || 100) * scaleX));
            newH = Math.max(10, Math.round((target.height || 100) * scaleY));
          }

          const newCenterX = Math.round(target.left || 0);
          const newCenterY = Math.round(target.top || 0);

          // Find linked Photo Upload object on canvas
          const photoObj = fabricCanvas.getObjects().find((o: any) => {
            if (!o.layerId) return false;
            const l = layersRef.current.find((item) => item.id === o.layerId);
            return l && (l.maskLayerId === targetLayer.id || l.id === targetLayer.parentPhotoUploadId);
          });

          if (photoObj) {
            const mProps = targetLayer.properties || {};
            const mShape = mProps.maskShape || "RECTANGLE";

            if (mShape === "CUSTOM" && mProps.maskAssetUrl && customMaskCache.has(mProps.maskAssetUrl)) {
              const maskCanvas = customMaskCache.get(mProps.maskAssetUrl)!;
              const rawImgEl = (photoObj as any)._rawImageElement || (photoObj as any)._element;

              if (rawImgEl) {
                const photoW = photoObj.width * photoObj.scaleX;
                const photoH = photoObj.height * photoObj.scaleY;
                const photoLeft = photoObj.left || 0;
                const photoTop = photoObj.top || 0;

                const photoPosX = photoLeft - photoW / 2;
                const photoPosY = photoTop - photoH / 2;

                const maskPosX = newCenterX - newW / 2;
                const maskPosY = newCenterY - newH / 2;

                const maskRelX = maskPosX - photoPosX;
                const maskRelY = maskPosY - photoPosY;

                const clippedCanvas = renderClippedPhotoCanvas(rawImgEl, maskCanvas, photoW, photoH, maskRelX, maskRelY, newW, newH);
                photoObj.setElement(clippedCanvas);
                photoObj.set({
                  scaleX: photoW / clippedCanvas.width,
                  scaleY: photoH / clippedCanvas.height,
                  clipPath: undefined,
                });
                (photoObj as any)._isClippedCanvas = true;
                photoObj.setCoords();
                fabricCanvas.requestRenderAll();
              }
            } else {
              photoObj.clipPath = createFabricMaskObject(
                mShape,
                newW,
                newH,
                newCenterX,
                newCenterY,
                {
                  borderRadius: mProps.borderRadius || 16,
                  maskAssetUrl: mProps.maskAssetUrl,
                  originX: "center",
                  originY: "center",
                  absolutePositioned: true,
                  strokeWidth: 0,
                  stroke: undefined,
                  fill: "#000000",
                }
              );
              photoObj.dirty = true;
              fabricCanvas.requestRenderAll();
            }
          }
        } else if (targetLayer.layerType === "PHOTO_UPLOAD") {
          // USER IS DRAGGING / SCALING PHOTO UPLOAD LAYER: Keep Mask shape window stationary on stage!
          const photoW = target.width * (target.scaleX || 1);
          const photoH = target.height * (target.scaleY || 1);
          const photoLeft = target.left || 0;
          const photoTop = target.top || 0;

          const photoPosX = photoLeft - photoW / 2;
          const photoPosY = photoTop - photoH / 2;

          const linkedMaskLayer = layersRef.current.find(
            (l) => l.id === targetLayer.maskLayerId || (l.layerType === "MASK" && l.parentPhotoUploadId === targetLayer.id)
          );

          if (linkedMaskLayer && linkedMaskLayer.isVisible) {
            const mProps = linkedMaskLayer.properties || {};
            const mShape = mProps.maskShape || "RECTANGLE";

            const maskObj = fabricCanvas.getObjects().find((o: any) => o.layerId === linkedMaskLayer.id);

            const maskCenterX = maskObj ? maskObj.left || 0 : linkedMaskLayer.posX + linkedMaskLayer.width / 2;
            const maskCenterY = maskObj ? maskObj.top || 0 : linkedMaskLayer.posY + linkedMaskLayer.height / 2;
            const maskW = maskObj ? (maskObj.width || linkedMaskLayer.width) * (maskObj.scaleX || 1) : linkedMaskLayer.width;
            const maskH = maskObj ? (maskObj.height || linkedMaskLayer.height) * (maskObj.scaleY || 1) : linkedMaskLayer.height;

            const maskPosX = maskCenterX - maskW / 2;
            const maskPosY = maskCenterY - maskH / 2;

            const maskRelX = maskPosX - photoPosX;
            const maskRelY = maskPosY - photoPosY;

            if (mShape === "CUSTOM" && mProps.maskAssetUrl && customMaskCache.has(mProps.maskAssetUrl)) {
              const maskCanvas = customMaskCache.get(mProps.maskAssetUrl)!;
              const rawImgEl = (target as any)._rawImageElement || (target as any)._element;

              if (rawImgEl) {
                const clippedCanvas = renderClippedPhotoCanvas(rawImgEl, maskCanvas, photoW, photoH, maskRelX, maskRelY, maskW, maskH);
                target.setElement(clippedCanvas);
                target.set({
                  scaleX: photoW / clippedCanvas.width,
                  scaleY: photoH / clippedCanvas.height,
                  clipPath: undefined,
                });
                (target as any)._isClippedCanvas = true;
                target.setCoords();
                fabricCanvas.requestRenderAll();
              }
            } else {
              target.clipPath = createFabricMaskObject(
                mShape,
                maskW,
                maskH,
                maskCenterX,
                maskCenterY,
                {
                  borderRadius: mProps.borderRadius || 16,
                  maskAssetUrl: mProps.maskAssetUrl,
                  originX: "center",
                  originY: "center",
                  absolutePositioned: true,
                  strokeWidth: 0,
                  stroke: undefined,
                  fill: "#000000",
                }
              );
              target.dirty = true;
              fabricCanvas.requestRenderAll();
            }
          }
        }

        handleObjectScaling(e);
      };

    fabricCanvas.on("object:moving", handleLiveTransform);
    fabricCanvas.on("object:scaling", (e: any) => {
      handleLiveTransform(e);
      handleObjectScaling(e);
    });
    fabricCanvas.on("object:modified", handleObjectModified);
    fabricCanvas.on("selection:created", handleSelectionCreated);
    fabricCanvas.on("selection:updated", handleSelectionCreated);
    fabricCanvas.on("selection:cleared", handleSelectionCleared);

    return () => {
      fabricCanvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [widthPx, heightPx]);

  // Trigger immediate Fabric canvas re-render whenever dynamic web fonts finish downloading
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;

    const handleFontReady = () => {
      const fc = fabricCanvasRef.current;
      if (fc) {
        fc.getObjects().forEach((obj) => {
          if (obj instanceof fabric.Group) {
            obj.getObjects().forEach((child) => {
              if (child instanceof fabric.Text) {
                child.initDimensions();
              }
            });
          } else if (obj instanceof fabric.Text) {
            obj.initDimensions();
          }
        });
        fc.requestRenderAll();
      }
    };

    document.fonts.ready.then(handleFontReady).catch(() => {});
    document.fonts.addEventListener("loadingdone", handleFontReady);
    return () => {
      document.fonts.removeEventListener("loadingdone", handleFontReady);
    };
  }, []);

  // Synchronize React Layer State ➔ Fabric.js Objects
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    isUpdatingFromFabricRef.current = true;

    // Preload any custom mask images that are not yet in cache
    layers.forEach((l) => {
      if (l.isVisible && l.properties?.maskShape === "CUSTOM" && l.properties?.maskAssetUrl) {
        const url = l.properties.maskAssetUrl;
        if (!customMaskCache.has(url)) {
          preloadCustomMaskImage(url, () => {
            setMaskCacheVersion((v) => v + 1);
          });
        }
      }
    });

    fc.setDimensions({ width: widthPx, height: heightPx });

    // Filter visible layers sorted by Z-Index
    const visibleLayers = [...layers]
      .filter((l) => l.isVisible)
      .sort((a, b) => a.zIndex - b.zIndex);

    // Existing objects map by layerId
    const existingObjs = new Map<string, fabric.Object>();
    fc.getObjects().forEach((obj: any) => {
      if (obj.layerId) existingObjs.set(obj.layerId, obj);
    });

    const activeObjects: fabric.Object[] = [];

    visibleLayers.forEach((layer) => {
      let obj = existingObjs.get(layer.id);
      const props = layer.properties || {};

      let renderPosX = layer.posX;
      let renderPosY = layer.posY;
      let renderWidth = layer.width;
      let renderHeight = layer.height;
      let renderRotation = layer.rotation || 0;

      if (layer.linkedFieldId) {
        const linkedF = (fields || []).find((f) => f.id === layer.linkedFieldId);
        if (linkedF) {
          const config = linkedF.config || {};
          const opts = config.options || [];
          const activeOpt = opts.find((o: any) => o.id === linkedF.activeOptionId) || opts[0];
          if (activeOpt && activeOpt.isVisible !== false) {
            if (activeOpt.posX !== undefined) renderPosX = activeOpt.posX;
            if (activeOpt.posY !== undefined) renderPosY = activeOpt.posY;
            if (activeOpt.width !== undefined) renderWidth = activeOpt.width;
            if (activeOpt.height !== undefined) renderHeight = activeOpt.height;
            if (activeOpt.rotation !== undefined) renderRotation = activeOpt.rotation;
          }
        }
      }

      const centerX = renderPosX + renderWidth / 2;
      const centerY = renderPosY + renderHeight / 2;

      if (layer.layerType === "TEXT") {
        const rawTextStr = props.text !== undefined ? props.text : layer.name;
        let textStr = applyTextCase(rawTextStr, props.textCase);

        const font = props.fontFamily || "Roboto";
        const fontWeight = props.fontWeight || "normal";
        const baseFontSize = Number(props.fontSize) || 36;
        const isAutoFit = Boolean((props.autoFit !== false) && !props.allowMultiline);
        const fontSize = getFitFontSize(textStr, font, baseFontSize, renderWidth, isAutoFit, fontWeight);

        const maxLinesLimit = props.allowMultiline && props.maxLines && Number(props.maxLines) > 0 ? Number(props.maxLines) : 0;
        if (maxLinesLimit > 0) {
          // 1. Truncate hard line breaks if any
          const hardLines = textStr.split("\n");
          if (hardLines.length > maxLinesLimit) {
            textStr = hardLines.slice(0, maxLinesLimit).join("\n");
          }

          // 2. Truncate soft word-wrapped lines inside layer width
          try {
            const tempTb = new fabric.Textbox(textStr, {
              width: layer.width,
              fontFamily: font,
              fontSize: fontSize,
              fontWeight: fontWeight,
              splitByGrapheme: false,
            });
            const softLines = tempTb._textLines || [];
            if (softLines.length > maxLinesLimit) {
              const truncated: string[] = [];
              for (let i = 0; i < maxLinesLimit; i++) {
                const lineData = softLines[i];
                const lineStr = Array.isArray(lineData) ? lineData.join("") : String(lineData || "");
                truncated.push(lineStr.trim());
              }
              textStr = truncated.join("\n");
            }
          } catch (err) {
            // Ignore error
          }
        }
        const opacity = props.opacity !== undefined ? Number(props.opacity) : 1;
        const strokeWidth = Number(props.strokeWidth) || 0;
        const curveAngle = Number(props.curveAngle) || 0;
        const hAlign = props.align || "center";
        const vAlign = props.verticalAlign || "middle";

        // Ensure font is loaded into browser memory and update font and alignment in-place
        ensureFontLoaded(font, fonts).then((loaded) => {
          if (loaded && fc) {
            document.fonts.ready.then(() => {
              const freshFontSize = getFitFontSize(textStr, font, baseFontSize, layer.width, isAutoFit, fontWeight);
              const groupObj = fc.getObjects().find((o: any) => o.layerId === layer.id);
              if (groupObj && groupObj instanceof fabric.Group) {
                groupObj.pathOffset = new fabric.Point(0, 0);
                groupObj.width = layer.width;
                groupObj.height = layer.height;

                const [frameRect, textChild] = groupObj.getObjects() as [fabric.Rect, fabric.Text];
                if (frameRect) {
                  frameRect.set({ left: 0, top: 0, originX: "center", originY: "center" });
                }
                if (textChild) {
                  textChild.set({
                    fontFamily: font,
                    fontSize: freshFontSize,
                    textAlign: curvePath ? "left" : hAlign,
                    dirty: true,
                  });
                  textChild.initDimensions();

                  const measuredW = textChild.width || 0;
                  const measuredH = textChild.height || 0;

                  let textX = 0;
                  let textY = 0;

                  if (!curvePath) {
                    if (hAlign === "left") textX = -layer.width / 2 + measuredW / 2;
                    else if (hAlign === "right") textX = layer.width / 2 - measuredW / 2;
                    else textX = 0;

                    if (vAlign === "top") textY = -layer.height / 2 + measuredH / 2;
                    else if (vAlign === "bottom") textY = layer.height / 2 - measuredH / 2;
                    else textY = 0;
                  } else {
                    const angleDeg = Math.max(-360, Math.min(360, curveAngle));
                    const isSmile = angleDeg < 0;
                    const effectiveFontHeight = Math.min(freshFontSize * 0.85, layer.height * 0.7);
                    textX = 0;
                    textY = isSmile ? -effectiveFontHeight * 0.25 : effectiveFontHeight * 0.25;
                  }

                  textChild.set({
                    left: textX,
                    top: textY,
                    originX: "center",
                    originY: "center",
                    dirty: true,
                  });
                }
                groupObj.set({ dirty: true });
              }
              fc.requestRenderAll();
            });
          }
        }).catch(() => {});

        // Shadow configuration
        let shadowObj: fabric.Shadow | undefined = undefined;
        if ((props.shadowBlur || 0) > 0 || (props.shadowOffsetX || 0) !== 0 || (props.shadowOffsetY || 0) !== 0) {
          shadowObj = new fabric.Shadow({
            color: props.shadowColor || "rgba(0,0,0,0.5)",
            blur: Number(props.shadowBlur) || 0,
            offsetX: Number(props.shadowOffsetX) || 0,
            offsetY: Number(props.shadowOffsetY) || 0,
          });
        }

        // Fill color or gradient
        let fillStyle: any = props.color || "#1e293b";
        if (props.colorMode === "GRADIENT") {
          fillStyle = new fabric.Gradient({
            type: "linear",
            coords: { x1: 0, y1: 0, x2: layer.width, y2: 0 },
            colorStops: [
              { offset: 0, color: props.gradientColor1 || "#3b82f6" },
              { offset: 1, color: props.gradientColor2 || "#ec4899" },
            ],
          });
        }

        const curvePath = createFabricCurvePath(layer.width, layer.height, curveAngle, fontSize);
        let pathStartOffset = 0;

        if (curvePath && textStr) {
          try {
            const segmentsInfo = fabric.util.getPathSegmentsInfo(curvePath.path);
            const exactPathLength = segmentsInfo && segmentsInfo.length > 0
              ? segmentsInfo[segmentsInfo.length - 1].length
              : layer.width;

            const textObjTemp = new fabric.Text(textStr, {
              fontFamily: font,
              fontSize: fontSize,
            });
            const actualTextWidth = textObjTemp.width || 0;

            if (hAlign === "center") {
              pathStartOffset = Math.max(0, (exactPathLength - actualTextWidth) / 2);
            } else if (hAlign === "right") {
              pathStartOffset = Math.max(0, exactPathLength - actualTextWidth);
            } else {
              pathStartOffset = 0;
            }
          } catch (e) {
            pathStartOffset = 0;
          }
        }

        const isTextSelected = selectedLayerIds.includes(layer.id) || selectedLayerId === layer.id;

        const frameRect = new fabric.Rect({
          left: 0,
          top: 0,
          width: renderWidth,
          height: renderHeight,
          fill: "rgba(0, 0, 0, 0.001)",
          stroke: isTextSelected ? "rgba(79, 70, 229, 0.45)" : "transparent",
          strokeWidth: isTextSelected ? 1 : 0,
          strokeDashArray: isTextSelected ? [4, 4] : undefined,
          originX: "center",
          originY: "center",
        });

        // Measure actual text bounding box for exact alignment math inside group
        const tempTextObj = new fabric.Text(textStr, {
          fontFamily: font,
          fontSize: fontSize,
          fontWeight: fontWeight,
          strokeWidth: strokeWidth,
        });
        const measuredW = tempTextObj.width || 0;
        const measuredH = tempTextObj.height || 0;

        let textX = 0;
        let textY = 0;

        if (!curvePath) {
          if (hAlign === "left") textX = -renderWidth / 2 + measuredW / 2;
          else if (hAlign === "right") textX = renderWidth / 2 - measuredW / 2;
          else textX = 0;

          if (vAlign === "top") textY = -renderHeight / 2 + measuredH / 2;
          else if (vAlign === "bottom") textY = renderHeight / 2 - measuredH / 2;
          else textY = 0;
        } else {
          const angleDeg = Math.max(-360, Math.min(360, curveAngle));
          const isSmile = angleDeg < 0;
          const effectiveFontHeight = Math.min(fontSize * 0.85, renderHeight * 0.7);
          textX = 0;
          // Apply explicit vertical matrix offset to center character caps/descenders inside frame box
          textY = isSmile ? -effectiveFontHeight * 0.25 : effectiveFontHeight * 0.25;
        }

        const isMultilineTextbox = Boolean(props.allowMultiline && !curvePath);

        const textOptions: any = {
          left: textX,
          top: textY,
          originX: "center",
          originY: "center",
          fontFamily: font,
          fontWeight: fontWeight,
          fontSize: fontSize,
          fill: fillStyle,
          textAlign: curvePath ? "left" : hAlign,
          stroke: strokeWidth > 0 ? (props.strokeColor || "#000000") : undefined,
          strokeWidth: strokeWidth,
          opacity: opacity,
          shadow: shadowObj,
          path: curvePath || undefined,
          pathStartOffset: curvePath ? pathStartOffset : 0,
          splitByGrapheme: false,
          objectCaching: false,
          dirty: true,
        };

        const textObj = isMultilineTextbox
          ? new fabric.Textbox(textStr, { ...textOptions, width: renderWidth })
          : new fabric.Text(textStr, textOptions);

        if (obj) {
          fc.remove(obj);
          obj = undefined;
        }

        frameRect.set({ left: 0, top: 0, originX: "center", originY: "center" });
        textObj.set({ left: textX, top: textY, originX: "center", originY: "center" });

        obj = new fabric.Group([frameRect, textObj], {
          left: centerX,
          top: centerY,
          originX: "center",
          originY: "center",
          angle: renderRotation,
          width: renderWidth,
          height: renderHeight,
          selectable: !layer.isLocked,
          evented: !layer.isLocked,
          subTargetCheck: false,
          objectCaching: false,
          dirty: true,
        });

        obj.pathOffset = new fabric.Point(0, 0);
        obj.width = renderWidth;
        obj.height = renderHeight;

        frameRect.set({ left: 0, top: 0, originX: "center", originY: "center" });
        textObj.set({ left: textX, top: textY, originX: "center", originY: "center" });

        (obj as any).layerId = layer.id;
        fc.add(obj);
      } else if (layer.layerType === "WORD_SEARCH_PUZZLE") {
        // Generate word search matrix using wordSearchEngine
        const rawWords: string[] = props.words && Array.isArray(props.words) && props.words.length > 0
          ? props.words
          : ["SIMON", "LISA", "JANE", "HAPPY", "URI", "RONALDO", "MESSI"];

        const gridW = props.gridWidth || 10;
        const gridH = props.gridHeight || 10;
        const seed = props.seed || 12345;
        const allowDiag = props.allowDiagonal !== false;
        const allowRev = props.allowReverse === true && props.explicitReverse === true; // Enforce strict default FALSE for all layers
        const highlightColor = props.highlightColor || props.ovalColor || "#FD005D";
        const fontFam =
          props.gridFontFamily ||
          props.fontFamily ||
          (layer as any).fontFamily ||
          "Roboto";

        // Asynchronously load custom font file if needed
        ensureFontLoaded(fontFam, fonts).then(() => {
          if (fc) fc.requestRenderAll();
        }).catch(() => {});

        const textColor =
          props.gridTextColor ||
          props.color ||
          props.fill ||
          (layer as any).color ||
          (layer as any).fill ||
          "#1E293B";

        const fontWeight = props.fontWeight || (layer as any).fontWeight || "bold";
        const fontStyle = props.fontStyle || (layer as any).fontStyle || "normal";
        const textTransform = props.textTransform || props.wordStyle || "UPPERCASE";

        const density = props.overlapDensity || "BALANCED";

        const puzzleResult = generateWordSearchPuzzle({
          words: rawWords,
          gridWidth: gridW,
          gridHeight: gridH,
          allowDiagonal: allowDiag,
          allowReverse: allowRev,
          seed: seed,
          overlapDensity: density as any,
        });

        const { grid, placedWords } = puzzleResult;

        // Auto-fit cell dimensions to fill layer frame bounds (width x height)
        const cellW = renderWidth / gridW;
        const cellH = renderHeight / gridH;
        const autoFontSize = Math.min(cellW, cellH) * 0.55;
        const rawFontSize = Number(props.fontSize || props.gridFontSize || (layer as any).fontSize);
        const actualFontSize = rawFontSize && rawFontSize > 0 ? rawFontSize : Math.max(10, Math.round(autoFontSize));

        const puzzleTotalW = renderWidth;
        const puzzleTotalH = renderHeight;

        const startGridX = -puzzleTotalW / 2 + cellW / 2;
        const startGridY = -puzzleTotalH / 2 + cellH / 2;

        const groupObjects: fabric.Object[] = [];

        // 1. Selection Frame Dashed Rect
        const isSelected = selectedLayerIds.includes(layer.id) || selectedLayerId === layer.id;
        const frameRect = new fabric.Rect({
          left: 0,
          top: 0,
          width: renderWidth,
          height: renderHeight,
          fill: "transparent",
          stroke: isSelected ? "#3b82f6" : "transparent",
          strokeWidth: isSelected ? 1 : 0,
          strokeDashArray: isSelected ? [4, 4] : undefined,
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
        });
        groupObjects.push(frameRect);

        function hexToRgba(hex: string, alpha: number): string {
          if (alpha === 0) return "rgba(0, 0, 0, 0)";
          let c = (hex || "#FD005D").replace("#", "");
          if (c.length === 3) c = c.split("").map((char) => char + char).join("");
          const num = parseInt(c, 16);
          if (isNaN(num)) return `rgba(253, 0, 93, ${alpha})`;
          const r = (num >> 16) & 255;
          const g = (num >> 8) & 255;
          const b = num & 255;
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        const showHighlights = props.showHighlights === undefined ? true : Boolean(props.showHighlights);
        const activeHighlightColor = props.highlightColor || props.ovalColor || "#FD005D";
        const strokeWidth = Number(props.highlightLineWidth) || 4;

        const isTransparentFill = props.transparentHighlightFill === true;
        const rawFillColor = props.highlightFillColor || activeHighlightColor;
        const fillOpacity = isTransparentFill ? 0 : props.highlightFillOpacity !== undefined ? Number(props.highlightFillOpacity) : 0.22;
        const capsuleFill = hexToRgba(rawFillColor, fillOpacity);

        if (showHighlights && placedWords.length > 0) {
          placedWords.forEach((pw) => {
            const x1 = startGridX + pw.startX * cellW;
            const y1 = startGridY + pw.startY * cellH;
            const x2 = startGridX + pw.endX * cellW;
            const y2 = startGridY + pw.endY * cellH;

            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            const angleRad = Math.atan2(dy, dx);
            const angleDeg = (angleRad * 180) / Math.PI;

            const capsuleCenterX = (x1 + x2) / 2;
            const capsuleCenterY = (y1 + y2) / 2;

            const pillLength = Math.max(len + cellW * 0.85, cellW * 1.2);
            const pillHeight = Math.max(Math.min(cellW, cellH) * 0.85, 20);

            const capsuleObj = new fabric.Rect({
              left: capsuleCenterX,
              top: capsuleCenterY,
              width: pillLength,
              height: pillHeight,
              rx: pillHeight / 2,
              ry: pillHeight / 2,
              fill: capsuleFill,
              stroke: activeHighlightColor,
              strokeWidth: strokeWidth,
              opacity: 1,
              originX: "center",
              originY: "center",
              angle: angleDeg,
              selectable: false,
              evented: false,
            });
            groupObjects.push(capsuleObj);
          });
        }

        // Build target cell coordinates set for custom word text color
        const targetCellSet = new Set<string>();
        if (placedWords && placedWords.length > 0) {
          placedWords.forEach((pw) => {
            const dx = pw.endX === pw.startX ? 0 : pw.endX > pw.startX ? 1 : -1;
            const dy = pw.endY === pw.startY ? 0 : pw.endY > pw.startY ? 1 : -1;
            const steps = Math.max(Math.abs(pw.endX - pw.startX), Math.abs(pw.endY - pw.startY)) + 1;

            for (let s = 0; s < steps; s++) {
              const rx = pw.startX + s * dx;
              const ry = pw.startY + s * dy;
              targetCellSet.add(`${ry}_${rx}`);
            }
          });
        }

        const fillerTextColor =
          props.gridTextColor ||
          props.color ||
          props.fill ||
          (layer as any).color ||
          (layer as any).fill ||
          "#1E293B";

        const wordTextColor =
          props.wordTextColor ||
          props.highlightTextColor ||
          fillerTextColor;

        // 3. Render Letter Matrix ON TOP of Highlights
        for (let r = 0; r < grid.length; r++) {
          for (let c = 0; c < grid[r].length; c++) {
            let letter = grid[r][c];
            if (textTransform === "LOWERCASE") {
              letter = letter.toLowerCase();
            } else if (textTransform === "UPPERCASE") {
              letter = letter.toUpperCase();
            }

            const isTargetLetter = targetCellSet.has(`${r}_${c}`);
            const letterColor = isTargetLetter ? wordTextColor : fillerTextColor;
            const isWhiteText = letterColor.toUpperCase() === "#FFFFFF" || letterColor.toUpperCase() === "FFF";

            const cx = startGridX + c * cellW;
            const cy = startGridY + r * cellH;

            const letterText = new fabric.Text(letter, {
              left: cx,
              top: cy,
              originX: "center",
              originY: "center",
              fontFamily: fontFam,
              fontSize: actualFontSize,
              fontWeight: fontWeight as any,
              fontStyle: fontStyle as any,
              fill: letterColor,
              stroke: isWhiteText ? "#1E293B" : undefined,
              strokeWidth: isWhiteText ? 0.8 : 0,
              selectable: false,
              evented: false,
            });
            groupObjects.push(letterText);
          }
        }

        let puzzleGroup = fc.getObjects().find((o: any) => o.layerId === layer.id) as fabric.Group;
        if (puzzleGroup) {
          fc.remove(puzzleGroup);
        }

        puzzleGroup = new fabric.Group(groupObjects, {
          left: centerX,
          top: centerY,
          originX: "center",
          originY: "center",
          angle: layer.rotation,
          width: layer.width,
          height: layer.height,
          selectable: !layer.isLocked,
          evented: !layer.isLocked,
          subTargetCheck: false,
          objectCaching: false,
          dirty: true,
        });

        puzzleGroup.pathOffset = new fabric.Point(0, 0);
        puzzleGroup.width = layer.width;
        puzzleGroup.height = layer.height;
        (puzzleGroup as any).layerId = layer.id;

        fc.add(puzzleGroup);
        obj = puzzleGroup;
      } else if (layer.layerType === "DOODLE_ALPHABET") {
        const doodlePackId = props.doodlePackId;
        const targetPack = doodlePacks?.find((p: any) => p.id === doodlePackId) || doodlePacks?.[0];
        const inputText = (props.text || "AUNTIE").trim();
        const rule = props.styleSelectionRule || "RANDOM_SHUFFLE";
        const fixedStyleId = props.fixedStyleId || "";
        const seed = Number(props.seed) || 12345;
        const letterSpacing = Number(props.letterSpacing) || 4;
        const maxLetterHeight = Number(props.maxLetterHeight) || 120;
        const autoFitContainer = props.autoFitContainer !== false;
        const align = props.align || "center";
        const isSelected = selectedLayerIds.includes(layer.id) || selectedLayerId === layer.id;

        const currentFingerprint = `${layer.id}_${doodlePackId}_${inputText}_${rule}_${fixedStyleId}_${seed}_${letterSpacing}_${maxLetterHeight}_${autoFitContainer}_${align}_${renderWidth}_${renderHeight}_${layer.rotation}_${isSelected}`;

        let existingDoodleGroup = fc.getObjects().find((o: any) => o.layerId === layer.id) as any;

        if (existingDoodleGroup && existingDoodleGroup._doodleFingerprint === currentFingerprint) {
          // FINGERPRINT UNCHANGED: Just update coordinates without recreating objects! NO FLICKER!
          existingDoodleGroup.set({
            left: centerX,
            top: centerY,
            angle: layer.rotation,
            selectable: !layer.isLocked,
            evented: !layer.isLocked,
          });
          existingDoodleGroup.setCoords();
          obj = existingDoodleGroup;
        } else {
          // Fingerprint changed or new layer: fetch images & build group
          const assignments = targetPack
            ? resolveDoodleStyleAssignments(inputText, targetPack, rule, fixedStyleId, seed)
            : [];

          const validLetters = assignments.filter((a) => a.imageUrl);

          if (validLetters.length === 0) {
            if (existingDoodleGroup) fc.remove(existingDoodleGroup);

            const fallbackText = new fabric.Text(inputText || "DOODLE", {
              left: centerX,
              top: centerY,
              originX: "center",
              originY: "center",
              fontSize: 42,
              fontFamily: "Arial",
              fontWeight: "bold",
              fill: "#9333ea",
              angle: layer.rotation,
            });
            (fallbackText as any).layerId = layer.id;
            (fallbackText as any)._doodleFingerprint = currentFingerprint;
            fc.add(fallbackText);
            obj = fallbackText;
          } else {
            Promise.all(
              assignments.map((item) => {
                if (!item.imageUrl) return Promise.resolve(null);
                return loadAndTrimImage(item.imageUrl).then((trimmedCanvas) => {
                  if (!trimmedCanvas) return null;
                  return new fabric.Image(trimmedCanvas);
                });
              })
            ).then((imgObjs) => {
              if (!fc) return;

              isUpdatingFromFabricRef.current = true;

              const groupObjects: fabric.Object[] = [];

              const frameRect = new fabric.Rect({
                left: 0,
                top: 0,
                width: renderWidth,
                height: renderHeight,
                fill: "transparent",
                stroke: isSelected ? "#9333ea" : "transparent",
                strokeWidth: isSelected ? 1 : 0,
                strokeDashArray: isSelected ? [4, 4] : undefined,
                originX: "center",
                originY: "center",
                selectable: false,
                evented: false,
              });
              groupObjects.push(frameRect);

              const baseMaxLetterH = renderHeight * 0.85;
              const letterMeta: { img: fabric.Image; w: number; h: number }[] = [];
              let rawTotalW = 0;

              imgObjs.forEach((img) => {
                if (!img) {
                  rawTotalW += baseMaxLetterH * 0.5 + letterSpacing;
                  return;
                }
                const origW = img.width || 100;
                const origH = img.height || 100;
                const scale = baseMaxLetterH / origH;
                const letterW = origW * scale;

                letterMeta.push({ img, w: letterW, h: baseMaxLetterH });
                rawTotalW += letterW + letterSpacing;
              });

              if (letterMeta.length > 0) rawTotalW -= letterSpacing;

              // Compute auto-fit scaling factor (Downscale ONLY when text overflows container width; NEVER upscale short words!)
              let fitScale = 1;
              if (autoFitContainer && rawTotalW > renderWidth) {
                fitScale = renderWidth / Math.max(1, rawTotalW);
              }

              const finalLetterSpacing = letterSpacing * fitScale;
              const finalMaxLetterH = baseMaxLetterH * fitScale;

              let finalTotalW = 0;
              imgObjs.forEach((img) => {
                if (!img) {
                  finalTotalW += finalMaxLetterH * 0.5 + finalLetterSpacing;
                  return;
                }
                const meta = letterMeta.find((m) => m.img === img);
                if (meta) {
                  meta.w = meta.w * fitScale;
                  meta.h = meta.h * fitScale;
                  const origH = img.height || 100;
                  img.scale(meta.h / origH);
                  finalTotalW += meta.w + finalLetterSpacing;
                }
              });

              if (letterMeta.length > 0) finalTotalW -= finalLetterSpacing;

              let startX = -finalTotalW / 2;
              if (align === "left") startX = -renderWidth / 2 + 10;
              else if (align === "right") startX = renderWidth / 2 - finalTotalW - 10;

              let currentX = startX;

              imgObjs.forEach((img) => {
                if (!img) {
                  currentX += finalMaxLetterH * 0.5 + finalLetterSpacing;
                  return;
                }
                const meta = letterMeta.find((m) => m.img === img);
                const w = meta?.w || 50;

                img.set({
                  left: currentX + w / 2,
                  top: 0,
                  originX: "center",
                  originY: "center",
                });
                groupObjects.push(img);
                currentX += w + finalLetterSpacing;
              });

              const oldGroup = fc.getObjects().find((o: any) => o.layerId === layer.id);
              if (oldGroup) fc.remove(oldGroup);

              const doodleGroup = new fabric.Group(groupObjects, {
                left: centerX,
                top: centerY,
                originX: "center",
                originY: "center",
                angle: layer.rotation,
                width: renderWidth,
                height: renderHeight,
                selectable: !layer.isLocked,
                evented: !layer.isLocked,
              });

              (doodleGroup as any).layerId = layer.id;
              (doodleGroup as any).layerType = "DOODLE_ALPHABET";
              (doodleGroup as any)._doodleFingerprint = currentFingerprint;

              fc.add(doodleGroup);

              if (isSelected) {
                fc.setActiveObject(doodleGroup);
              }

              fc.requestRenderAll();

              setTimeout(() => {
                isUpdatingFromFabricRef.current = false;
              }, 100);
            });
          }
        }
      } else if (layer.layerType === "MASK") {
        const maskShape = props.maskShape || "RECTANGLE";
        const isMaskSelected =
          selectedLayerIds.includes(layer.id) ||
          selectedLayerId === layer.id ||
          (layer.parentPhotoUploadId && (selectedLayerIds.includes(layer.parentPhotoUploadId) || selectedLayerId === layer.parentPhotoUploadId));
        let maskObj = fc.getObjects().find((o: any) => o.layerId === layer.id);

        if (
          maskObj &&
          ((maskObj as any).currentMaskShape !== maskShape ||
            (maskObj as any).currentMaskAssetUrl !== props.maskAssetUrl)
        ) {
          fc.remove(maskObj);
          maskObj = undefined;
        }

        if (maskObj) {
          if (maskObj instanceof fabric.Path) {
            const pathW = maskObj.width || 100;
            const pathH = maskObj.height || 100;
            maskObj.set({
              left: centerX,
              top: centerY,
              scaleX: layer.width / pathW,
              scaleY: layer.height / pathH,
              angle: layer.rotation,
              fill: isMaskSelected ? "rgba(168, 85, 247, 0.12)" : "transparent",
              stroke: isMaskSelected ? "#9333ea" : "transparent",
              strokeWidth: isMaskSelected ? 2 : 0,
              strokeDashArray: isMaskSelected ? [6, 4] : undefined,
              selectable: !layer.isLocked,
              evented: !layer.isLocked,
              dirty: true,
            });
          } else if (maskObj instanceof fabric.Image) {
            const nativeW = (maskObj as any).getElement?.()?.width || maskObj.width || 100;
            const nativeH = (maskObj as any).getElement?.()?.height || maskObj.height || 100;
            maskObj.set({
              left: centerX,
              top: centerY,
              scaleX: layer.width / nativeW,
              scaleY: layer.height / nativeH,
              angle: layer.rotation,
              selectable: !layer.isLocked,
              evented: !layer.isLocked,
            });
          } else {
            maskObj.set({
              left: centerX,
              top: centerY,
              width: layer.width,
              height: layer.height,
              scaleX: 1,
              scaleY: 1,
              angle: layer.rotation,
              fill: isMaskSelected ? "rgba(168, 85, 247, 0.12)" : "transparent",
              stroke: isMaskSelected ? "#9333ea" : "transparent",
              strokeWidth: isMaskSelected ? 2 : 0,
              strokeDashArray: isMaskSelected ? [6, 4] : undefined,
              selectable: !layer.isLocked,
              evented: !layer.isLocked,
              dirty: true,
            });
          }
          maskObj.setCoords();
          obj = maskObj;
        } else {
          const shapeObj = createFabricMaskObject(
            maskShape,
            layer.width,
            layer.height,
            centerX,
            centerY,
            {
              fill: isMaskSelected ? "rgba(168, 85, 247, 0.12)" : "transparent",
              stroke: isMaskSelected ? "#9333ea" : "transparent",
              strokeWidth: isMaskSelected ? 2 : 0,
              strokeDashArray: isMaskSelected ? [6, 4] : undefined,
              originX: "center",
              originY: "center",
              borderRadius: props.borderRadius || 16,
              maskAssetUrl: props.maskAssetUrl,
              selectable: !layer.isLocked,
              lockUniScaling: false,
              objectCaching: false,
              dirty: true,
            }
          );
          (shapeObj as any).layerId = layer.id;
          (shapeObj as any).currentMaskShape = maskShape;
          (shapeObj as any).currentMaskAssetUrl = props.maskAssetUrl;

          fc.add(shapeObj);
          obj = shapeObj;
        }
      } else if (
        layer.layerType === "ASSET" ||
        layer.layerType === "OVERLAY" ||
        layer.layerType === "PHOTO_UPLOAD"
      ) {
        let assetUrl = props.assetUrl;
        let opacity = props.opacity !== undefined ? Number(props.opacity) : 1;
        let renderPosX = layer.posX;
        let renderPosY = layer.posY;
        let renderWidth = layer.width;
        let renderHeight = layer.height;
        let renderRotation = layer.rotation;

        if (layer.linkedFieldId) {
          const linkedF = (fields || []).find((f) => f.id === layer.linkedFieldId);
          if (linkedF) {
            const config = linkedF.config || {};
            if (config.isConditionOnly) {
              assetUrl = "";
            } else {
              const opts = config.options || [];
              const activeOpt = opts.find((o: any) => o.id === linkedF.activeOptionId) || opts[0];
              if (activeOpt && activeOpt.isVisible !== false) {
                assetUrl = activeOpt.assetImageUrl || "";
                if (activeOpt.posX !== undefined) renderPosX = activeOpt.posX;
                if (activeOpt.posY !== undefined) renderPosY = activeOpt.posY;
                if (activeOpt.width !== undefined) renderWidth = activeOpt.width;
                if (activeOpt.height !== undefined) renderHeight = activeOpt.height;
                if (activeOpt.rotation !== undefined) renderRotation = activeOpt.rotation;
                if (activeOpt.opacity !== undefined) opacity = Number(activeOpt.opacity);
              } else {
                assetUrl = "";
              }
            }
          }
        }

        const centerX = renderPosX + renderWidth / 2;
        const centerY = renderPosY + renderHeight / 2;

        // Check if this PHOTO_UPLOAD layer has a linked child MASK layer
        const linkedMaskLayer = visibleLayers.find(
          (l) => l.id === layer.maskLayerId || (l.layerType === "MASK" && l.parentPhotoUploadId === layer.id)
        );

        let clipMask: fabric.Object | undefined = undefined;
        if (linkedMaskLayer && linkedMaskLayer.isVisible) {
          const mProps = linkedMaskLayer.properties || {};
          const mShape = mProps.maskShape || "RECTANGLE";

          const maskCenterX = linkedMaskLayer.posX + linkedMaskLayer.width / 2;
          const maskCenterY = linkedMaskLayer.posY + linkedMaskLayer.height / 2;

          clipMask = createFabricMaskObject(
            mShape,
            linkedMaskLayer.width,
            linkedMaskLayer.height,
            maskCenterX,
            maskCenterY,
            {
              borderRadius: mProps.borderRadius || 16,
              maskAssetUrl: mProps.maskAssetUrl,
              originX: "center",
              originY: "center",
              absolutePositioned: true,
              strokeWidth: 0,
              stroke: undefined,
              fill: "#000000",
            }
          );
        }

        if (assetUrl) {
          const mProps = linkedMaskLayer?.properties || {};
          const isCustomMask = linkedMaskLayer && linkedMaskLayer.isVisible && mProps?.maskShape === "CUSTOM" && mProps?.maskAssetUrl;
          const maskCanvas = isCustomMask && mProps.maskAssetUrl && customMaskCache.has(mProps.maskAssetUrl) ? customMaskCache.get(mProps.maskAssetUrl) : null;

          const photoW = layer.width;
          const photoH = layer.height;
          const maskW = linkedMaskLayer ? linkedMaskLayer.width : photoW;
          const maskH = linkedMaskLayer ? linkedMaskLayer.height : photoH;
          const maskRelX = linkedMaskLayer ? linkedMaskLayer.posX - layer.posX : 0;
          const maskRelY = linkedMaskLayer ? linkedMaskLayer.posY - layer.posY : 0;

          const existingImgObj = fc.getObjects().find(
            (o: any) => o.layerId === layer.id && o instanceof fabric.Image
          ) as fabric.Image | undefined;

          if (existingImgObj && (existingImgObj as any).assetUrl === assetUrl) {
            const rawImgEl = (existingImgObj as any)._rawImageElement || (existingImgObj as any)._element;
            let activeClipMask: fabric.Object | undefined = clipMask;
            let currentW = (existingImgObj as any).nativeWidth || 100;
            let currentH = (existingImgObj as any).nativeHeight || 100;

            if (isCustomMask && maskCanvas && rawImgEl) {
              const clippedCanvas = renderClippedPhotoCanvas(rawImgEl, maskCanvas, photoW, photoH, maskRelX, maskRelY, maskW, maskH);
              existingImgObj.setElement(clippedCanvas);
              (existingImgObj as any)._isClippedCanvas = true;
              activeClipMask = undefined;
              currentW = clippedCanvas.width || currentW;
              currentH = clippedCanvas.height || currentH;
            } else if (rawImgEl && (existingImgObj as any)._isClippedCanvas) {
              existingImgObj.setElement(rawImgEl);
              (existingImgObj as any)._isClippedCanvas = false;
            }

            const baseScaleX = renderWidth / currentW;
            const baseScaleY = renderHeight / currentH;

            existingImgObj.set({
              left: centerX,
              top: centerY,
              originX: "center",
              originY: "center",
              angle: renderRotation,
              scaleX: baseScaleX,
              scaleY: baseScaleY,
              opacity: opacity,
              selectable: !layer.isLocked,
              evented: !layer.isLocked,
              lockUniScaling: true,
              clipPath: activeClipMask,
              objectCaching: false,
              dirty: true,
            });
            existingImgObj.setControlsVisibility({
              mt: false,
              mb: false,
              ml: false,
              mr: false,
              tl: true,
              tr: true,
              bl: true,
              br: true,
              mtr: true,
            });
            existingImgObj.setCoords();
            obj = existingImgObj;
          } else {
            const imgEl = new Image();
            imgEl.crossOrigin = "anonymous";
            imgEl.src = assetUrl;
            imgEl.onerror = () => {
              console.error("❌ Failed to load canvas asset image:", assetUrl);
            };
            imgEl.onload = () => {
              if (!fc) return;
              const nativeW = imgEl.naturalWidth || imgEl.width || renderWidth;
              const nativeH = imgEl.naturalHeight || imgEl.height || renderHeight;

              const oldObj = fc.getObjects().find((o: any) => o.layerId === layer.id);
              if (oldObj) fc.remove(oldObj);

              // Fresh lookup at the exact MOMENT imgEl.onload executes (resolving async timing window)
              const currentLayers = layersRef.current || visibleLayers;
              const freshLinkedMaskLayer = currentLayers.find(
                (l) => l.id === layer.maskLayerId || (l.layerType === "MASK" && l.parentPhotoUploadId === layer.id)
              );
              const freshMProps = freshLinkedMaskLayer?.properties || {};
              const freshIsCustomMask =
                freshLinkedMaskLayer &&
                freshLinkedMaskLayer.isVisible &&
                freshMProps?.maskShape === "CUSTOM" &&
                freshMProps?.maskAssetUrl;
              const freshMaskCanvas =
                freshIsCustomMask && freshMProps.maskAssetUrl ? customMaskCache.get(freshMProps.maskAssetUrl) : null;

              const freshPhotoW = renderWidth;
              const freshPhotoH = renderHeight;
              const freshMaskW = freshLinkedMaskLayer ? freshLinkedMaskLayer.width : freshPhotoW;
              const freshMaskH = freshLinkedMaskLayer ? freshLinkedMaskLayer.height : freshPhotoH;
              const freshMaskRelX = freshLinkedMaskLayer ? freshLinkedMaskLayer.posX - renderPosX : 0;
              const freshMaskRelY = freshLinkedMaskLayer ? freshLinkedMaskLayer.posY - renderPosY : 0;

              let finalImageSource: HTMLImageElement | HTMLCanvasElement = imgEl;
              let activeClipMask: fabric.Object | undefined = clipMask;
              let currentW = nativeW;
              let currentH = nativeH;

              if (freshIsCustomMask && freshMaskCanvas) {
                const clippedCanvas = renderClippedPhotoCanvas(
                  imgEl,
                  freshMaskCanvas,
                  freshPhotoW,
                  freshPhotoH,
                  freshMaskRelX,
                  freshMaskRelY,
                  freshMaskW,
                  freshMaskH
                );
                finalImageSource = clippedCanvas;
                activeClipMask = undefined;
                currentW = clippedCanvas.width || nativeW;
                currentH = clippedCanvas.height || nativeH;
              }

              const baseScaleX = renderWidth / currentW;
              const baseScaleY = renderHeight / currentH;

              const fabricImg = new fabric.Image(finalImageSource, {
                left: centerX,
                top: centerY,
                originX: "center",
                originY: "center",
                angle: renderRotation,
                scaleX: baseScaleX,
                scaleY: baseScaleY,
                opacity: opacity,
                selectable: !layer.isLocked,
                evented: !layer.isLocked,
                lockUniScaling: true,
                clipPath: activeClipMask,
                objectCaching: false,
                dirty: true,
              });

              fabricImg.setControlsVisibility({
                mt: false,
                mb: false,
                ml: false,
                mr: false,
                tl: true,
                tr: true,
                bl: true,
                br: true,
                mtr: true,
              });

              (fabricImg as any).layerId = layer.id;
              (fabricImg as any).assetUrl = assetUrl;
              (fabricImg as any)._rawImageElement = imgEl;
              (fabricImg as any)._isClippedCanvas = Boolean(freshIsCustomMask && freshMaskCanvas);
              (fabricImg as any).nativeWidth = nativeW;
              (fabricImg as any).nativeHeight = nativeH;

              fc.add(fabricImg);
              if (selectedLayerId === layer.id) fc.setActiveObject(fabricImg);
              enforceZIndexOrder(fc, currentLayers);
            };
          }
        } else {
          // If this layer is a List container layer with no active graphic asset image, do NOT render any canvas placeholder frame!
          const isListContainerLayer = Boolean(layer.linkedFieldId || (fields && fields.some((f) => f.id === layer.linkedFieldId)));
          if (isListContainerLayer) {
            if (obj) fc.remove(obj);
          } else {
            // Placeholder Frame & Text for empty Image or Photo Upload Layer
            const isPhotoUpload = layer.layerType === "PHOTO_UPLOAD";
            const maskShape = props.maskShape || "RECTANGLE";

            const rx = maskShape === "CIRCLE" ? layer.width / 2 : maskShape === "ROUNDED" ? 16 : 0;
            const ry = maskShape === "CIRCLE" ? layer.height / 2 : maskShape === "ROUNDED" ? 16 : 0;

            if (obj) fc.remove(obj);

            const isPhotoSelected =
              selectedLayerIds.includes(layer.id) ||
              selectedLayerId === layer.id ||
              (layer.maskLayerId && (selectedLayerIds.includes(layer.maskLayerId) || selectedLayerId === layer.maskLayerId));

            const frameRect = new fabric.Rect({
              left: centerX,
              top: centerY,
              width: layer.width,
              height: layer.height,
              fill: isPhotoSelected
                ? isPhotoUpload
                  ? "rgba(254, 243, 199, 0.25)"
                  : "rgba(240, 253, 244, 0.5)"
                : "transparent",
              stroke: isPhotoSelected
                ? isPhotoUpload
                  ? "#d97706"
                  : "#059669"
                : "transparent",
              strokeWidth: isPhotoSelected ? (isPhotoUpload ? 2 : 1.5) : 0,
              strokeDashArray: isPhotoSelected ? (isPhotoUpload ? [8, 5] : [6, 6]) : undefined,
              originX: "center",
              originY: "center",
              angle: layer.rotation,
              rx,
              ry,
              selectable: !layer.isLocked,
              lockUniScaling: false,
              clipPath: clipMask,
              subTargetCheck: false,
              objectCaching: false,
              dirty: true,
            });
            (frameRect as any).layerId = layer.id;

            fc.add(frameRect);
            obj = frameRect;
          }
        }
      }

      if (obj) {
        activeObjects.push(obj);
      }
    });

      // Sync active selection highlight without triggering infinite selection event loops
      isUpdatingFromFabricRef.current = true;
      const allCanvasObjs = fc.getObjects();
      const matchingObjs = allCanvasObjs.filter((o: any) => o.layerId && selectedLayerIds.includes(o.layerId));

      if (selectedLayerIds.length > 1) {
        if (matchingObjs.length > 1) {
          const activeSel = new fabric.ActiveSelection(matchingObjs, { canvas: fc });
          fc.setActiveObject(activeSel);
        } else if (matchingObjs.length === 1) {
          fc.setActiveObject(matchingObjs[0]);
        }
      } else if (selectedLayerIds.length === 1) {
        const selectedId = selectedLayerIds[0];
        const selectedLayerObj = layers.find((l) => l.id === selectedId);
        const linkedF = selectedLayerObj ? fields.find((f) => f.id === selectedLayerObj.linkedFieldId) : null;
        const isListSelectedWithoutOption = linkedF && !linkedF.activeOptionId;

        if (isListSelectedWithoutOption) {
          fc.discardActiveObject();
        } else {
          const matchingObj = matchingObjs[0] || allCanvasObjs.find((o: any) => o.layerId === selectedId);
          if (matchingObj && fc.getActiveObject() !== matchingObj) {
            fc.setActiveObject(matchingObj);
          }
        }
      } else {
        fc.discardActiveObject();
      }
    fc.requestRenderAll();
    setTimeout(() => {
      isUpdatingFromFabricRef.current = false;
    }, 50);

    // Render Subtle Dashed Photo Reference Guide Box if a MASK layer is currently focused/selected
    const selectedLayerItem = visibleLayers.find((l) => l.id === selectedLayerId);
    if (selectedLayerItem && selectedLayerItem.layerType === "MASK") {
      const linkedPhotoLayer = visibleLayers.find(
        (l) => l.id === selectedLayerItem.parentPhotoUploadId || l.maskLayerId === selectedLayerItem.id
      );

      if (linkedPhotoLayer) {
        const photoCenterX = linkedPhotoLayer.posX + linkedPhotoLayer.width / 2;
        const photoCenterY = linkedPhotoLayer.posY + linkedPhotoLayer.height / 2;

        let guideObj = fc.getObjects().find((o: any) => o.photoGuideForMaskId === selectedLayerItem.id);
        if (!guideObj) {
          const guideRect = new fabric.Rect({
            left: photoCenterX,
            top: photoCenterY,
            width: linkedPhotoLayer.width,
            height: linkedPhotoLayer.height,
            fill: "rgba(239, 68, 68, 0.03)",
            stroke: "#ef4444",
            strokeWidth: 2,
            strokeDashArray: [6, 4],
            originX: "center",
            originY: "center",
            angle: linkedPhotoLayer.rotation,
            selectable: false,
            evented: false,
            objectCaching: false,
          });
          (guideRect as any).photoGuideForMaskId = selectedLayerItem.id;
          fc.add(guideRect);
          guideObj = guideRect;
        } else {
          guideObj.set({
            left: photoCenterX,
            top: photoCenterY,
            width: linkedPhotoLayer.width,
            height: linkedPhotoLayer.height,
            angle: linkedPhotoLayer.rotation,
            selectable: false,
            evented: false,
            dirty: true,
          });
          guideObj.setCoords();
        }
        activeObjects.push(guideObj);
      }
    }

    // Remove objects that are deleted or hidden
    fc.getObjects().forEach((obj: any) => {
      if ((obj.layerId || obj.photoGuideForMaskId) && !activeObjects.includes(obj)) {
        fc.remove(obj);
      }
    });

    // Strictly enforce Fabric canvas z-index stacking order (lowest zIndex at index 0, highest zIndex at top)
    const sortedVisibleLayers = [...visibleLayers].sort((a, b) => a.zIndex - b.zIndex);
    sortedVisibleLayers.forEach((l, targetIdx) => {
      const fabObj = fc.getObjects().find((o: any) => o.layerId === l.id);
      if (fabObj) {
        if (typeof (fc as any).moveObjectTo === "function") {
          (fc as any).moveObjectTo(fabObj, targetIdx);
        } else if (typeof (fabObj as any).moveTo === "function") {
          (fabObj as any).moveTo(targetIdx);
        }
      }
    });

    if (isPreviewMode) {
      fc.selection = false;
      fc.discardActiveObject();
      fc.getObjects().forEach((obj) => {
        obj.selectable = false;
        obj.evented = false;
        (obj as any).hasControls = false;
        (obj as any).hasBorders = false;
      });
    } else {
      fc.selection = true;
      visibleLayers.forEach((layer) => {
        const fabObj = fc.getObjects().find((o: any) => o.layerId === layer.id);
        if (fabObj) {
          fabObj.selectable = !layer.isLocked;
          fabObj.evented = !layer.isLocked;
          (fabObj as any).hasControls = !layer.isLocked;
          (fabObj as any).hasBorders = !layer.isLocked;
        }
      });

      if (!selectedLayerId) {
        fc.discardActiveObject();
      }
    }

    fc.renderAll();
  }, [layers, selectedLayerId, widthPx, heightPx, onSelectLayer, isPreviewMode, maskCacheVersion]);

  return (
    <div className="w-full h-full min-h-full bg-slate-200/70 overflow-auto p-4 relative select-none flex flex-col">
      {/* STOREFRONT PREVIEW BADGE */}
      {isPreviewMode && (
        <div className="absolute top-4 right-6 z-30 bg-amber-500 text-white font-bold text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 tracking-wide animate-pulse">
          <Eye className="w-4 h-4" />
          <span>Storefront Preview Mode</span>
        </div>
      )}

      {/* CANVAS CONTAINER CAROUSEL WRAPPER */}
      <div
        ref={containerRef}
        className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-300 transition-all duration-150 ease-out m-auto shrink-0"
        style={{
          width: widthPx * zoom,
          height: heightPx * zoom,
          backgroundColor: workspaceBgColor || "#ffffff",
        }}
      >
        {/* CANVAS STAGE SOLID BACKDROP BACKGROUND */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: workspaceBgColor || "#ffffff",
          }}
        />

        {/* SCREEN BACKGROUND IMAGE */}
        {bgUrl && (
          <img
            src={bgUrl}
            alt="Screen Background"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
          />
        )}

        {/* FABRIC.JS HTML5 CANVAS STAGE */}
        <div
          className="relative z-20 origin-top-left"
          style={{
            transform: `scale(${zoom})`,
            width: widthPx,
            height: heightPx,
          }}
        >
          <canvas ref={canvasElRef} />

          {/* ALIGNMENT GRID OVERLAY ON TOP OF LAYERS (Suppressed in Preview Mode!) */}
          {showGrid && !isPreviewMode && (
            <div
              className="absolute inset-0 pointer-events-none z-30 opacity-30"
              style={{
                backgroundImage:
                  "linear-gradient(to right, #3b82f6 1px, transparent 1px), linear-gradient(to bottom, #3b82f6 1px, transparent 1px)",
                backgroundSize: "50px 50px",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Active Fabric Canvas global reference for thumbnail export
let globalActiveFabricCanvas: fabric.Canvas | null = null;

export function getActiveFabricCanvas(): fabric.Canvas | null {
  return globalActiveFabricCanvas;
}

// Helper to load image as Promise
function loadImagePromise(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Generate Full Composite PNG Snapshot Thumbnail of Screen 1
export async function generateScreenThumbnailDataUrl(
  widthPx: number,
  heightPx: number,
  layers: CanvasLayerItem[],
  bgUrl?: string | null,
  fabricCanvasInstance?: fabric.Canvas | null
): Promise<string> {
  if (typeof window === "undefined") return "";

  const fc = fabricCanvasInstance || globalActiveFabricCanvas;
  const targetWidth = Math.min(widthPx, 600);
  const targetHeight = (heightPx * targetWidth) / widthPx;
  const scaleMultiplier = targetWidth / widthPx;

  let fabricDataUrl = "";

  if (fc) {
    try {
      // 1. Temporarily remember active object & hide frame borders for thumbnail export
      const activeObjBeforeExport = fc.getActiveObject();
      fc.discardActiveObject();
      fc.getObjects().forEach((obj) => {
        if (obj instanceof fabric.Group) {
          const frameRect = obj.getObjects()[0];
          if (frameRect) frameRect.set({ stroke: "transparent" });
        }
      });
      fc.renderAll();

      // 2. Export Fabric layer objects to PNG Data URL
      fabricDataUrl = fc.toDataURL({
        format: "png",
        multiplier: scaleMultiplier,
      });

      // 3. Restore blue dashed frame borders & active object selection
      fc.getObjects().forEach((obj) => {
        if (obj instanceof fabric.Group) {
          const frameRect = obj.getObjects()[0];
          if (frameRect) frameRect.set({ stroke: "rgba(79, 70, 229, 0.35)" });
        }
      });
      if (activeObjBeforeExport) {
        fc.setActiveObject(activeObjBeforeExport);
      }
      fc.renderAll();
    } catch (e) {
      console.warn("Fabric toDataURL thumbnail export warning:", e);
    }
  }

  // Create composite canvas combining Background Image + Fabric Layer PNG
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fabricDataUrl;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Draw Background Image if present
  if (bgUrl) {
    try {
      const bgImg = await loadImagePromise(bgUrl);
      ctx.drawImage(bgImg, 0, 0, targetWidth, targetHeight);
    } catch (e) {}
  }

  // Draw Fabric Objects PNG on top of background
  if (fabricDataUrl) {
    try {
      const fabricImg = await loadImagePromise(fabricDataUrl);
      ctx.drawImage(fabricImg, 0, 0, targetWidth, targetHeight);
    } catch (e) {}
  }

  return canvas.toDataURL("image/png");
}
