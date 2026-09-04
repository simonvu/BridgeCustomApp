import React, { useEffect, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import { buildFabricGradientOptions } from "../../utils/textFill";
import {
  processCustomMaskImage,
  preloadCustomMaskImage,
  createFabricMaskObject,
  applyPhotoMaskClipPath,
  clearPhotoMaskClipPath,
  findLinkedMaskLayer,
  findLinkedPhotoLayer,
  getMaskLiveGeometry,
} from "../../utils/photoMask";
import { ZoomIn, ZoomOut, RotateCcw, Grid, Eye, Scaling } from "lucide-react";
import { ensureFontLoaded, FontItem } from "../../utils/fontLoader";
import {
  applyTextCase,
  getFitFontSize,
  layoutTextInFrame,
  quoteFontFamily,
} from "../../utils/studioText";
import { generateWordSearchPuzzle } from "../../utils/wordSearchEngine";
import {
  resolveDoodleStyleAssignments,
  getCachedTrimmedImage,
  preloadDoodleLetterImages,
  layoutDoodleAlphabetRow,
} from "../../utils/doodleAlphabetEngine";
import { isEmptyOption, isConditionOnlyField, isOptionFieldType } from "../../utils/fieldHelpers";
import { clipArtFingerprint, loadClipArtImage, rasterizeClipArtFrameToCanvas, rasterizePunchedPlate, type ClipArtInstance, type ClipArtPartOption } from "../../utils/clipArtInstance";

export { processCustomMaskImage, preloadCustomMaskImage, createFabricMaskObject };

export interface CanvasLayerItem {
  id: string;
  name: string;
  layerType: "BACKGROUND" | "ASSET" | "TEXT" | "PHOTO_UPLOAD" | "OVERLAY" | "MASK" | "WORD_SEARCH_PUZZLE" | "DOODLE_ALPHABET" | "CLIPART";
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

function restoreRawPhotoElement(photoObj: fabric.Image) {
  const rawImgEl = (photoObj as any)._rawImageElement;
  if (rawImgEl && (photoObj as any)._isClippedCanvas) {
    photoObj.setElement(rawImgEl);
    (photoObj as any)._isClippedCanvas = false;
  }
}

// Helper to strictly enforce Fabric canvas z-index stacking order (lowest zIndex at index 0, highest zIndex at top)
export function enforceZIndexOrder(fc: fabric.Canvas, visibleLayers: CanvasLayerItem[], render = true) {
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
  if (render) scheduleFabricRender(fc);
}

let fabricRenderFrame = 0;
function scheduleFabricRender(fc: fabric.Canvas | null) {
  if (!fc) return;
  if (fabricRenderFrame) return;
  fabricRenderFrame = requestAnimationFrame(() => {
    fabricRenderFrame = 0;
    fc.requestRenderAll();
  });
}

const pendingAssetByLayer = new Map<string, string>();

function clampCanvasSize(n: number) {
  return Math.max(100, Math.min(8000, Math.round(n)));
}

type FrameEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function sizeFromFrameDrag(
  edge: FrameEdge,
  startW: number,
  startH: number,
  dx: number,
  dy: number,
  lockRatio: boolean
): { width: number; height: number } {
  let width = startW;
  let height = startH;
  if (edge.includes("e")) width = startW + dx;
  if (edge.includes("w")) width = startW - dx;
  if (edge.includes("s")) height = startH + dy;
  if (edge.includes("n")) height = startH - dy;
  if (lockRatio && startW > 0 && startH > 0) {
    const ratio = startW / startH;
    const fromW = Math.abs(width - startW) * startH >= Math.abs(height - startH) * startW;
    if (edge === "n" || edge === "s" || !fromW && (edge === "ne" || edge === "nw" || edge === "se" || edge === "sw")) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
  }
  return { width: clampCanvasSize(width), height: clampCanvasSize(height) };
}

const FRAME_HANDLES: { edge: FrameEdge; className: string; cursor: string }[] = [
  { edge: "n", className: "left-1/2 -top-1 -translate-x-1/2 w-10 h-2.5", cursor: "ns-resize" },
  { edge: "s", className: "left-1/2 -bottom-1 -translate-x-1/2 w-10 h-2.5", cursor: "ns-resize" },
  { edge: "e", className: "top-1/2 -right-1 -translate-y-1/2 w-2.5 h-10", cursor: "ew-resize" },
  { edge: "w", className: "top-1/2 -left-1 -translate-y-1/2 w-2.5 h-10", cursor: "ew-resize" },
  { edge: "ne", className: "-top-1.5 -right-1.5 w-3.5 h-3.5", cursor: "nesw-resize" },
  { edge: "nw", className: "-top-1.5 -left-1.5 w-3.5 h-3.5", cursor: "nwse-resize" },
  { edge: "se", className: "-bottom-1.5 -right-1.5 w-3.5 h-3.5", cursor: "nwse-resize" },
  { edge: "sw", className: "-bottom-1.5 -left-1.5 w-3.5 h-3.5", cursor: "nesw-resize" },
];

interface StudioCanvasProps {
  widthPx: number;
  heightPx: number;
  layers: CanvasLayerItem[];
  fields?: any[];
  selectedLayerId: string | null;
  selectedLayerIds?: string[];
  onSelectLayer: (layerId: string | null, isMultiKey?: boolean) => void;
  onSelectLayers?: (layerIds: string[]) => void;
  onUpdateLayer: (layerId: string, updatedProps: Partial<CanvasLayerItem>) => void;
  onUpdateLayers?: (updates: { layerId: string; patch: Partial<CanvasLayerItem> }[]) => void;
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
  onResizeCanvas?: (widthPx: number, heightPx: number) => void;
  /** Clip-art shared groups: only use per-option size/position when freeTransform is on. */
  useOptionGeometry?: "always" | "whenFree";
}

/**
 * Quadratic arc for Fabric text-on-path.
 * Chord sits on y=0 so pathOffset centers the bulge; no extra Y hacks needed.
 */
function createFabricCurvePath(
  containerWidth: number,
  containerHeight: number,
  curveAngleDeg: number,
  fontSize: number = 36
): fabric.Path | null {
  if (!curveAngleDeg || Math.abs(curveAngleDeg) < 1) return null;

  const absDeg = Math.min(180, Math.abs(curveAngleDeg));
  const isSmile = curveAngleDeg < 0;
  const halfW = Math.max(20, containerWidth / 2);
  const glyphPad = Math.max(4, fontSize * 0.35);
  const maxSagitta = Math.max(6, containerHeight / 2 - glyphPad);
  const t = absDeg / 180;
  const sagitta = Math.max(3, Math.sin((t * Math.PI) / 2) * maxSagitta);
  const signedS = isSmile ? sagitta : -sagitta;
  const controlY = 2 * signedS;

  const pathStr = `M ${(-halfW).toFixed(3)} 0 Q 0 ${controlY.toFixed(3)} ${halfW.toFixed(3)} 0`;
  return new fabric.Path(pathStr, {
    fill: undefined,
    stroke: undefined,
    visible: false,
    selectable: false,
    evented: false,
    objectCaching: false,
  });
}

function curvedTextOffsetY(
  vAlign: string,
  renderHeight: number,
  pathHeight: number
): number {
  const slack = Math.max(0, (renderHeight - pathHeight) / 2);
  if (vAlign === "top") return -slack;
  if (vAlign === "bottom") return slack;
  return 0;
}

function positionTextInFrame(
  textObj: fabric.Text | fabric.Textbox,
  opts: {
    isTextbox: boolean;
    isCurved: boolean;
    hAlign: string;
    vAlign: string;
    frameW: number;
    frameH: number;
  }
) {
  if (typeof (textObj as any).initDimensions === "function") {
    textObj.initDimensions();
  }
  const pos = layoutTextInFrame({
    isTextbox: opts.isTextbox,
    isCurved: opts.isCurved,
    hAlign: opts.hAlign,
    vAlign: opts.vAlign,
    frameW: opts.frameW,
    frameH: opts.frameH,
    measuredW: textObj.width || 0,
    measuredH: textObj.height || 0,
    curveOffsetY: opts.isCurved ? curvedTextOffsetY(opts.vAlign, opts.frameH, textObj.height || 0) : 0,
  });
  textObj.set({
    left: pos.left,
    top: pos.top,
    originX: "center",
    originY: "center",
    dirty: true,
  });
}

function applyFabricMultiSelection(
  fc: fabric.Canvas,
  layers: CanvasLayerItem[],
  fields: any[] | undefined,
  selectedIds: string[]
) {
  const matchingObjs = fc.getObjects().filter((o: any) => o.layerId && selectedIds.includes(o.layerId));
  const active = fc.getActiveObject();

  if (selectedIds.length > 1) {
    if (matchingObjs.length > 1) {
      if (active instanceof fabric.ActiveSelection) {
        const ids = active.getObjects().map((o: any) => o.layerId).filter(Boolean);
        if (ids.length === selectedIds.length && selectedIds.every((id) => ids.includes(id))) {
          return;
        }
      }
      fc.setActiveObject(new fabric.ActiveSelection(matchingObjs, { canvas: fc }));
    } else if (matchingObjs.length === 1 && active !== matchingObjs[0]) {
      fc.setActiveObject(matchingObjs[0]);
    }
    return;
  }

  if (selectedIds.length === 1) {
    const selectedId = selectedIds[0];
    const selectedLayerObj = layers.find((l) => l.id === selectedId);
    const linkedF = selectedLayerObj ? fields?.find((f) => f.id === selectedLayerObj.linkedFieldId) : null;
    if (linkedF && !linkedF.activeOptionId) {
      if (active) fc.discardActiveObject();
      return;
    }
    const matchingObj = matchingObjs[0] || fc.getObjects().find((o: any) => o.layerId === selectedId);
    if (matchingObj && active !== matchingObj) {
      fc.setActiveObject(matchingObj);
    }
    return;
  }

  if (active) fc.discardActiveObject();
}

export default function StudioCanvas({
  widthPx,
  heightPx,
  layers,
  fields = [],
  selectedLayerId,
  selectedLayerIds = [],
  onSelectLayer,
  onSelectLayers,
  onUpdateLayer,
  onUpdateLayers,
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
  onResizeCanvas,
  useOptionGeometry = "always",
}: StudioCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const isUpdatingFromFabricRef = useRef(false);
  const pendingFrameUpdatesRef = useRef<{ [layerId: string]: { posX: number; posY: number; width: number; height: number } }>({});
  const doodleBuildFpRef = useRef<Record<string, string>>({});

  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const selectedLayerIdsRef = useRef(selectedLayerIds);
  useEffect(() => {
    selectedLayerIdsRef.current = selectedLayerIds;
  }, [selectedLayerIds]);

  const fieldsRef = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  const onUpdateLayerRef = useRef(onUpdateLayer);
  useEffect(() => {
    onUpdateLayerRef.current = onUpdateLayer;
  }, [onUpdateLayer]);

  const onUpdateLayersRef = useRef(onUpdateLayers);
  useEffect(() => {
    onUpdateLayersRef.current = onUpdateLayers;
  }, [onUpdateLayers]);

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

  const [frameResizeMode, setFrameResizeMode] = useState(false);
  const [draftFrame, setDraftFrame] = useState<{ width: number; height: number } | null>(null);
  const frameDragRef = useRef<{
    edge: FrameEdge;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    zoom: number;
  } | null>(null);

  const frameW = draftFrame?.width ?? widthPx;
  const frameH = draftFrame?.height ?? heightPx;

  const beginFrameResize = (edge: FrameEdge, e: React.PointerEvent) => {
    if (!onResizeCanvas || isPreviewMode) return;
    e.preventDefault();
    e.stopPropagation();
    const z = zoom || 1;
    frameDragRef.current = {
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startW: widthPx,
      startH: heightPx,
      zoom: z,
    };
    setDraftFrame({ width: widthPx, height: heightPx });
    const handleMove = (ev: PointerEvent) => {
      const drag = frameDragRef.current;
      if (!drag) return;
      const dx = (ev.clientX - drag.startX) / drag.zoom;
      const dy = (ev.clientY - drag.startY) / drag.zoom;
      setDraftFrame(sizeFromFrameDrag(drag.edge, drag.startW, drag.startH, dx, dy, ev.shiftKey));
    };
    const handleUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      const drag = frameDragRef.current;
      frameDragRef.current = null;
      if (!drag) {
        setDraftFrame(null);
        return;
      }
      const dx = (ev.clientX - drag.startX) / drag.zoom;
      const dy = (ev.clientY - drag.startY) / drag.zoom;
      const next = sizeFromFrameDrag(drag.edge, drag.startW, drag.startH, dx, dy, ev.shiftKey);
      setDraftFrame(null);
      if (next.width !== drag.startW || next.height !== drag.startH) onResizeCanvas(next.width, next.height);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

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
              const fontStyle = props.fontStyle || "normal";
              const baseFontSize = Number(props.fontSize) || 36;
              const isAutoFit = Boolean((props.autoFit !== false) && !props.allowMultiline);
              const freshFontSize = getFitFontSize(
                textStr,
                font,
                baseFontSize,
                layer.width,
                isAutoFit,
                fontWeight,
                fontStyle
              );
              const hAlign = props.align || "center";
              const vAlign = props.verticalAlign || "middle";
              const curveAngle = Number(props.curveAngle) || 0;
              const isCurved = Math.abs(curveAngle) >= 1;
              const isTextbox = Boolean(props.allowMultiline && !isCurved);
              const family = quoteFontFamily(font);

              const applyToText = (textObj: fabric.Text | fabric.Textbox) => {
                textObj.set({
                  fontFamily: family,
                  fontSize: freshFontSize,
                  fontWeight: fontWeight,
                  fontStyle: fontStyle,
                  textAlign: hAlign,
                  dirty: true,
                });
                positionTextInFrame(textObj, {
                  isTextbox,
                  isCurved,
                  hAlign,
                  vAlign,
                  frameW: layer.width,
                  frameH: layer.height,
                });
              };

              if (obj instanceof fabric.Group) {
                obj.getObjects().forEach((child) => {
                  if (child instanceof fabric.Text || child instanceof fabric.Textbox) {
                    applyToText(child as fabric.Text);
                  }
                });
                obj.set({ dirty: true });
              } else if (obj instanceof fabric.Text || obj instanceof fabric.Textbox) {
                applyToText(obj);
              }
            }
          } else if (layer.layerType === "WORD_SEARCH_PUZZLE") {
            const props = layer.properties || {};
            const font = props.gridFontFamily || props.fontFamily || "Roboto";
            if (!loadedFamily || font.toLowerCase() === loadedFamily.toLowerCase()) {
              if (obj instanceof fabric.Group) {
                obj.getObjects().forEach((child) => {
                  if (child instanceof fabric.Text || child instanceof fabric.Textbox) {
                    child.set({ dirty: true });
                  }
                });
              }
              obj.set({ dirty: true });
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

  // Auto-fit zoom on initial mount only — resizing the frame must not change zoom or layers.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          const isAutoFit = props.autoFit !== false && !props.allowMultiline;
          const baseFontSize = Number(props.fontSize) || 36;
          const fontFamily = props.fontFamily || "Roboto";
          const fontWeight = props.fontWeight || "normal";
          const fontStyle = props.fontStyle || "normal";
          const textStr = textObj.text || targetLayer?.name || "";
          const hAlign = props.align || "center";
          const vAlign = props.verticalAlign || "middle";
          const curveAngle = Number(props.curveAngle) || 0;
          const fitFontSize = getFitFontSize(
            textStr,
            fontFamily,
            baseFontSize,
            newWidth,
            isAutoFit,
            fontWeight,
            fontStyle
          );
          const livePath = createFabricCurvePath(newWidth, newHeight, curveAngle, fitFontSize);
          const isTextbox = textObj instanceof fabric.Textbox;

          if (livePath) {
            textObj.set({
              fontSize: fitFontSize,
              fontFamily: quoteFontFamily(fontFamily),
              fontWeight,
              fontStyle,
              path: livePath,
              pathStartOffset: 0,
              pathAlign: "center",
              pathSide: "left",
              textAlign: hAlign,
              originX: "center",
              originY: "center",
              scaleX: 1,
              scaleY: 1,
            });
            if (typeof (textObj as any).setPathInfo === "function") {
              (textObj as any).setPathInfo();
            }
            positionTextInFrame(textObj, {
              isTextbox: false,
              isCurved: true,
              hAlign,
              vAlign,
              frameW: newWidth,
              frameH: newHeight,
            });
          } else {
            const textPatch: any = {
              path: undefined,
              fontSize: fitFontSize,
              fontFamily: quoteFontFamily(fontFamily),
              fontWeight,
              fontStyle,
              textAlign: hAlign,
              scaleX: 1,
              scaleY: 1,
            };
            if (isTextbox) textPatch.width = newWidth;
            textObj.set(textPatch);
            positionTextInFrame(textObj, {
              isTextbox,
              isCurved: false,
              hAlign,
              vAlign,
              frameW: newWidth,
              frameH: newHeight,
            });
          }
        }

        target.setCoords();
      }
    };

      // Handle Object Modifications (Move, Scale, Rotate)
      const handleObjectModified = (e: any) => {
        const target = e.target;
        if (!target) return;

        if (target instanceof fabric.ActiveSelection) {
          if (isUpdatingFromFabricRef.current) return;
          isUpdatingFromFabricRef.current = true;
          const updates: { layerId: string; patch: Partial<CanvasLayerItem> }[] = [];
          target.getObjects().forEach((obj: any) => {
            if (!obj.layerId) return;
            const matrix = obj.calcTransformMatrix();
            const options = fabric.util.qrDecompose(matrix);
            const worldScaleX = Math.abs(options.scaleX || 1);
            const worldScaleY = Math.abs(options.scaleY || 1);
            const newW = Math.max(10, Math.round((obj.width || 100) * worldScaleX));
            const newH = Math.max(10, Math.round((obj.height || 100) * worldScaleY));
            updates.push({
              layerId: obj.layerId,
              patch: {
                posX: Math.round(options.translateX - newW / 2),
                posY: Math.round(options.translateY - newH / 2),
              },
            });
          });
          if (updates.length > 0) {
            if (onUpdateLayersRef.current) {
              onUpdateLayersRef.current(updates);
            } else {
              updates.forEach((u) => onUpdateLayerRef.current(u.layerId, u.patch));
            }
          }

          setTimeout(() => {
            isUpdatingFromFabricRef.current = false;
          }, 50);
          return;
        }

        if (!target.layerId) return;

        isUpdatingFromFabricRef.current = true;
        const layerId = target.layerId;
        const scaleX = Math.abs(target.scaleX || 1);
        const scaleY = Math.abs(target.scaleY || 1);

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
      const restoreMultiSelection = () => {
        const current = selectedLayerIdsRef.current;
        if (current.length < 2) return false;
        const active = fabricCanvas.getActiveObject();
        if (active instanceof fabric.ActiveSelection) {
          const ids = active.getObjects().map((o: any) => o.layerId).filter(Boolean);
          if (ids.length === current.length && current.every((id) => ids.includes(id))) {
            return true;
          }
        }
        isUpdatingFromFabricRef.current = true;
        const objs = fabricCanvas.getObjects().filter((o: any) => o.layerId && current.includes(o.layerId));
        if (objs.length > 1) {
          fabricCanvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas: fabricCanvas }));
          fabricCanvas.requestRenderAll();
        }
        setTimeout(() => {
          isUpdatingFromFabricRef.current = false;
        }, 50);
        return objs.length > 1;
      };

      const handleSelectionCreated = (e: any) => {
        if (isUpdatingFromFabricRef.current) return;
        const selected = e.selected || [];
        const selectedIds = selected.map((o: any) => o.layerId).filter(Boolean);
        const current = selectedLayerIdsRef.current;
        const isMultiKey = e.e ? Boolean(e.e.ctrlKey || e.e.metaKey) : false;

        if (selectedIds.length === 1 && current.length > 1 && current.includes(selectedIds[0])) {
          if (isMultiKey) {
            onSelectLayer(selectedIds[0], true);
            return;
          }
          restoreMultiSelection();
          return;
        }

        if (selectedIds.length > 0) {
          if (selectedIds.length === 1) {
            onSelectLayer(selectedIds[0], isMultiKey);
          } else if (onSelectLayers) {
            onSelectLayers(selectedIds);
          } else {
            selectedIds.forEach((id) => onSelectLayer(id, true));
          }
        }
      };

      const handleSelectionCleared = () => {
        if (isUpdatingFromFabricRef.current) return;
        if (selectedLayerIdsRef.current.length > 1) return;
        onSelectLayer(null);
      };

      fabricCanvas.on("mouse:down", (opt: any) => {
        const current = selectedLayerIdsRef.current;
        if (!opt.target) {
          if (current.length > 0) onSelectLayer(null);
          return;
        }
        if (opt.e?.ctrlKey || opt.e?.metaKey) return;
        if (opt.target instanceof fabric.ActiveSelection) return;
        const clickedId = (opt.target as any).layerId as string | undefined;
        if (current.length > 1 && clickedId && current.includes(clickedId)) {
          restoreMultiSelection();
        }
      });

      // Keep the photo's clip window in stage space while mask/photo is dragged, scaled, or rotated.
      const handleLiveTransform = (e: any) => {
        const target = e.target;
        if (!target || !target.layerId) return;

        const targetLayer = layersRef.current.find((l) => l.id === target.layerId);
        if (!targetLayer) return;

        if (targetLayer.layerType === "MASK") {
          const photoLayer = findLinkedPhotoLayer(layersRef.current, targetLayer);
          const photoObj = photoLayer
            ? fabricCanvas.getObjects().find((o: any) => o.layerId === photoLayer.id)
            : undefined;
          if (photoObj) {
            if (photoObj instanceof fabric.Image) restoreRawPhotoElement(photoObj);
            applyPhotoMaskClipPath(photoObj, targetLayer, getMaskLiveGeometry(target, targetLayer));
            fabricCanvas.requestRenderAll();
          }
        } else if (targetLayer.layerType === "PHOTO_UPLOAD") {
          const linkedMaskLayer = findLinkedMaskLayer(layersRef.current, targetLayer);
          if (linkedMaskLayer && linkedMaskLayer.isVisible) {
            if (target instanceof fabric.Image) restoreRawPhotoElement(target);
            const maskObj = fabricCanvas.getObjects().find((o: any) => o.layerId === linkedMaskLayer.id);
            applyPhotoMaskClipPath(target, linkedMaskLayer, getMaskLiveGeometry(maskObj, linkedMaskLayer));
            fabricCanvas.requestRenderAll();
          }
        }
      };

    fabricCanvas.on("object:moving", handleLiveTransform);
    fabricCanvas.on("object:scaling", (e: any) => {
      handleLiveTransform(e);
      handleObjectScaling(e);
    });
    fabricCanvas.on("object:rotating", handleLiveTransform);
    fabricCanvas.on("object:modified", handleObjectModified);
    fabricCanvas.on("selection:created", handleSelectionCreated);
    fabricCanvas.on("selection:updated", handleSelectionCreated);
    fabricCanvas.on("selection:cleared", handleSelectionCleared);

    return () => {
      fabricCanvas.dispose();
      fabricCanvasRef.current = null;
    };
    // Canvas is created once; size changes go through setDimensions in the sync effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trigger immediate Fabric canvas re-render whenever dynamic web fonts finish downloading
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;

    const handleFontReady = () => {
      window.dispatchEvent(new CustomEvent("studio:font-loaded", { detail: {} }));
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

    if (Boolean((fc as any)._currentTransform)) return;

    isUpdatingFromFabricRef.current = true;
    if (fc.getActiveObject() instanceof fabric.ActiveSelection) {
      fc.discardActiveObject();
    }

    // Warm image cache for every field option / clip-art part (including hidden layers)
    layers.forEach((l) => {
      const props = l.properties || {};
      if (l.isVisible && props.maskShape === "CUSTOM" && props.maskAssetUrl) {
        preloadCustomMaskImage(props.maskAssetUrl, () => {
          setMaskCacheVersion((v) => v + 1);
        });
      }
      if (props.assetUrl) void loadClipArtImage(props.assetUrl).catch(() => {});
      if (l.linkedFieldId) {
        const linkedF = (fields || []).find((f) => f.id === l.linkedFieldId);
        (linkedF?.config?.options || []).forEach((o: any) => {
          const url = o?.assetImageUrl || o?.assetUrl;
          if (url) void loadClipArtImage(url).catch(() => {});
        });
      }
      if (l.layerType === "CLIPART") {
        (props.clipArtGroups || []).forEach((g: any) => {
          (g.options || []).forEach((o: any) => {
            if (o?.assetImageUrl) void loadClipArtImage(o.assetImageUrl).catch(() => {});
          });
        });
      }
      if (l.layerType === "DOODLE_ALPHABET") {
        const pack = doodlePacks?.find((p: any) => p.id === props.doodlePackId) || doodlePacks?.[0];
        if (pack) {
          void preloadDoodleLetterImages(
            resolveDoodleStyleAssignments(
              (props.text || "AUNTIE").trim(),
              pack,
              props.styleSelectionRule || "RANDOM_SHUFFLE",
              props.fixedStyleId || "",
              Number(props.seed) || 12345
            )
          );
        }
      }
    });

    fc.setDimensions({ width: widthPx, height: heightPx });

    // Filter visible layers sorted by Z-Index
    const visibleLayers = [...layers]
      .filter((l) => {
        if (!l.isVisible) return false;
        if (!l.linkedFieldId) return true;
        const linkedF = (fields || []).find((f) => f.id === l.linkedFieldId);
        return !isConditionOnlyField(linkedF);
      })
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
        if (isConditionOnlyField(linkedF)) {
          obj = undefined;
          return;
        }
        if (linkedF && isOptionFieldType(linkedF.fieldType)) {
          const config = linkedF.config || {};
          const applyOptGeom = useOptionGeometry === "always" || Boolean(config.freeTransform);
          if (applyOptGeom) {
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
      }

      const centerX = renderPosX + renderWidth / 2;
      const centerY = renderPosY + renderHeight / 2;

      if (layer.layerType === "TEXT") {
        const rawTextStr = props.text !== undefined ? props.text : layer.name;
        let textStr = applyTextCase(rawTextStr, props.textCase);

        const font = props.fontFamily || "Roboto";
        const family = quoteFontFamily(font);
        const fontWeight = props.fontWeight || "normal";
        const fontStyle = props.fontStyle || "normal";
        const baseFontSize = Number(props.fontSize) || 36;
        const isAutoFit = Boolean((props.autoFit !== false) && !props.allowMultiline);
        const fontSize = getFitFontSize(
          textStr,
          font,
          baseFontSize,
          renderWidth,
          isAutoFit,
          fontWeight,
          fontStyle
        );

        const maxLinesLimit =
          props.allowMultiline && props.maxLines && Number(props.maxLines) > 0 ? Number(props.maxLines) : 0;
        if (maxLinesLimit > 0) {
          const hardLines = textStr.split("\n");
          if (hardLines.length > maxLinesLimit) {
            textStr = hardLines.slice(0, maxLinesLimit).join("\n");
          }
          try {
            const tempTb = new fabric.Textbox(textStr, {
              width: layer.width,
              fontFamily: family,
              fontSize: fontSize,
              fontWeight: fontWeight,
              fontStyle: fontStyle,
              splitByGrapheme: false,
            });
            const softLines = (tempTb as any)._textLines || [];
            if (softLines.length > maxLinesLimit) {
              const truncated: string[] = [];
              for (let i = 0; i < maxLinesLimit; i++) {
                const lineData = softLines[i];
                truncated.push((Array.isArray(lineData) ? lineData.join("") : String(lineData || "")).trim());
              }
              textStr = truncated.join("\n");
            }
          } catch {
            // ignore wrap measure errors
          }
        }

        const opacity = props.opacity !== undefined ? Number(props.opacity) : 1;
        const strokeWidth = Number(props.strokeWidth) || 0;
        const curveAngle = Number(props.curveAngle) || 0;
        const hAlign = props.align || "center";
        const vAlign = props.verticalAlign || "middle";
        const curvePath = createFabricCurvePath(renderWidth, renderHeight, curveAngle, fontSize);
        const isCurved = Boolean(curvePath);
        const isMultilineTextbox = Boolean(props.allowMultiline && !isCurved);
        const isTextSelected = selectedLayerIds.includes(layer.id) || selectedLayerId === layer.id;

        ensureFontLoaded(font, fonts).catch(() => {});

        let shadowObj: fabric.Shadow | undefined = undefined;
        if ((props.shadowBlur || 0) > 0 || (props.shadowOffsetX || 0) !== 0 || (props.shadowOffsetY || 0) !== 0) {
          shadowObj = new fabric.Shadow({
            color: props.shadowColor || "rgba(0,0,0,0.5)",
            blur: Number(props.shadowBlur) || 0,
            offsetX: Number(props.shadowOffsetX) || 0,
            offsetY: Number(props.shadowOffsetY) || 0,
          });
        }

        let fillStyle: any = props.color || "#1e293b";
        if (props.colorMode === "GRADIENT") {
          fillStyle = new fabric.Gradient(buildFabricGradientOptions(props));
        }

        const textStylePatch: any = {
          text: textStr,
          originX: "center",
          originY: "center",
          fontFamily: family,
          fontWeight,
          fontStyle,
          fontSize,
          fill: fillStyle,
          textAlign: hAlign,
          stroke: strokeWidth > 0 ? props.strokeColor || "#000000" : undefined,
          strokeWidth,
          paintFirst: strokeWidth > 0 ? "stroke" : "fill",
          opacity,
          shadow: shadowObj,
          path: curvePath || undefined,
          pathStartOffset: 0,
          pathAlign: "center",
          pathSide: "left",
          splitByGrapheme: false,
          objectCaching: false,
          dirty: true,
        };
        if (isMultilineTextbox) textStylePatch.width = renderWidth;

        const existingGroup =
          obj instanceof fabric.Group && (obj as any).layerType === "TEXT" ? obj : undefined;
        const existingText = existingGroup
          ? (existingGroup.getObjects().find((c) => c instanceof fabric.Text || c instanceof fabric.Textbox) as
              | fabric.Text
              | fabric.Textbox
              | undefined)
          : undefined;
        const typeMatches =
          Boolean(existingText) &&
          (isMultilineTextbox ? existingText instanceof fabric.Textbox : !(existingText instanceof fabric.Textbox));

        if (existingGroup && existingText && typeMatches) {
          const frameRect = existingGroup.getObjects().find((c) => c instanceof fabric.Rect) as fabric.Rect | undefined;
          existingText.set(textStylePatch);
          if (isCurved && typeof (existingText as any).setPathInfo === "function") {
            (existingText as any).setPathInfo();
          }
          positionTextInFrame(existingText, {
            isTextbox: isMultilineTextbox,
            isCurved,
            hAlign,
            vAlign,
            frameW: renderWidth,
            frameH: renderHeight,
          });
          if (frameRect) {
            frameRect.set({
              left: 0,
              top: 0,
              originX: "center",
              originY: "center",
              width: renderWidth,
              height: renderHeight,
              fill: "rgba(0, 0, 0, 0.001)",
              stroke: isTextSelected ? "rgba(79, 70, 229, 0.45)" : "transparent",
              strokeWidth: isTextSelected ? 1 : 0,
              strokeDashArray: isTextSelected ? [4, 4] : undefined,
            });
          }
          existingGroup.set({
            left: centerX,
            top: centerY,
            originX: "center",
            originY: "center",
            angle: renderRotation,
            width: renderWidth,
            height: renderHeight,
            scaleX: 1,
            scaleY: 1,
            selectable: !layer.isLocked,
            evented: !layer.isLocked,
            dirty: true,
          });
          existingGroup.setCoords();
          obj = existingGroup;
        } else {
          if (obj) {
            fc.remove(obj);
            obj = undefined;
          }

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

          const textObj = isMultilineTextbox
            ? new fabric.Textbox(textStr, textStylePatch)
            : new fabric.Text(textStr, textStylePatch);

          positionTextInFrame(textObj, {
            isTextbox: isMultilineTextbox,
            isCurved,
            hAlign,
            vAlign,
            frameW: renderWidth,
            frameH: renderHeight,
          });

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
          (obj as any).layerId = layer.id;
          (obj as any).layerType = "TEXT";
          fc.add(obj);
        }

        (obj as any).layerId = layer.id;
        (obj as any).layerType = "TEXT";
      } else if (layer.layerType === "WORD_SEARCH_PUZZLE") {
        const rawWords: string[] = props.words && Array.isArray(props.words) && props.words.length > 0
          ? props.words
          : ["SIMON", "LISA", "JANE", "HAPPY", "URI", "RONALDO", "MESSI"];

        const gridW = props.gridWidth || 10;
        const gridH = props.gridHeight || 10;
        const seed = props.seed || 12345;
        const allowDiag = props.allowDiagonal !== false;
        const allowRev = props.allowReverse === true && props.explicitReverse === true;
        const fontFam =
          props.gridFontFamily ||
          props.fontFamily ||
          (layer as any).fontFamily ||
          "Roboto";

        ensureFontLoaded(fontFam, fonts).then(() => {
          if (fc) scheduleFabricRender(fc);
        }).catch(() => {});

        const fillerTextColor =
          props.gridTextColor ||
          props.color ||
          props.fill ||
          (layer as any).color ||
          (layer as any).fill ||
          "#1E293B";
        const wordTextColor = props.wordTextColor || props.highlightTextColor || fillerTextColor;
        const fontWeight = props.fontWeight || (layer as any).fontWeight || "bold";
        const fontStyle = props.fontStyle || (layer as any).fontStyle || "normal";
        const textTransform = props.textTransform || props.wordStyle || "UPPERCASE";
        const density = props.overlapDensity || "BALANCED";
        const showHighlights = props.showHighlights === undefined ? true : Boolean(props.showHighlights);
        const activeHighlightColor = props.highlightColor || props.ovalColor || "#FD005D";
        const strokeWidth = Number(props.highlightLineWidth) || 4;
        const isTransparentFill = props.transparentHighlightFill === true;
        const rawFillColor = props.highlightFillColor || activeHighlightColor;
        const fillOpacity = isTransparentFill ? 0 : props.highlightFillOpacity !== undefined ? Number(props.highlightFillOpacity) : 0.22;
        const cellW = renderWidth / gridW;
        const cellH = renderHeight / gridH;
        const autoFontSize = Math.min(cellW, cellH) * 0.55;
        const rawFontSize = Number(props.fontSize || props.gridFontSize || (layer as any).fontSize);
        const actualFontSize = rawFontSize && rawFontSize > 0 ? rawFontSize : Math.max(10, Math.round(autoFontSize));
        const isSelected = selectedLayerIds.includes(layer.id) || selectedLayerId === layer.id;

        const puzzleFp = [
          layer.id,
          rawWords.join("\n"),
          gridW,
          gridH,
          seed,
          allowDiag ? 1 : 0,
          allowRev ? 1 : 0,
          density,
          fontFam,
          fontWeight,
          fontStyle,
          textTransform,
          actualFontSize,
          fillerTextColor,
          wordTextColor,
          showHighlights ? 1 : 0,
          activeHighlightColor,
          strokeWidth,
          isTransparentFill ? 1 : 0,
          rawFillColor,
          fillOpacity,
          Math.round(renderWidth),
          Math.round(renderHeight),
        ].join("|");

        const existingPuzzle = obj instanceof fabric.Group ? obj : undefined;
        if (existingPuzzle && (existingPuzzle as any)._wsFp === puzzleFp) {
          existingPuzzle.set({
            left: centerX,
            top: centerY,
            angle: layer.rotation,
            selectable: !layer.isLocked,
            evented: !layer.isLocked,
          });
          const selFrame = existingPuzzle.getObjects()[0];
          if (selFrame) {
            selFrame.set({
              stroke: isSelected ? "#3b82f6" : "transparent",
              strokeWidth: isSelected ? 1 : 0,
              strokeDashArray: isSelected ? [4, 4] : undefined,
            });
          }
          existingPuzzle.set({ dirty: true });
          existingPuzzle.setCoords();
          obj = existingPuzzle;
        } else {
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

        const puzzleTotalW = renderWidth;
        const puzzleTotalH = renderHeight;

        const startGridX = -puzzleTotalW / 2 + cellW / 2;
        const startGridY = -puzzleTotalH / 2 + cellH / 2;

        const groupObjects: fabric.Object[] = [];

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
          objectCaching: false,
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
              objectCaching: false,
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
              objectCaching: false,
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
          objectCaching: true,
          dirty: true,
        });

        puzzleGroup.pathOffset = new fabric.Point(0, 0);
        puzzleGroup.width = layer.width;
        puzzleGroup.height = layer.height;
        (puzzleGroup as any).layerId = layer.id;
        (puzzleGroup as any).layerType = "WORD_SEARCH_PUZZLE";
        (puzzleGroup as any)._wsFp = puzzleFp;

        fc.add(puzzleGroup);
        obj = puzzleGroup;
        }
      } else if (layer.layerType === "DOODLE_ALPHABET") {
        const doodlePackId = props.doodlePackId;
        const targetPack = doodlePacks?.find((p: any) => p.id === doodlePackId) || doodlePacks?.[0];
        const inputText = (props.text || "AUNTIE").trim();
        const rule = props.styleSelectionRule || "RANDOM_SHUFFLE";
        const fixedStyleId = props.fixedStyleId || "";
        const seed = Number(props.seed) || 12345;
        const letterSpacing = Number(props.letterSpacing) || 4;
        const autoFitContainer = props.autoFitContainer !== false;
        const align = props.align || "center";
        const isSelected = selectedLayerIds.includes(layer.id) || selectedLayerId === layer.id;

        const currentFingerprint = [
          layer.id,
          doodlePackId,
          inputText,
          rule,
          fixedStyleId,
          seed,
          letterSpacing,
          autoFitContainer ? 1 : 0,
          align,
          Math.round(renderWidth),
          Math.round(renderHeight),
        ].join("|");

        const existingDoodleGroup = obj as any;

        if (existingDoodleGroup && existingDoodleGroup._doodleFingerprint === currentFingerprint) {
          existingDoodleGroup.set({
            left: centerX,
            top: centerY,
            angle: layer.rotation,
            selectable: !layer.isLocked,
            evented: !layer.isLocked,
          });
          if (existingDoodleGroup instanceof fabric.Group) {
            const selFrame = existingDoodleGroup.getObjects()[0];
            if (selFrame) {
              const nextStroke = isSelected ? "#9333ea" : "transparent";
              if (selFrame.stroke !== nextStroke) {
                selFrame.set({
                  stroke: nextStroke,
                  strokeWidth: isSelected ? 1 : 0,
                  strokeDashArray: isSelected ? [4, 4] : undefined,
                });
                existingDoodleGroup.set({ dirty: true });
              }
            }
          }
          existingDoodleGroup.setCoords();
          obj = existingDoodleGroup;
        } else {
          const assignments = targetPack
            ? resolveDoodleStyleAssignments(inputText, targetPack, rule, fixedStyleId, seed)
            : [];
          doodleBuildFpRef.current[layer.id] = currentFingerprint;

          const commitDoodleGroup = (canvases: Array<HTMLCanvasElement | null>) => {
            const liveFc = fabricCanvasRef.current;
            if (!liveFc) return;
            if (doodleBuildFpRef.current[layer.id] !== currentFingerprint) return;

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
              objectCaching: false,
            });
            groupObjects.push(frameRect);

            const slots = canvases.map((canvas) =>
              canvas ? { width: canvas.width || 100, height: canvas.height || 100 } : null
            );
            const placements = layoutDoodleAlphabetRow(slots, {
              renderWidth,
              renderHeight,
              letterSpacing,
              autoFitContainer,
              align,
            });

            for (let i = 0; i < canvases.length; i++) {
              const canvas = canvases[i];
              const place = placements[i];
              if (!canvas || !place) continue;
              const img = new fabric.Image(canvas);
              img.scale(place.displayH / Math.max(1, canvas.height || 100));
              img.set({
                left: place.left,
                top: place.top,
                originX: "center",
                originY: "center",
                selectable: false,
                evented: false,
                objectCaching: false,
              });
              groupObjects.push(img);
            }

            const oldGroup = liveFc.getObjects().find((o: any) => o.layerId === layer.id);
            if (oldGroup) liveFc.remove(oldGroup);

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
              objectCaching: true,
              dirty: true,
            });

            (doodleGroup as any).layerId = layer.id;
            (doodleGroup as any).layerType = "DOODLE_ALPHABET";
            (doodleGroup as any)._doodleFingerprint = currentFingerprint;

            liveFc.add(doodleGroup);
            return doodleGroup;
          };

          const hasGlyph = assignments.some((a) => a.imageUrl);
          if (!hasGlyph) {
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
            (fallbackText as any).layerType = "DOODLE_ALPHABET";
            (fallbackText as any)._doodleFingerprint = currentFingerprint;
            fc.add(fallbackText);
            obj = fallbackText;
          } else {
            const canvases = assignments.map((item) =>
              item.imageUrl ? getCachedTrimmedImage(item.imageUrl) || null : null
            );
            const allCached = assignments.every((item, i) => !item.imageUrl || canvases[i]);

            if (allCached) {
              const doodleGroup = commitDoodleGroup(canvases);
              if (doodleGroup) obj = doodleGroup;
            } else {
              preloadDoodleLetterImages(assignments).then(() => {
                if (doodleBuildFpRef.current[layer.id] !== currentFingerprint) return;
                const ready = assignments.map((item) =>
                  item.imageUrl ? getCachedTrimmedImage(item.imageUrl) || null : null
                );
                isUpdatingFromFabricRef.current = true;
                const doodleGroup = commitDoodleGroup(ready);
                if (doodleGroup && isSelected) {
                  const liveFc = fabricCanvasRef.current;
                  if (liveFc) liveFc.setActiveObject(doodleGroup);
                }
                fabricCanvasRef.current?.requestRenderAll();
                setTimeout(() => {
                  isUpdatingFromFabricRef.current = false;
                }, 100);
              });
            }
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
            const rx =
              maskShape === "CIRCLE"
                ? layer.width / 2
                : maskShape === "ROUNDED"
                  ? Math.min(props.borderRadius || 16, layer.width / 2, layer.height / 2)
                  : 0;
            maskObj.set({
              left: centerX,
              top: centerY,
              width: layer.width,
              height: layer.height,
              scaleX: 1,
              scaleY: 1,
              angle: layer.rotation,
              rx,
              ry: rx,
              fill: isMaskSelected ? "rgba(168, 85, 247, 0.12)" : "transparent",
              stroke: isMaskSelected ? "#9333ea" : "transparent",
              strokeWidth: isMaskSelected ? 2 : 0,
              strokeDashArray: isMaskSelected ? [6, 4] : undefined,
              selectable: !layer.isLocked,
              evented: !layer.isLocked,
              dirty: true,
            });
          }
          (maskObj as any).layerType = "MASK";
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
          (shapeObj as any).layerType = "MASK";
          (shapeObj as any).currentMaskShape = maskShape;
          (shapeObj as any).currentMaskAssetUrl = props.maskAssetUrl;
          shapeObj.set({ angle: layer.rotation });

          fc.add(shapeObj);
          obj = shapeObj;
        }
      } else if (layer.layerType === "CLIPART") {
        const instance: ClipArtInstance = {
          clipArtId: props.clipArtId || "",
          clipArtName: props.clipArtName || layer.name,
          sourceWidth: Number(props.sourceWidth) || layer.width,
          sourceHeight: Number(props.sourceHeight) || layer.height,
          groups: props.clipArtGroups || [],
          rules: props.clipArtRules || [],
        };
        const fp = `${layer.id}_${clipArtFingerprint(instance)}_${props.clipArtReloadedAt || 0}`;
        const centerX = layer.posX + layer.width / 2;
        const centerY = layer.posY + layer.height / 2;
        const opacity = props.opacity !== undefined ? Number(props.opacity) : 1;

        const applyClipArtTransform = (img: fabric.Image) => {
          const nativeW = (img as any).nativeWidth || instance.sourceWidth || 100;
          const nativeH = (img as any).nativeHeight || instance.sourceHeight || 100;
          img.set({
            left: centerX,
            top: centerY,
            originX: "center",
            originY: "center",
            angle: layer.rotation || 0,
            scaleX: layer.width / nativeW,
            scaleY: layer.height / nativeH,
            opacity,
            selectable: !layer.isLocked,
            evented: !layer.isLocked,
            lockUniScaling: true,
            objectCaching: true,
            dirty: true,
          });
          img.setControlsVisibility({
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
          img.setCoords();
        };

        const existingImg = fc.getObjects().find((o: any) => o.layerId === layer.id && o instanceof fabric.Image) as
          | fabric.Image
          | undefined;

        if (existingImg && (existingImg as any)._clipFp === fp) {
          applyClipArtTransform(existingImg);
          obj = existingImg;
        } else {
          const placeholder = existingImg
            ? existingImg
            : new fabric.Rect({
                left: centerX,
                top: centerY,
                width: layer.width,
                height: layer.height,
                fill: "rgba(16, 185, 129, 0.06)",
                stroke: "#10b981",
                strokeDashArray: [6, 4],
                originX: "center",
                originY: "center",
                angle: layer.rotation || 0,
                selectable: !layer.isLocked,
                evented: !layer.isLocked,
                objectCaching: false,
              });
          if (!existingImg) {
            (placeholder as any).layerId = layer.id;
            (placeholder as any).layerType = "CLIPART";
            fc.add(placeholder);
          } else {
            applyClipArtTransform(existingImg);
          }
          obj = placeholder as any;

          pendingAssetByLayer.set(layer.id, fp);
          (instance.groups || []).forEach((g) => {
            (g.options || []).forEach((o) => {
              if (o.assetImageUrl) void loadClipArtImage(o.assetImageUrl).catch(() => {});
            });
          });
          rasterizeClipArtFrameToCanvas(instance)
            .then((plateCanvas) => {
              if (!plateCanvas || pendingAssetByLayer.get(layer.id) !== fp) return;
              const still = layersRef.current.find((l) => l.id === layer.id);
              if (!still || still.layerType !== "CLIPART") return;
              const stillFp = `${still.id}_${clipArtFingerprint({
                clipArtId: still.properties?.clipArtId || "",
                clipArtName: still.properties?.clipArtName || still.name,
                sourceWidth: Number(still.properties?.sourceWidth) || still.width,
                sourceHeight: Number(still.properties?.sourceHeight) || still.height,
                groups: still.properties?.clipArtGroups || [],
                rules: still.properties?.clipArtRules || [],
              })}_${still.properties?.clipArtReloadedAt || 0}`;
              if (stillFp !== fp) return;

              const liveFc = fabricCanvasRef.current;
              if (!liveFc) return;
              const stale = liveFc.getObjects().find((o: any) => o.layerId === layer.id);
              if (stale) liveFc.remove(stale);
              const fabImg = new fabric.Image(plateCanvas, {
                originX: "center",
                originY: "center",
                objectCaching: true,
              });
              (fabImg as any).layerId = layer.id;
              (fabImg as any).layerType = "CLIPART";
              (fabImg as any)._clipFp = fp;
              (fabImg as any).nativeWidth = plateCanvas.width || instance.sourceWidth;
              (fabImg as any).nativeHeight = plateCanvas.height || instance.sourceHeight;
              applyClipArtTransform(fabImg);
              liveFc.add(fabImg);
              const vis = layersRef.current.filter((l) => l.isVisible);
              enforceZIndexOrder(liveFc, vis, false);
              if (selectedLayerIdsRef.current.includes(layer.id)) {
                liveFc.setActiveObject(fabImg);
              }
              scheduleFabricRender(liveFc);
            })
            .catch(() => {});
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
        let flipHFlag = Boolean(props.flipH);
        let flipVFlag = Boolean(props.flipV);
        let freeTransform = false;

        if (layer.linkedFieldId) {
          const linkedF = (fields || []).find((f) => f.id === layer.linkedFieldId);
          if (linkedF) {
            const config = linkedF.config || {};
            freeTransform = Boolean(config.freeTransform);
            if (config.isConditionOnly) {
              assetUrl = "";
            } else {
              const opts = config.options || [];
              opts.forEach((o: any) => {
                const preloadUrl = o?.assetImageUrl || o?.assetUrl;
                if (preloadUrl) void loadClipArtImage(preloadUrl).catch(() => {});
              });
              const activeOpt = opts.find((o: any) => o.id === linkedF.activeOptionId) || opts[0];
              if (activeOpt && activeOpt.isVisible !== false) {
                assetUrl = isEmptyOption(activeOpt) ? "" : activeOpt.assetImageUrl || "";
                const applyOptGeom = useOptionGeometry === "always" || freeTransform;
                if (applyOptGeom) {
                  if (activeOpt.posX !== undefined) renderPosX = activeOpt.posX;
                  if (activeOpt.posY !== undefined) renderPosY = activeOpt.posY;
                  if (activeOpt.width !== undefined) renderWidth = activeOpt.width;
                  if (activeOpt.height !== undefined) renderHeight = activeOpt.height;
                  if (activeOpt.rotation !== undefined) renderRotation = activeOpt.rotation;
                  if (activeOpt.opacity !== undefined) opacity = Number(activeOpt.opacity);
                  if (activeOpt.flipH !== undefined) flipHFlag = Boolean(activeOpt.flipH);
                  if (activeOpt.flipV !== undefined) flipVFlag = Boolean(activeOpt.flipV);
                }
              } else {
                assetUrl = "";
              }
            }
          }
        }

        const centerX = renderPosX + renderWidth / 2;
        const centerY = renderPosY + renderHeight / 2;

        const linkedMaskLayer = findLinkedMaskLayer(visibleLayers, layer);
        const maskFabObj = linkedMaskLayer
          ? fc.getObjects().find((o: any) => o.layerId === linkedMaskLayer.id)
          : undefined;
        const applyLinkedMask = (photoObj: fabric.Object) => {
          if (linkedMaskLayer && linkedMaskLayer.isVisible) {
            applyPhotoMaskClipPath(
              photoObj,
              linkedMaskLayer,
              getMaskLiveGeometry(maskFabObj, linkedMaskLayer)
            );
          } else {
            clearPhotoMaskClipPath(photoObj);
          }
        };

        if (assetUrl) {
          const isSandwichFront = props.sandwichRole === "front";
          const knockIds: string[] = Array.isArray(props.knockoutGroupIds) ? props.knockoutGroupIds : [];
          const knockParts: ClipArtPartOption[] = isSandwichFront
            ? visibleLayers
                .filter(
                  (l) =>
                    l.id !== layer.id &&
                    l.properties?.sandwichRole !== "front" &&
                    (knockIds.includes(l.linkedFieldId || "") || knockIds.includes(l.id))
                )
                .map((l) => {
                  const lf = (fields || []).find((f) => f.id === l.linkedFieldId);
                  const opts = lf?.config?.options || [];
                  const active = opts.find((o: any) => o.id === lf?.activeOptionId) || opts[0];
                  const url = isEmptyOption(active)
                    ? ""
                    : active?.assetImageUrl || l.properties?.assetUrl || "";
                  if (!url) return null;
                  return {
                    id: l.id,
                    label: l.name,
                    assetImageUrl: url,
                    relX: (lf?.config?.freeTransform && active?.posX !== undefined ? active.posX : l.posX) as number,
                    relY: lf?.config?.freeTransform && active?.posY !== undefined ? active.posY : l.posY,
                    relW: lf?.config?.freeTransform && active?.width !== undefined ? active.width : l.width,
                    relH: lf?.config?.freeTransform && active?.height !== undefined ? active.height : l.height,
                    rotation:
                      lf?.config?.freeTransform && active?.rotation !== undefined
                        ? active.rotation
                        : l.rotation || 0,
                    flipH: Boolean(
                      lf?.config?.freeTransform ? active?.flipH ?? l.properties?.flipH : l.properties?.flipH
                    ),
                    flipV: Boolean(
                      lf?.config?.freeTransform ? active?.flipV ?? l.properties?.flipV : l.properties?.flipV
                    ),
                  } as ClipArtPartOption;
                })
                .filter((p): p is ClipArtPartOption => Boolean(p))
            : [];
          const sandwichFp = isSandwichFront
            ? `${assetUrl}|${widthPx}x${heightPx}|${renderPosX},${renderPosY},${renderWidth},${renderHeight},${renderRotation},${flipHFlag},${flipVFlag}|${knockParts
                .map((k) => `${k.id}:${k.assetImageUrl}:${k.relX},${k.relY},${k.relW},${k.relH}`)
                .join(";")}`
            : "";

          void loadClipArtImage(assetUrl).catch(() => {});
          knockParts.forEach((k) => {
            if (k.assetImageUrl) void loadClipArtImage(k.assetImageUrl).catch(() => {});
          });

          const useObjectCache = !linkedMaskLayer;

          const existingImgObj = fc.getObjects().find(
            (o: any) => o.layerId === layer.id && o instanceof fabric.Image
          ) as fabric.Image | undefined;

          if (
            existingImgObj &&
            (isSandwichFront
              ? (existingImgObj as any)._sandwichFp === sandwichFp
              : (existingImgObj as any).assetUrl === assetUrl)
          ) {
            restoreRawPhotoElement(existingImgObj);
            const currentW = (existingImgObj as any).nativeWidth || existingImgObj.width || 100;
            const currentH = (existingImgObj as any).nativeHeight || existingImgObj.height || 100;
            if (isSandwichFront) {
              existingImgObj.set({
                left: widthPx / 2,
                top: heightPx / 2,
                originX: "center",
                originY: "center",
                angle: 0,
                scaleX: widthPx / currentW,
                scaleY: heightPx / currentH,
                opacity,
                selectable: false,
                evented: false,
                lockUniScaling: true,
                objectCaching: true,
                dirty: true,
              });
            } else {
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
              flipX: flipHFlag,
              flipY: flipVFlag,
              opacity: opacity,
              selectable: !layer.isLocked,
              evented: !layer.isLocked,
              lockUniScaling: !freeTransform,
              objectCaching: useObjectCache,
              dirty: true,
            });
            }
            applyLinkedMask(existingImgObj);
            existingImgObj.setControlsVisibility({
              mt: freeTransform,
              mb: freeTransform,
              ml: freeTransform,
              mr: freeTransform,
              tl: true,
              tr: true,
              bl: true,
              br: true,
              mtr: true,
            });
            existingImgObj.setCoords();
            obj = existingImgObj;
          } else if (isSandwichFront) {
            pendingAssetByLayer.set(layer.id, sandwichFp);
            rasterizePunchedPlate({
              width: widthPx,
              height: heightPx,
              plate: {
                id: layer.id,
                label: layer.name,
                assetImageUrl: assetUrl,
                relX: renderPosX,
                relY: renderPosY,
                relW: renderWidth,
                relH: renderHeight,
                rotation: renderRotation,
                flipH: flipHFlag,
                flipV: flipVFlag,
              },
              knockouts: knockParts,
            })
              .then((plateCanvas) => {
                if (!fc || !plateCanvas || pendingAssetByLayer.get(layer.id) !== sandwichFp) return;
                const oldObj = fc.getObjects().find((o: any) => o.layerId === layer.id);
                if (oldObj) fc.remove(oldObj);
                const nativeW = plateCanvas.width || widthPx;
                const nativeH = plateCanvas.height || heightPx;
                const fabricImg = new fabric.Image(plateCanvas, {
                  left: widthPx / 2,
                  top: heightPx / 2,
                  originX: "center",
                  originY: "center",
                  angle: 0,
                  scaleX: widthPx / nativeW,
                  scaleY: heightPx / nativeH,
                  opacity,
                  selectable: false,
                  evented: false,
                  lockUniScaling: true,
                  objectCaching: true,
                  dirty: true,
                });
                (fabricImg as any).layerId = layer.id;
                (fabricImg as any).assetUrl = assetUrl;
                (fabricImg as any)._sandwichFp = sandwichFp;
                (fabricImg as any).nativeWidth = nativeW;
                (fabricImg as any).nativeHeight = nativeH;
                fc.add(fabricImg);
                const currentLayers = layersRef.current || visibleLayers;
                enforceZIndexOrder(fc, currentLayers, false);
                scheduleFabricRender(fc);
              })
              .catch(() => {});
          } else {
            pendingAssetByLayer.set(layer.id, assetUrl);
            loadClipArtImage(assetUrl)
              .then((imgEl) => {
                if (!fc || pendingAssetByLayer.get(layer.id) !== assetUrl) return;
                const nativeW = imgEl.naturalWidth || imgEl.width || renderWidth;
                const nativeH = imgEl.naturalHeight || imgEl.height || renderHeight;

                const oldObj = fc.getObjects().find((o: any) => o.layerId === layer.id);
                if (oldObj) fc.remove(oldObj);

                const currentLayers = layersRef.current || visibleLayers;
                const freshLinkedMaskLayer = findLinkedMaskLayer(currentLayers, layer);
                const freshMaskFab = freshLinkedMaskLayer
                  ? fc.getObjects().find((o: any) => o.layerId === freshLinkedMaskLayer.id)
                  : undefined;

                const baseScaleX = renderWidth / nativeW;
                const baseScaleY = renderHeight / nativeH;

                const fabricImg = new fabric.Image(imgEl, {
                  left: centerX,
                  top: centerY,
                  originX: "center",
                  originY: "center",
                  angle: renderRotation,
                  scaleX: baseScaleX,
                  scaleY: baseScaleY,
                  flipX: flipHFlag,
                  flipY: flipVFlag,
                  opacity: opacity,
                  selectable: !layer.isLocked,
                  evented: !layer.isLocked,
                  lockUniScaling: !freeTransform,
                  objectCaching: !freshLinkedMaskLayer,
                  dirty: true,
                });

              fabricImg.setControlsVisibility({
                mt: freeTransform,
                mb: freeTransform,
                ml: freeTransform,
                mr: freeTransform,
                tl: true,
                tr: true,
                bl: true,
                br: true,
                mtr: true,
              });

              (fabricImg as any).layerId = layer.id;
              (fabricImg as any).assetUrl = assetUrl;
              (fabricImg as any)._rawImageElement = imgEl;
              (fabricImg as any)._isClippedCanvas = false;
              (fabricImg as any).nativeWidth = nativeW;
              (fabricImg as any).nativeHeight = nativeH;

              if (freshLinkedMaskLayer && freshLinkedMaskLayer.isVisible) {
                applyPhotoMaskClipPath(
                  fabricImg,
                  freshLinkedMaskLayer,
                  getMaskLiveGeometry(freshMaskFab, freshLinkedMaskLayer)
                );
              }

              fc.add(fabricImg);
              if (selectedLayerId === layer.id) fc.setActiveObject(fabricImg);
              enforceZIndexOrder(fc, currentLayers, false);
              scheduleFabricRender(fc);
              })
              .catch((err) => {
                console.error("Failed to load canvas asset image:", assetUrl, err);
              });
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
              subTargetCheck: false,
              objectCaching: false,
              dirty: true,
            });
            (frameRect as any).layerId = layer.id;
            applyLinkedMask(frameRect);

            fc.add(frameRect);
            obj = frameRect;
          }
        }
      }

      if (obj) {
        activeObjects.push(obj);
      }
    });

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
      applyFabricMultiSelection(fc, layers, fields, selectedLayerIdsRef.current);
    }

    fc.renderAll();
    setTimeout(() => {
      isUpdatingFromFabricRef.current = false;
    }, 50);
  }, [layers, fields, widthPx, heightPx, onSelectLayer, onSelectLayers, isPreviewMode, maskCacheVersion, useOptionGeometry, doodlePacks]);

  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc || Boolean((fc as any)._currentTransform)) return;
    if (isPreviewMode) return;
    isUpdatingFromFabricRef.current = true;
    applyFabricMultiSelection(fc, layersRef.current, fieldsRef.current, selectedLayerIds);
    fc.requestRenderAll();
    const t = window.setTimeout(() => {
      isUpdatingFromFabricRef.current = false;
    }, 50);
    return () => window.clearTimeout(t);
  }, [selectedLayerIds, isPreviewMode]);

  return (
    <div className={`w-full h-full min-h-full bg-slate-200/70 overflow-auto p-4 relative select-none flex flex-col ${onResizeCanvas && !isPreviewMode && frameResizeMode ? "pb-12" : ""}`}>
      {/* STOREFRONT PREVIEW BADGE */}
      {isPreviewMode && (
        <div className="absolute top-4 right-6 z-30 bg-amber-500 text-white font-bold text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 tracking-wide animate-pulse">
          <Eye className="w-4 h-4" />
          <span>Storefront Preview Mode</span>
        </div>
      )}

      {/* CANVAS CONTAINER */}
      <div
        ref={containerRef}
        className={`relative m-auto shrink-0 ${draftFrame ? "" : "transition-all duration-150 ease-out"}`}
        style={{
          width: frameW * zoom,
          height: frameH * zoom,
        }}
      >
        <div
          className={`absolute inset-0 overflow-hidden rounded-lg border shadow-2xl ${
            draftFrame || frameResizeMode ? "border-indigo-500 border-2" : "border-slate-300"
          }`}
          style={{ backgroundColor: workspaceBgColor || "#ffffff" }}
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

          {/* FABRIC.JS HTML5 CANVAS STAGE — always original size so resize never scales layers */}
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

        {onResizeCanvas && !isPreviewMode && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFrameResizeMode((on) => !on);
              }}
              title={frameResizeMode ? "Done resizing frame" : "Resize studio frame"}
              className={`absolute -top-3 -right-3 z-50 w-8 h-8 rounded-full border shadow-md flex items-center justify-center cursor-pointer ${
                frameResizeMode
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300"
              }`}
            >
              <Scaling className="w-4 h-4" />
            </button>
            {frameResizeMode && (
              <>
                {FRAME_HANDLES.map((h) => (
                  <div
                    key={h.edge}
                    role="separator"
                    aria-label={`Resize canvas ${h.edge}`}
                    title="Drag to resize studio frame (Shift = lock ratio)"
                    onPointerDown={(e) => beginFrameResize(h.edge, e)}
                    className={`absolute z-40 bg-white border-2 border-indigo-500 rounded-sm shadow-sm hover:bg-indigo-50 ${h.className}`}
                    style={{ cursor: h.cursor, touchAction: "none" }}
                  />
                ))}
                <div className="absolute left-1/2 -bottom-8 -translate-x-1/2 z-40 pointer-events-none">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[11px] font-bold font-mono shadow">
                    {Math.round(frameW)} × {Math.round(frameH)} px
                  </span>
                </div>
              </>
            )}
          </>
        )}
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
  return loadClipArtImage(url);
}

