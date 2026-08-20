import React, { useEffect, useRef, useState, useCallback } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Grid } from "lucide-react";

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
  showGrid?: boolean;
}

/**
 * Professional Text Layer Renderer for HTML5 Canvas
 */
export function drawTextLayerToCanvas(ctx: CanvasRenderingContext2D, layer: CanvasLayerItem) {
  const textProps = layer.properties || {};
  const font = textProps.fontFamily || "Roboto";
  const text = textProps.text !== undefined ? textProps.text : layer.name;
  const opacity = textProps.opacity !== undefined ? Number(textProps.opacity) : 1;
  const autoFit = textProps.autoFit !== false;
  
  const hAlign = (textProps.align || "center") as CanvasTextAlign; // "left" | "center" | "right"
  const vAlign = textProps.verticalAlign || "middle"; // "top" | "middle" | "bottom"

  // 1. Calculate Opacity
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

  // 2. Base Font Size & Auto-Fit Calculation
  const fontWeight = textProps.fontWeight || (textProps.isBold ? "bold" : "normal");
  let fontSize = Number(textProps.fontSize) || 36;
  if (autoFit && layer.width > 0 && text) {
    ctx.font = `${fontWeight} ${fontSize}px "${font}", sans-serif`;
    const textWidth = ctx.measureText(text).width;
    if (textWidth > layer.width) {
      fontSize = Math.max(8, Math.floor((fontSize * layer.width) / textWidth));
    }
  }

  ctx.font = `${fontWeight} ${fontSize}px "${font}", sans-serif`;

  // 3. Calculate Text Placement Coordinates inside Frame Box
  let textX = 0;
  if (hAlign === "left") textX = -layer.width / 2;
  else if (hAlign === "right") textX = layer.width / 2;
  else textX = 0;

  let textY = 0;
  if (vAlign === "top") textY = -layer.height / 2;
  else if (vAlign === "bottom") textY = layer.height / 2;
  else textY = 0;

  ctx.textAlign = hAlign;
  ctx.textBaseline = vAlign === "top" ? "top" : vAlign === "bottom" ? "bottom" : "middle";

  // 4. Drop Shadow Configuration
  const shadowBlur = Number(textProps.shadowBlur) || 0;
  const shadowOffsetX = Number(textProps.shadowOffsetX) || 0;
  const shadowOffsetY = Number(textProps.shadowOffsetY) || 0;

  if (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0) {
    ctx.shadowColor = textProps.shadowColor || "rgba(0,0,0,0.5)";
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = shadowOffsetX;
    ctx.shadowOffsetY = shadowOffsetY;
  } else {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // 5. Fill Color or Gradient Configuration
  if (textProps.colorMode === "GRADIENT") {
    const angleRad = ((Number(textProps.gradientAngle) || 0) * Math.PI) / 180;
    const halfW = layer.width / 2;
    const halfH = layer.height / 2;
    const x0 = -halfW * Math.cos(angleRad);
    const y0 = -halfH * Math.sin(angleRad);
    const x1 = halfW * Math.cos(angleRad);
    const y1 = halfH * Math.sin(angleRad);
    
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, textProps.gradientColor1 || "#3b82f6");
    grad.addColorStop(1, textProps.gradientColor2 || "#ec4899");
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = textProps.color || "#1e293b";
  }

  // 6. Stroke Configuration
  const strokeWidth = Number(textProps.strokeWidth) || 0;
  if (strokeWidth > 0) {
    ctx.strokeStyle = textProps.strokeColor || "#000000";
    ctx.lineWidth = strokeWidth * 2;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
  }

  // 7. Render Curved or Straight Text
  const curveAngle = Number(textProps.curveAngle) || 0;
  if (curveAngle !== 0) {
    drawCurvedTextFitted(ctx, text, layer.width, layer.height, curveAngle, textProps);
  } else {
    if (strokeWidth > 0) {
      ctx.strokeText(text, textX, textY);
    }
    ctx.fillText(text, textX, textY);
  }

  // Reset Canvas Shadow & Alpha
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalAlpha = 1;
}

