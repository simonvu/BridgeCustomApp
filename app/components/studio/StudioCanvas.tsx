import React, { useEffect, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import { ZoomIn, ZoomOut, RotateCcw, Grid, Eye } from "lucide-react";
import { ensureFontLoaded, FontItem } from "../../utils/fontLoader";

export interface CanvasLayerItem {
  id: string;
  name: string;
  layerType: "BACKGROUND" | "ASSET" | "TEXT" | "PHOTO_UPLOAD" | "OVERLAY";
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
  properties?: any; // { text, font, color, assetUrl, alignment... }
  linkedFieldId?: string;
}

interface StudioCanvasProps {
  widthPx: number;
  heightPx: number;
  layers: CanvasLayerItem[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onUpdateLayer: (layerId: string, updatedProps: Partial<CanvasLayerItem>) => void;
  bgUrl?: string | null;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  showGrid?: boolean;
  isPreviewMode?: boolean;
  onToggleGrid?: () => void;
  fonts?: FontItem[];
}

/**
 * Creates Mathematically Symmetrical Bezier Curve Path for Fabric.js Text-on-Path
 * Guarantees pathOffset = (0, 0) for zero rendering matrix error and 100% horizontal symmetry
 */
function createFabricCurvePath(
  containerWidth: number,
  containerHeight: number,
  curveAngleDeg: number
): fabric.Path | null {
  if (!curveAngleDeg || Math.abs(curveAngleDeg) < 2) return null;

  const angleDeg = Math.max(-360, Math.min(360, curveAngleDeg));
  const isSmile = angleDeg > 0;
  const halfW = Math.max(20, containerWidth / 2);
  
  // Calculate Sagitta H (dip height), allowing rich intense curvature up to 1.2x container height or halfW
  const maxSagitta = Math.max(containerHeight * 1.2, halfW * 1.0);
  const sagitta = (Math.abs(angleDeg) / 360) * maxSagitta;

  // Smile: endpoints at -sagitta/2, control point at +sagitta/2 (minY = -sagitta/2, maxY = +sagitta/2 -> pathOffset.y = 0)
  // Arch: endpoints at +sagitta/2, control point at -sagitta/2 (minY = -sagitta/2, maxY = +sagitta/2 -> pathOffset.y = 0)
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
  isAutoFit: boolean = true
): number {
  if (!isAutoFit || !textStr || containerWidth <= 0) return baseFontSize;
  try {
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return baseFontSize;
    tempCtx.font = `${baseFontSize}px "${fontFamily}", sans-serif`;
    const measuredWidth = tempCtx.measureText(textStr).width;
    if (measuredWidth > containerWidth) {
      const scaleFactor = containerWidth / measuredWidth;
      const fitSize = Math.floor(baseFontSize * scaleFactor);
      return Math.max(6, fitSize); // minimum legible font size 6px
    }
  } catch (e) {}
  return baseFontSize;
}

export default function StudioCanvas({
  widthPx,
  heightPx,
  layers,
  selectedLayerId,
  onSelectLayer,
  onUpdateLayer,
  bgUrl,
  zoom: propZoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  showGrid: propShowGrid,
  isPreviewMode = false,
  onToggleGrid,
  fonts = [],
}: StudioCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const isUpdatingFromFabricRef = useRef(false);
  const pendingFrameUpdatesRef = useRef<{ [layerId: string]: { posX: number; posY: number; width: number; height: number } }>({});

  const [internalZoom, setInternalZoom] = useState(1);
  const [internalShowGrid, setInternalShowGrid] = useState(true);

  const zoom = propZoom !== undefined ? propZoom : internalZoom;
  const showGrid = propShowGrid !== undefined ? propShowGrid : internalShowGrid;

  const setZoom = useCallback((action: number | ((prev: number) => number)) => {
    setInternalZoom(action);
  }, []);

  // Global Event Listener when ANY font finishes downloading in browser
  useEffect(() => {
    const handleFontLoaded = (e: any) => {
      const fc = fabricCanvasRef.current;
      if (!fc) return;

      const loadedFamily = e.detail?.fontFamily;
      fc.getObjects().forEach((obj) => {
        if (obj instanceof fabric.Group) {
          obj.set({ dirty: true });
          const textChild = obj.getObjects()[1] as fabric.Text;
          if (textChild && (!loadedFamily || textChild.fontFamily === loadedFamily)) {
            textChild.set({ dirty: true, objectCaching: false });
            textChild.initDimensions();
          }
        }
      });
      fc.renderAll();
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

      if (target instanceof fabric.Group) {
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
          const layerItem = layers.find((l) => l.id === target.layerId);
          const props = layerItem?.properties || {};
          const isAutoFit = props.autoFit !== false;
          const baseFontSize = Number(props.fontSize) || 36;
          const fontFamily = props.fontFamily || "Roboto";
          const textStr = textObj.text || layerItem?.name || "";
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
      if (!target || !target.layerId) return;

      isUpdatingFromFabricRef.current = true;
      const layerId = target.layerId;
      const scaleX = target.scaleX || 1;
      const scaleY = target.scaleY || 1;

      let newWidth = 0;
      let newHeight = 0;

      if (target instanceof fabric.Image) {
        const nativeW = target.getElement()?.width || target.width || 100;
        const nativeH = target.getElement()?.height || target.height || 100;
        newWidth = Math.round(nativeW * scaleX);
        newHeight = Math.round(nativeH * scaleY);
      } else {
        newWidth = Math.round((target.width || 100) * scaleX);
        newHeight = Math.round((target.height || 100) * scaleY);
      }

      const newPosX = Math.round((target.left || 0) - newWidth / 2);
      const newPosY = Math.round((target.top || 0) - newHeight / 2);
      const newRotation = Math.round(target.angle || 0);

      if (target instanceof fabric.Group) {
        target.set({
          scaleX: 1,
          scaleY: 1,
          width: newWidth,
          height: newHeight,
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
          const layerItem = layers.find((l) => l.id === target.layerId);
          const props = layerItem?.properties || {};
          const isAutoFit = props.autoFit !== false;
          const baseFontSize = Number(props.fontSize) || 36;
          const fontFamily = props.fontFamily || "Roboto";
          const textStr = textObj.text || layerItem?.name || "";
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

      onUpdateLayer(layerId, {
        posX: newPosX,
        posY: newPosY,
        width: newWidth,
        height: newHeight,
        rotation: newRotation,
      });

      setTimeout(() => {
        isUpdatingFromFabricRef.current = false;
      }, 50);
    };

    // Handle Selection Events
    const handleSelectionCreated = (e: any) => {
      const selected = e.selected?.[0];
      if (selected && selected.layerId) {
        onSelectLayer(selected.layerId);
      }
    };

    const handleSelectionCleared = () => {
      onSelectLayer(null);
    };

    // Handle Live Drag/Scale Transformations (Realtime 60fps Fabric rendering & dynamic clipPath sync)
    const handleLiveTransform = (e: any) => {
      const target = e.target;
      if (!target || !target.layerId) return;

      const targetLayer = layers.find((l) => l.id === target.layerId);
      if (targetLayer && targetLayer.layerType === "MASK") {
        const scaleX = target.scaleX || 1;
        const scaleY = target.scaleY || 1;

        const newW = Math.max(10, Math.round((target.width || 100) * scaleX));
        const newH = Math.max(10, Math.round((target.height || 100) * scaleY));
        const newX = Math.round((target.left || 0) - newW / 2);
        const newY = Math.round((target.top || 0) - newH / 2);

        // Find linked Photo Upload object on canvas
        const photoObj = fabricCanvas.getObjects().find((o: any) => {
          if (!o.layerId) return false;
          const l = layers.find((item) => item.id === o.layerId);
          return l && (l.maskLayerId === targetLayer.id || l.id === targetLayer.parentPhotoUploadId);
        });

        if (photoObj && photoObj.clipPath) {
          photoObj.clipPath.set({
            left: newX,
            top: newY,
            width: newW,
            height: newH,
            originX: "left",
            originY: "top",
          });
          photoObj.clipPath.setCoords();
          photoObj.dirty = true;
          fabricCanvas.requestRenderAll();
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
    if (!fc || isUpdatingFromFabricRef.current) return;

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

      const centerX = layer.posX + layer.width / 2;
      const centerY = layer.posY + layer.height / 2;

      if (layer.layerType === "TEXT") {
        const rawTextStr = props.text !== undefined ? props.text : layer.name;
        const textStr = applyTextCase(rawTextStr, props.textCase);
        const font = props.fontFamily || "Roboto";
        const fontWeight = props.fontWeight || "normal";
        const baseFontSize = Number(props.fontSize) || 36;
        const isAutoFit = props.autoFit !== false;
        const fontSize = getFitFontSize(textStr, font, baseFontSize, layer.width, isAutoFit);
        const opacity = props.opacity !== undefined ? Number(props.opacity) : 1;
        const strokeWidth = Number(props.strokeWidth) || 0;
        const curveAngle = Number(props.curveAngle) || 0;
        const hAlign = props.align || "center";
        const vAlign = props.verticalAlign || "middle";

        // Ensure font is loaded into browser memory and trigger instant redraw
        ensureFontLoaded(font, fonts).then((loaded) => {
          if (loaded && fc) {
            document.fonts.ready.then(() => {
              if (obj && obj instanceof fabric.Group) {
                const textChild = obj.getObjects()[1] as fabric.Text;
                if (textChild) {
                  textChild.set({ fontFamily: font, dirty: true });
                  textChild.initDimensions();
                }
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

        const curvePath = createFabricCurvePath(layer.width, layer.height, curveAngle);
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

        // Frame Container Rect (exact layer.width x layer.height)
        const frameRect = new fabric.Rect({
          width: layer.width,
          height: layer.height,
          fill: "transparent",
          stroke: "rgba(79, 70, 229, 0.35)",
          strokeWidth: 1,
          strokeDashArray: [4, 4],
          originX: "center",
          originY: "center",
        });

        // Calculate alignment coordinates inside frame container
        let textX = 0;
        let textY = 0;
        let fabricOriginX: any = "center";
        let fabricOriginY: any = "center";

        if (!curvePath) {
          if (hAlign === "left") textX = -layer.width / 2;
          else if (hAlign === "right") textX = layer.width / 2;

          if (vAlign === "top") textY = -layer.height / 2;
          else if (vAlign === "bottom") textY = layer.height / 2;

          fabricOriginX = hAlign === "left" ? "left" : hAlign === "right" ? "right" : "center";
          fabricOriginY = vAlign === "top" ? "top" : vAlign === "bottom" ? "bottom" : "center";
        }

        const textObj = new fabric.Text(textStr, {
          left: textX,
          top: textY,
          originX: fabricOriginX,
          originY: fabricOriginY,
          fontFamily: font,
          fontWeight: fontWeight,
          fontSize: fontSize,
          fill: fillStyle,
          stroke: strokeWidth > 0 ? (props.strokeColor || "#000000") : undefined,
          strokeWidth: strokeWidth,
          opacity: opacity,
          shadow: shadowObj,
          path: curvePath || undefined,
          pathStartOffset: curvePath ? pathStartOffset : 0,
          objectCaching: false,
          dirty: true,
        });

        if (obj) {
          fc.remove(obj);
        }

        obj = new fabric.Group([frameRect, textObj], {
          left: centerX,
          top: centerY,
          originX: "center",
          originY: "center",
          angle: layer.rotation,
          width: layer.width,
          height: layer.height,
          selectable: !layer.isLocked,
          subTargetCheck: false,
          objectCaching: false,
          dirty: true,
        });
        (obj as any).layerId = layer.id;
        fc.add(obj);
      } else if (layer.layerType === "MASK") {
        const maskShape = props.maskShape || "RECTANGLE";
        const rx = maskShape === "CIRCLE" ? layer.width / 2 : maskShape === "ROUNDED" ? 16 : 4;
        const ry = maskShape === "CIRCLE" ? layer.height / 2 : maskShape === "ROUNDED" ? 16 : 4;

        let maskObj = fc.getObjects().find((o: any) => o.layerId === layer.id);
        if (maskObj) {
          maskObj.set({
            left: centerX,
            top: centerY,
            width: layer.width,
            height: layer.height,
            angle: layer.rotation,
            selectable: !layer.isLocked,
            evented: !layer.isLocked,
          });
          maskObj.setCoords();
          obj = maskObj;
        } else {
          const frameRect = new fabric.Rect({
            width: layer.width,
            height: layer.height,
            fill: "rgba(168, 85, 247, 0.12)",
            stroke: "#9333ea",
            strokeWidth: 2,
            strokeDashArray: [6, 4],
            originX: "center",
            originY: "center",
            rx,
            ry,
          });

          const placeholderText = new fabric.Text(`🎭 ${layer.name}\n(${layer.width}×${layer.height}px)`, {
            originX: "center",
            originY: "center",
            fontSize: 12,
            fill: "#7e22ce",
            fontFamily: "sans-serif",
            fontWeight: "bold",
            textAlign: "center",
          });

          obj = new fabric.Group([frameRect, placeholderText], {
            left: centerX,
            top: centerY,
            originX: "center",
            originY: "center",
            angle: layer.rotation,
            width: layer.width,
            height: layer.height,
            selectable: !layer.isLocked,
            lockUniScaling: false,
            subTargetCheck: false,
            objectCaching: false,
            dirty: true,
          });
          (obj as any).layerId = layer.id;
          fc.add(obj);
        }
      } else if (
        layer.layerType === "ASSET" ||
        layer.layerType === "OVERLAY" ||
        layer.layerType === "PHOTO_UPLOAD"
      ) {
        const assetUrl = props.assetUrl;
        const opacity = props.opacity !== undefined ? Number(props.opacity) : 1;

        // Check if this PHOTO_UPLOAD layer has a linked child MASK layer
        const linkedMaskLayer = visibleLayers.find(
          (l) => l.id === layer.maskLayerId || (l.layerType === "MASK" && l.parentPhotoUploadId === layer.id)
        );

        let clipMask: fabric.Object | undefined = undefined;
        if (linkedMaskLayer && linkedMaskLayer.isVisible) {
          const mProps = linkedMaskLayer.properties || {};
          const mShape = mProps.maskShape || "RECTANGLE";
          const mRx = mShape === "CIRCLE" ? linkedMaskLayer.width / 2 : mShape === "ROUNDED" ? 16 : 4;
          const mRy = mShape === "CIRCLE" ? linkedMaskLayer.height / 2 : mShape === "ROUNDED" ? 16 : 4;

          clipMask = new fabric.Rect({
            left: linkedMaskLayer.posX,
            top: linkedMaskLayer.posY,
            width: linkedMaskLayer.width,
            height: linkedMaskLayer.height,
            originX: "left",
            originY: "top",
            rx: mRx,
            ry: mRy,
            absolutePositioned: true,
          });
        }

        if (assetUrl) {
          const existingImgObj = fc.getObjects().find(
            (o: any) => o.layerId === layer.id && o instanceof fabric.Image && (o as any).assetUrl === assetUrl
          ) as fabric.Image | undefined;

          if (existingImgObj) {
            const nativeW = (existingImgObj as any).nativeWidth || 100;
            const nativeH = (existingImgObj as any).nativeHeight || 100;

            const baseScaleX = layer.width / nativeW;
            const baseScaleY = layer.height / nativeH;

            existingImgObj.set({
              left: centerX,
              top: centerY,
              originX: "center",
              originY: "center",
              angle: layer.rotation,
              scaleX: baseScaleX,
              scaleY: baseScaleY,
              opacity: opacity,
              selectable: !layer.isLocked,
              evented: !layer.isLocked,
              clipPath: clipMask,
            });
            existingImgObj.setCoords();
            obj = existingImgObj;
          } else {
            const imgEl = new Image();
            imgEl.crossOrigin = "anonymous";
            imgEl.src = assetUrl;
            imgEl.onload = () => {
              if (!fc) return;
              const nativeW = imgEl.naturalWidth || imgEl.width || layer.width;
              const nativeH = imgEl.naturalHeight || imgEl.height || layer.height;

              const oldObj = fc.getObjects().find((o: any) => o.layerId === layer.id);
              if (oldObj) fc.remove(oldObj);

              const baseScaleX = layer.width / nativeW;
              const baseScaleY = layer.height / nativeH;

              const fabricImg = new fabric.Image(imgEl, {
                left: centerX,
                top: centerY,
                originX: "center",
                originY: "center",
                angle: layer.rotation,
                scaleX: baseScaleX,
                scaleY: baseScaleY,
                opacity: opacity,
                selectable: !layer.isLocked,
                evented: !layer.isLocked,
                lockUniScaling: false,
                clipPath: clipMask,
                objectCaching: false,
                dirty: true,
              });

              (fabricImg as any).layerId = layer.id;
              (fabricImg as any).assetUrl = assetUrl;
              (fabricImg as any).nativeWidth = nativeW;
              (fabricImg as any).nativeHeight = nativeH;

              fc.add(fabricImg);
              if (selectedLayerId === layer.id) fc.setActiveObject(fabricImg);

              fc.requestRenderAll();
            };
          }
        } else {
          // Placeholder Frame & Text for empty Image or Photo Upload Layer
          const isPhotoUpload = layer.layerType === "PHOTO_UPLOAD";
          const maskShape = props.maskShape || "RECTANGLE";

          const rx = maskShape === "CIRCLE" ? layer.width / 2 : maskShape === "ROUNDED" ? 16 : 4;
          const ry = maskShape === "CIRCLE" ? layer.height / 2 : maskShape === "ROUNDED" ? 16 : 4;

          const frameRect = new fabric.Rect({
            width: layer.width,
            height: layer.height,
            fill: isPhotoUpload ? "rgba(254, 243, 199, 0.25)" : "rgba(240, 253, 244, 0.5)",
            stroke: isPhotoUpload ? "#d97706" : "#059669",
            strokeWidth: isPhotoUpload ? 2 : 1.5,
            strokeDashArray: isPhotoUpload ? [8, 5] : [6, 6],
            originX: "center",
            originY: "center",
            rx,
            ry,
          });

          const labelStr = isPhotoUpload
            ? `📷 ${props.fieldLabel || "Photo Upload Area"}\n(${layer.width}×${layer.height}px)`
            : "📷 Click to select Image Asset";

          const placeholderText = new fabric.Text(labelStr, {
            originX: "center",
            originY: "center",
            fontSize: isPhotoUpload ? 13 : 12,
            fill: isPhotoUpload ? "#b45309" : "#059669",
            fontFamily: "sans-serif",
            fontWeight: "bold",
            textAlign: "center",
          });

          if (obj) fc.remove(obj);

          obj = new fabric.Group([frameRect, placeholderText], {
            left: centerX,
            top: centerY,
            originX: "center",
            originY: "center",
            angle: layer.rotation,
            width: layer.width,
            height: layer.height,
            selectable: !layer.isLocked,
            lockUniScaling: false,
            clipPath: clipMask,
            subTargetCheck: false,
            objectCaching: false,
            dirty: true,
          });
          (obj as any).layerId = layer.id;

          // Hide middle side handles (ml, mt, mr, mb)
          obj.setControlVisible("ml", false);
          obj.setControlVisible("mt", false);
          obj.setControlVisible("mr", false);
          obj.setControlVisible("mb", false);

          fc.add(obj);
        }
      }

      if (obj) {
        activeObjects.push(obj);
        // Sync active selection highlight
        if (selectedLayerId === layer.id && fc.getActiveObject() !== obj) {
          fc.setActiveObject(obj);
        }
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
            width: linkedPhotoLayer.width,
            height: linkedPhotoLayer.height,
            fill: "rgba(239, 68, 68, 0.03)",
            stroke: "#ef4444",
            strokeWidth: 2,
            strokeDashArray: [6, 4],
            originX: "center",
            originY: "center",
          });

          const guideText = new fabric.Text(
            `📷 Full Photo Bounds (${linkedPhotoLayer.width}×${linkedPhotoLayer.height}px)`,
            {
              fontSize: 11,
              fill: "#dc2626",
              fontFamily: "sans-serif",
              fontWeight: "bold",
              originX: "center",
              originY: "center",
            }
          );

          guideObj = new fabric.Group([guideRect, guideText], {
            left: photoCenterX,
            top: photoCenterY,
            originX: "center",
            originY: "center",
            angle: linkedPhotoLayer.rotation,
            selectable: false,
            evented: false,
            objectCaching: false,
          });
          (guideObj as any).photoGuideForMaskId = selectedLayerItem.id;
          fc.add(guideObj);
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
  }, [layers, selectedLayerId, widthPx, heightPx, onSelectLayer, isPreviewMode]);

  return (
    <div className="w-full h-full min-h-full bg-slate-200/70 overflow-auto p-8 relative select-none flex flex-col">
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
        className="relative bg-white shadow-2xl rounded-lg overflow-hidden border border-slate-300 transition-transform duration-100 ease-out m-auto shrink-0"
        style={{
          width: widthPx * zoom,
          height: heightPx * zoom,
        }}
      >
        {/* CHECKERBOARD TRANSPARENT BACKGROUND */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(#cbd5e1 1px, transparent 1px), radial-gradient(#cbd5e1 1px, #ffffff 1px)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 10px 10px",
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

        {/* ALIGNMENT GRID OVERLAY (Suppressed in Preview Mode!) */}
        {showGrid && !isPreviewMode && (
          <div
            className="absolute inset-0 pointer-events-none z-10 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(to right, #3b82f6 1px, transparent 1px), linear-gradient(to bottom, #3b82f6 1px, transparent 1px)",
              backgroundSize: "50px 50px",
            }}
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
      // 1. Temporarily deselect object & hide blue dashed frame borders for thumbnail export
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

      // 3. Restore blue dashed frame borders
      fc.getObjects().forEach((obj) => {
        if (obj instanceof fabric.Group) {
          const frameRect = obj.getObjects()[0];
          if (frameRect) frameRect.set({ stroke: "rgba(79, 70, 229, 0.35)" });
        }
      });
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