function isMaskGuideObject(obj: any): boolean {
  return obj?.layerType === "MASK" || Boolean(obj?.photoGuideForMaskId);
}

function hideMaskGuides(fc: fabric.Canvas): fabric.Object[] {
  const hidden: fabric.Object[] = [];
  fc.getObjects().forEach((obj: any) => {
    if (isMaskGuideObject(obj) && obj.visible !== false) {
      hidden.push(obj);
      obj.visible = false;
    }
  });
  return hidden;
}

function restoreMaskGuides(hidden: fabric.Object[]) {
  hidden.forEach((obj) => {
    obj.visible = true;
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
      const hiddenGuides = hideMaskGuides(fc);
      try {
        fc.getObjects().forEach((obj) => {
          if (obj instanceof fabric.Group) {
            const frameRect = obj.getObjects()[0];
            if (frameRect) frameRect.set({ stroke: "transparent" });
            obj.set({ dirty: true });
          }
        });
        fc.renderAll();

        fabricDataUrl = fc.toDataURL({
          format: "png",
          multiplier: scaleMultiplier,
        });
      } finally {
        restoreMaskGuides(hiddenGuides);
      }
      fc.getObjects().forEach((obj) => {
        if (obj instanceof fabric.Group) {
          const frameRect = obj.getObjects()[0];
          if (frameRect) frameRect.set({ stroke: "rgba(79, 70, 229, 0.35)" });
          obj.set({ dirty: true });
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

/**
 * Export High-Resolution PNG for Active Screen and Trigger Save File Dialog
 */
export async function exportActiveScreenPNG(
  widthPx: number,
  heightPx: number,
  layers: CanvasLayerItem[],
  bgUrl?: string | null,
  screenName: string = "Screen",
  fabricCanvasInstance?: fabric.Canvas | null
): Promise<void> {
  if (typeof window === "undefined") return;

  const fc = fabricCanvasInstance || globalActiveFabricCanvas;
  let fabricDataUrl = "";

  if (fc) {
    try {
      // 1. Temporarily remember active object & hide frame borders & set background to transparent for export
      const activeObjBeforeExport = fc.getActiveObject();
      const origBgColor = fc.backgroundColor;

      fc.discardActiveObject();
      fc.backgroundColor = "transparent";
      const hiddenGuides = hideMaskGuides(fc);
      try {
        fc.getObjects().forEach((obj) => {
          if (obj instanceof fabric.Group) {
            const frameRect = obj.getObjects()[0];
            if (frameRect) frameRect.set({ stroke: "transparent" });
            obj.set({ dirty: true });
          }
        });
        fc.renderAll();

        fabricDataUrl = fc.toDataURL({
          format: "png",
          multiplier: 1.0,
        });
      } finally {
        restoreMaskGuides(hiddenGuides);
        fc.backgroundColor = origBgColor;
      }
      fc.getObjects().forEach((obj) => {
        if (obj instanceof fabric.Group) {
          const frameRect = obj.getObjects()[0];
          if (frameRect) {
            frameRect.set({
              stroke: (obj as any).layerType === "DOODLE_ALPHABET" ? "#9333ea" : "rgba(79, 70, 229, 0.35)",
            });
          }
          obj.set({ dirty: true });
        }
      });
      if (activeObjBeforeExport) {
        fc.setActiveObject(activeObjBeforeExport);
      }
      fc.renderAll();
    } catch (e) {
      console.warn("Fabric toDataURL export error:", e);
    }
  }

  // Create composite canvas at 100% full original resolution (widthPx x heightPx)
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Clear context to ensure 100% transparent alpha channel
  ctx.clearRect(0, 0, widthPx, heightPx);

  // Draw Background Image if present
  if (bgUrl) {
    try {
      const bgImg = await loadImagePromise(bgUrl);
      ctx.drawImage(bgImg, 0, 0, widthPx, heightPx);
    } catch (e) {}
  }

  // Draw Fabric Objects PNG on top of background
  if (fabricDataUrl) {
    try {
      const fabricImg = await loadImagePromise(fabricDataUrl);
      ctx.drawImage(fabricImg, 0, 0, widthPx, heightPx);
    } catch (e) {}
  }

  // Trigger Save File Download in browser
  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  const sanitizeName = screenName.replace(/[^a-zA-Z0-9_-]/g, "_");
  link.download = `${sanitizeName}_${Date.now()}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