function drawCurvedTextFitted(
  ctx: CanvasRenderingContext2D,
  text: string,
  layerWidth: number,
  layerHeight: number,
  curveAngleDeg: number,
  textProps: any
) {
  if (!text || text.length === 0) return;

  const chars = Array.from(text);
  const numChars = chars.length;
  const charWidths = chars.map((ch) => ctx.measureText(ch).width);
  const totalTextWidth = charWidths.reduce((a, b) => a + b, 0);

  if (totalTextWidth === 0) return;

  // Clamped angle in degrees (-175° to +175°)
  const angleMag = Math.min(175, Math.max(5, Math.abs(curveAngleDeg)));
  const totalAngleRad = (angleMag * Math.PI) / 180;
  const halfAngle = totalAngleRad / 2;

  // Span width W: fit to layer.width or text width
  const spanWidth = Math.max(80, layerWidth > 0 ? layerWidth : totalTextWidth);

  // Radius R so the arc spans spanWidth from left border to right border
  const R = (spanWidth / 2) / Math.sin(halfAngle);

  // Height of the arch
  const archHeight = R * (1 - Math.cos(halfAngle));

  // Circle Center Y relative to frame center (0, 0)
  const isUp = curveAngleDeg > 0;
  const archOffsetY = isUp ? archHeight / 2 : -archHeight / 2;

  let currentAngle = isUp ? -halfAngle : Math.PI + halfAngle;
  const angleDirection = isUp ? 1 : -1;

  ctx.save();
  ctx.translate(0, isUp ? archOffsetY + R : archOffsetY - R);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const strokeWidth = Number(textProps.strokeWidth) || 0;

  for (let i = 0; i < numChars; i++) {
    const char = chars[i];
    const w = charWidths[i];
    const charAngle = (w / totalTextWidth) * totalAngleRad;
    const midAngle = currentAngle + (charAngle / 2) * angleDirection;

    ctx.save();
    ctx.rotate(midAngle + (isUp ? Math.PI / 2 : -Math.PI / 2));
    ctx.translate(0, isUp ? -R : R);

    if (strokeWidth > 0) {
      ctx.strokeText(char, 0, 0);
    }
    ctx.fillText(char, 0, 0);
    ctx.restore();

    currentAngle += charAngle * angleDirection;
  }

  ctx.restore();
}

// Generate Full Composite PNG Snapshot Thumbnail of Screen 1
export async function generateScreenThumbnailDataUrl(
  widthPx: number,
  heightPx: number,
  layers: CanvasLayerItem[],
  bgUrl?: string | null
): Promise<string> {
  if (typeof window === "undefined") return "";

  const canvas = document.createElement("canvas");
  const targetWidth = Math.min(widthPx, 600); // Scale down thumbnail to max 600px for fast loading
  const scale = targetWidth / widthPx;
  canvas.width = targetWidth;
  canvas.height = heightPx * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 1. Base White Fill
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.scale(scale, scale);

  // 2. Draw Screen Background image
  if (bgUrl) {
    try {
      const bgImg = await loadImageAsync(bgUrl);
      ctx.drawImage(bgImg, 0, 0, widthPx, heightPx);
    } catch (e) {}
  }

  // 3. Draw Visible Layers (sorted by Z-Index)
  const visibleLayers = [...layers]
    .filter((l) => l.isVisible)
    .sort((a, b) => a.zIndex - b.zIndex);

  for (const layer of visibleLayers) {
    ctx.save();
    ctx.translate(layer.posX + layer.width / 2, layer.posY + layer.height / 2);
    ctx.rotate((layer.rotation * Math.PI) / 180);

    if (layer.layerType === "TEXT") {
      drawTextLayerToCanvas(ctx, layer);
    } else if (layer.properties?.assetUrl) {
      try {
        const img = await loadImageAsync(layer.properties.assetUrl);
        ctx.drawImage(
          img,
          -layer.width / 2,
          -layer.height / 2,
          layer.width,
          layer.height
        );
      } catch (e) {}
    }
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}

function loadImageAsync(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
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
  showGrid: propShowGrid,
}: StudioCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [internalZoom, setInternalZoom] = useState(1);
  const [internalShowGrid, setInternalShowGrid] = useState(true);

  const zoom = propZoom !== undefined ? propZoom : internalZoom;
  const showGrid = propShowGrid !== undefined ? propShowGrid : internalShowGrid;

  const setZoom = useCallback((action: number | ((prev: number) => number)) => {
    setInternalZoom(action);
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // High-performance image cache
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const animFrameRef = useRef<number | null>(null);

  // Auto-fit zoom to container on initial mount or size change
  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 100;
      const containerHeight = containerRef.current.clientHeight - 100;
      if (containerWidth > 0 && containerHeight > 0) {
        const scaleX = containerWidth / widthPx;
        const scaleY = containerHeight / heightPx;
        const autoZoom = Math.min(scaleX, scaleY, 1);
        setZoom(Math.max(autoZoom, 0.25));
      }
    }
  }, [widthPx, heightPx]);

  // Helper to load and cache images
  const getCachedImage = useCallback((url: string, onLoaded: () => void): HTMLImageElement | null => {
    if (!url) return null;
    let img = imageCacheRef.current.get(url);
    if (img) {
      return img.complete ? img : null;
    }

    img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    imageCacheRef.current.set(url, img);
    img.onload = () => {
      onLoaded();
    };
    img.onerror = () => {
      console.warn("Failed to load canvas image asset:", url);
    };
    return null;
  }, []);

  // Render 2D Canvas Graphics with 60fps Optimizations
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, widthPx, heightPx);

    // 1. Draw Checkerboard Background (Transparent Canvas Grid)
    const gridSize = 20;
    for (let x = 0; x < widthPx; x += gridSize) {
      for (let y = 0; y < heightPx; y += gridSize) {
        ctx.fillStyle = (x / gridSize + y / gridSize) % 2 === 0 ? "#f8fafc" : "#e2e8f0";
        ctx.fillRect(x, y, gridSize, gridSize);
      }
    }

    // 2. Draw Base Canvas Box
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(0, 0, widthPx, heightPx);

    // 3. Draw Safe Margin Line (Dashed)
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(40, 40, widthPx - 80, heightPx - 80);
    ctx.setLineDash([]);

    // 4. Draw Screen Background Image if present
    if (bgUrl) {
      const bgImg = getCachedImage(bgUrl, drawCanvas);
      if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, widthPx, heightPx);
      }
    }

    // 5. Draw Alignment Grid Lines Overlay (if ON)
    if (showGrid) {
      ctx.strokeStyle = "rgba(59, 130, 246, 0.22)"; // Soft blue precision alignment lines
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      const alignGridSize = 50;
      for (let x = alignGridSize; x < widthPx; x += alignGridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, heightPx);
        ctx.stroke();
      }
      for (let y = alignGridSize; y < heightPx; y += alignGridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(widthPx, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // 6. Draw Visible Layers (Sorted by Z-Index)
    const visibleLayers = [...layers]
      .filter((l) => l.isVisible)
      .sort((a, b) => a.zIndex - b.zIndex);

    visibleLayers.forEach((layer) => {
      ctx.save();
      ctx.translate(layer.posX + layer.width / 2, layer.posY + layer.height / 2);
      ctx.rotate((layer.rotation * Math.PI) / 180);

      if (layer.layerType === "TEXT") {
        drawTextLayerToCanvas(ctx, layer);
      } else if (layer.properties?.assetUrl) {
        const img = getCachedImage(layer.properties.assetUrl, drawCanvas);
        if (img) {
          ctx.drawImage(
            img,
            -layer.width / 2,
            -layer.height / 2,
            layer.width,
            layer.height
          );
        } else {
          // Placeholder Box while image is loading
          drawLayerPlaceholder(ctx, layer);
        }
      } else {
        // Placeholder Box for ASSET / PHOTO_UPLOAD / BACKGROUND
        drawLayerPlaceholder(ctx, layer);
      }

      // 7. Draw Selection Bounding Box & Active Handles
      if (layer.id === selectedLayerId) {
        ctx.strokeStyle = "#005bd3";
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(
          -layer.width / 2 - 4,
          -layer.height / 2 - 4,
          layer.width + 8,
          layer.height + 8
        );
        ctx.setLineDash([]);

        // Rotation Top Handle Connector Line
        const rotY = -layer.height / 2 - 30;
        const rotRadius = 12;

        ctx.beginPath();
        ctx.moveTo(0, -layer.height / 2 - 4);
        ctx.lineTo(0, rotY);
        ctx.strokeStyle = "#4f46e5";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Handle Circle with Soft Shadow & White Border
        ctx.save();
        ctx.shadowColor = "rgba(79, 70, 229, 0.35)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.beginPath();
        ctx.arc(0, rotY, rotRadius, 0, Math.PI * 2);
        ctx.fillStyle = "#4f46e5";
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(0, rotY, rotRadius, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Smooth Vector Curved Rotation Arrow Icon
        ctx.save();
        ctx.translate(0, rotY);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";

        // Draw Arc
        ctx.beginPath();
        ctx.arc(0, 0, 5, -Math.PI * 0.75, Math.PI * 0.55);
        ctx.stroke();

        // Draw Arrowhead
        const headAngle = Math.PI * 0.55;
        const headX = 5 * Math.cos(headAngle);
        const headY = 5 * Math.sin(headAngle);

        ctx.beginPath();
        ctx.moveTo(headX + 2.5, headY - 1.2);
        ctx.lineTo(headX, headY);
        ctx.lineTo(headX - 1.2, headY - 2.8);
        ctx.stroke();
        ctx.restore();

        // Corner Handles (White Circles with Blue Border)
        const handles = [
          { x: -layer.width / 2 - 4, y: -layer.height / 2 - 4 },
          { x: layer.width / 2 + 4, y: -layer.height / 2 - 4 },
          { x: -layer.width / 2 - 4, y: layer.height / 2 + 4 },
          { x: layer.width / 2 + 4, y: layer.height / 2 + 4 },
        ];

        handles.forEach((h) => {
          ctx.beginPath();
          ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.strokeStyle = "#005bd3";
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }
      ctx.restore();
    });

    // Outer Border
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, widthPx, heightPx);
  }, [widthPx, heightPx, layers, selectedLayerId, bgUrl, showGrid, getCachedImage]);

  // Request Animation Frame for 60fps smooth rendering
  useEffect(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(drawCanvas);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [drawCanvas]);

  // Redraw Canvas dynamically whenever dynamic web fonts (Google or Custom) complete downloading
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;

    const handleFontReady = () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(drawCanvas);
    };

    document.fonts.ready.then(handleFontReady).catch(() => {});
    document.fonts.addEventListener("loadingdone", handleFontReady);
    return () => {
      document.fonts.removeEventListener("loadingdone", handleFontReady);
    };
  }, [drawCanvas]);

  function drawLayerPlaceholder(ctx: CanvasRenderingContext2D, layer: CanvasLayerItem) {
    ctx.fillStyle =
      layer.layerType === "PHOTO_UPLOAD"
        ? "rgba(238, 242, 255, 0.85)"
        : layer.layerType === "BACKGROUND"
        ? "rgba(241, 245, 249, 0.6)"
        : "rgba(236, 253, 245, 0.85)";

    ctx.strokeStyle =
      layer.layerType === "PHOTO_UPLOAD"
        ? "#6366f1"
        : layer.layerType === "BACKGROUND"
        ? "#94a3b8"
        : "#10b981";

    ctx.lineWidth = 2;
    ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
    ctx.strokeRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);

    ctx.fillStyle = "#334155";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(layer.name, 0, -8);

    ctx.fillStyle = "#64748b";
    ctx.font = "11px sans-serif";
    ctx.fillText(`(${layer.layerType})`, 0, 12);
  }

  // Exact 1-to-1 Canvas Coordinate Mapping (Immune to zoom, CSS scaling & scroll)
  const getCanvasCoordinates = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = widthPx / rect.width;
    const scaleY = heightPx / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const [isRotating, setIsRotating] = useState(false);

  // Handle Dragging / Rotating Layer on Canvas
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const { x: clickX, y: clickY } = getCanvasCoordinates(e);

    // 1. Check if clicking on Top Rotation Handle of currently selected layer
    if (selectedLayerId) {
      const activeLayer = layers.find((l) => l.id === selectedLayerId);
      if (activeLayer) {
        const centerX = activeLayer.posX + activeLayer.width / 2;
        const centerY = activeLayer.posY + activeLayer.height / 2;
        const angleRad = ((activeLayer.rotation || 0) * Math.PI) / 180;
        
        const localRotX = 0;
        const localRotY = -activeLayer.height / 2 - 30;
        
        const worldRotX = centerX + (localRotX * Math.cos(angleRad) - localRotY * Math.sin(angleRad));
        const worldRotY = centerY + (localRotX * Math.sin(angleRad) + localRotY * Math.cos(angleRad));
        
        const dist = Math.hypot(clickX - worldRotX, clickY - worldRotY);
        if (dist <= 20) {
          setIsRotating(true);
          return;
        }
      }
    }

    // 2. Find clicked layer (from highest zIndex to lowest)
    const sortedLayers = [...layers]
      .filter((l) => l.isVisible && !l.isLocked)
      .sort((a, b) => b.zIndex - a.zIndex);

    const hit = sortedLayers.find((l) => {
      return (
        clickX >= l.posX &&
        clickX <= l.posX + l.width &&
        clickY >= l.posY &&
        clickY <= l.posY + l.height
      );
    });

    if (hit) {
      onSelectLayer(hit.id);
      setIsDragging(true);
      setDragStart({ x: clickX - hit.posX, y: clickY - hit.posY });
    } else {
      onSelectLayer(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedLayerId) return;

    if (isRotating) {
      const activeLayer = layers.find((l) => l.id === selectedLayerId);
      if (!activeLayer) return;
      
      const { x: currentX, y: currentY } = getCanvasCoordinates(e);
      const centerX = activeLayer.posX + activeLayer.width / 2;
      const centerY = activeLayer.posY + activeLayer.height / 2;
      
      const angleRad = Math.atan2(currentY - centerY, currentX - centerX);
      let angleDeg = Math.round((angleRad * 180) / Math.PI + 90);
      if (angleDeg < 0) angleDeg += 360;
      
      onUpdateLayer(selectedLayerId, { rotation: angleDeg % 360 });
      return;
    }

    if (isDragging) {
      const { x: currentX, y: currentY } = getCanvasCoordinates(e);

      const newPosX = Math.round(currentX - dragStart.x);
      const newPosY = Math.round(currentY - dragStart.y);

      onUpdateLayer(selectedLayerId, { posX: newPosX, posY: newPosY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsRotating(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-200/80 overflow-auto select-none flex"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Scrollable Viewport Wrapper with m-auto for Perfect Centering & Full Scroll Coverage */}
      <div className="m-auto flex items-center justify-center p-16 shrink-0">
        <div
          className="flex items-center justify-center transition-all duration-100 ease-out shrink-0"
          style={{
            width: widthPx * zoom,
            height: heightPx * zoom,
          }}
        >
          <div
            className="relative shadow-2xl border border-slate-400 rounded-sm bg-white overflow-hidden cursor-crosshair shrink-0"
            style={{
              width: widthPx,
              height: heightPx,
              transform: `scale(${zoom})`,
              transformOrigin: "center center",
            }}
            onMouseDown={handleMouseDown}
          >
            <canvas
              ref={canvasRef}
              width={widthPx}
              height={heightPx}
              className="w-full h-full block"
            />

            {/* Dimension Badge */}
            <div className="absolute bottom-2 left-2 bg-slate-900/75 backdrop-blur-xs text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-xs pointer-events-none">
              {widthPx}px × {heightPx}px (300 DPI)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
