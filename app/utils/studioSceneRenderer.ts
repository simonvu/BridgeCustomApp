import * as fabric from "fabric";
import { buildFabricGradientOptions } from "./textFill";
import {
  applyPhotoMaskClipPath,
  findLinkedMaskLayer,
  getMaskLiveGeometry,
  getCachedCustomMask,
  preloadCustomMaskImage,
} from "./photoMask";
import { ensureFontLoaded, type FontItem } from "./fontLoader";
import {
  applyTextCase,
  getFitFontSize,
  layoutTextInFrame,
  quoteFontFamily,
} from "./studioText";
import { generateWordSearchPuzzle } from "./wordSearchEngine";
import {
  resolveDoodleStyleAssignments,
  loadAndTrimImage,
} from "./doodleAlphabetEngine";
import {
  findOptionByValue,
  formatCalendarDate,
  getOptionAssetUrl,
  isLayerVisibleByRules,
  isOptionFieldType,
  sanitizeTextInput,
  type StudioConditionRuleItem,
} from "./fieldHelpers";
import type { CanvasLayerItem } from "../components/studio/StudioCanvas";

/**
 * Read-only "storefront" scene renderer.
 *
 * Renders a screen's layers onto a Fabric canvas exactly the way the Studio
 * editor (`StudioCanvas`) does, but without any selection frames, controls or
 * editor state — and with the customer's live personalization inputs applied.
 *
 * It intentionally reuses the SAME low-level utilities as the editor
 * (textFill, studioText, photoMask, doodle/word-search engines, fontLoader) so
 * the customer preview is visually faithful to what the designer built.
 */

export interface RenderStudioSceneParams {
  canvas: fabric.Canvas;
  widthPx: number;
  heightPx: number;
  bgUrl?: string | null;
  bgColor?: string | null;
  layers: CanvasLayerItem[];
  fields: any[];
  rules?: StudioConditionRuleItem[];
  /** Customer input values, keyed by field id. */
  formValues: Record<string, any>;
  /** Customer uploaded photo blob/URLs, keyed by field id (for PHOTO_UPLOAD layers). */
  customerPhotoUploads?: Record<string, string>;
  /** Customer doodle text overrides, keyed by DOODLE_ALPHABET layer id. */
  doodleTextValues?: Record<string, string>;
  fonts?: FontItem[];
  doodlePacks?: any[];
  /** Cancellation token; set `.cancelled = true` to abort an in-flight render. */
  token?: { cancelled: boolean };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const imgEl = new Image();
    imgEl.crossOrigin = "anonymous";
    imgEl.onload = () => resolve(imgEl);
    imgEl.onerror = () => resolve(null);
    imgEl.src = src;
  });
}

/** Ensure a CUSTOM mask PNG is processed & cached before we clip with it. */
async function ensureCustomMaskReady(url?: string): Promise<void> {
  if (!url) return;
  if (getCachedCustomMask(url)) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    preloadCustomMaskImage(url, done);
    // Safety timeout so a broken mask URL never hangs the preview render.
    setTimeout(done, 3000);
  });
}

/**
 * Quadratic arc for Fabric text-on-path (mirrors StudioCanvas).
 * Chord sits on y=0 so pathOffset centers the bulge.
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

function curvedTextOffsetY(vAlign: string, renderHeight: number, pathHeight: number): number {
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

interface LayerGeometry {
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
  drawRot: number;
}

function resolveLayerGeometry(layer: CanvasLayerItem, linkedOption: any): LayerGeometry {
  let drawX = layer.posX + layer.width / 2;
  let drawY = layer.posY + layer.height / 2;
  let drawW = layer.width;
  let drawH = layer.height;
  let drawRot = layer.rotation || 0;

  if (linkedOption?.hasCustomPosition) {
    if (linkedOption.posX !== undefined) drawX = linkedOption.posX + (linkedOption.width ?? drawW) / 2;
    if (linkedOption.posY !== undefined) drawY = linkedOption.posY + (linkedOption.height ?? drawH) / 2;
    if (linkedOption.width !== undefined) drawW = linkedOption.width;
    if (linkedOption.height !== undefined) drawH = linkedOption.height;
    if (linkedOption.rotation !== undefined) drawRot = linkedOption.rotation;
  }
  return { drawX, drawY, drawW, drawH, drawRot };
}

interface RenderContext {
  allLayers: CanvasLayerItem[];
  fields: any[];
  formValues: Record<string, any>;
  customerPhotoUploads: Record<string, string>;
  doodleTextValues: Record<string, string>;
  fonts: FontItem[];
  doodlePacks: any[];
  isCancelled: () => boolean;
}

async function renderTextLayer(
  fc: fabric.Canvas,
  layer: CanvasLayerItem,
  geo: LayerGeometry,
  ctx: RenderContext,
  linkedField: any,
  linkedValue: any
) {
  const props = layer.properties || {};

  let textStr = props.text !== undefined ? String(props.text) : layer.name;
  if (linkedField?.fieldType === "CALENDAR" && linkedValue) {
    textStr = formatCalendarDate(String(linkedValue), linkedField.config?.dateFormat);
  } else if (linkedField?.fieldType === "TEXT" && linkedValue !== undefined) {
    textStr = sanitizeTextInput(String(linkedValue), linkedField.config);
  } else if (linkedValue !== undefined && linkedValue !== "") {
    textStr = String(linkedValue);
  }
  textStr = applyTextCase(textStr, props.textCase);

  const font = props.fontFamily || "Roboto";
  await ensureFontLoaded(font, ctx.fonts);
  if (ctx.isCancelled()) return;

  const family = quoteFontFamily(font);
  const fontWeight = props.fontWeight || "normal";
  const fontStyle = props.fontStyle || "normal";
  const baseFontSize = Number(props.fontSize) || 36;
  const isAutoFit = Boolean(props.autoFit !== false && !props.allowMultiline);
  const fontSize = getFitFontSize(textStr || " ", font, baseFontSize, geo.drawW, isAutoFit, fontWeight, fontStyle);

  // Hard + soft line clamping for multiline text (mirrors editor behavior)
  const maxLinesLimit =
    props.allowMultiline && props.maxLines && Number(props.maxLines) > 0 ? Number(props.maxLines) : 0;
  if (maxLinesLimit > 0) {
    const hardLines = textStr.split("\n");
    if (hardLines.length > maxLinesLimit) {
      textStr = hardLines.slice(0, maxLinesLimit).join("\n");
    }
  }

  const opacity = props.opacity !== undefined ? Number(props.opacity) : 1;
  const strokeWidth = Number(props.strokeWidth) || 0;
  const curveAngle = Number(props.curveAngle) || 0;
  const hAlign = props.align || "center";
  const vAlign = props.verticalAlign || "middle";
  const curvePath = createFabricCurvePath(geo.drawW, geo.drawH, curveAngle, fontSize);
  const isCurved = Boolean(curvePath);
  const isMultilineTextbox = Boolean(props.allowMultiline && !isCurved);

  let shadowObj: fabric.Shadow | undefined;
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

  const stylePatch: any = {
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
    selectable: false,
    evented: false,
  };
  if (isMultilineTextbox) stylePatch.width = geo.drawW;

  const textObj = isMultilineTextbox
    ? new fabric.Textbox(textStr || " ", stylePatch)
    : new fabric.Text(textStr || " ", stylePatch);

  if (isCurved && typeof (textObj as any).setPathInfo === "function") {
    (textObj as any).setPathInfo();
  }

  const frameRect = new fabric.Rect({
    left: 0,
    top: 0,
    width: geo.drawW,
    height: geo.drawH,
    fill: "rgba(0, 0, 0, 0.001)",
    stroke: "transparent",
    strokeWidth: 0,
    originX: "center",
    originY: "center",
    selectable: false,
    evented: false,
  });

  positionTextInFrame(textObj, {
    isTextbox: isMultilineTextbox,
    isCurved,
    hAlign,
    vAlign,
    frameW: geo.drawW,
    frameH: geo.drawH,
  });

  const group = new fabric.Group([frameRect, textObj], {
    left: geo.drawX,
    top: geo.drawY,
    originX: "center",
    originY: "center",
    angle: geo.drawRot,
    width: geo.drawW,
    height: geo.drawH,
    selectable: false,
    evented: false,
    subTargetCheck: false,
    objectCaching: false,
  });
  fc.add(group);
}

async function renderImageLayer(
  fc: fabric.Canvas,
  layer: CanvasLayerItem,
  geo: LayerGeometry,
  ctx: RenderContext,
  linkedField: any,
  linkedOption: any
) {
  const props = layer.properties || {};
  let assetUrl = "";
  let opacity = props.opacity !== undefined ? Number(props.opacity) : 1;

  if (layer.layerType === "PHOTO_UPLOAD") {
    assetUrl = (layer.linkedFieldId && ctx.customerPhotoUploads[layer.linkedFieldId]) || props.assetUrl || "";
  } else if (linkedField && isOptionFieldType(linkedField.fieldType)) {
    // Option-driven asset layer: only draw the customer-selected option's asset.
    if (linkedOption && linkedOption.isVisible !== false) {
      assetUrl = getOptionAssetUrl(linkedOption) || "";
      if (linkedOption.opacity !== undefined) opacity = Number(linkedOption.opacity);
    } else {
      assetUrl = "";
    }
  } else {
    assetUrl = getOptionAssetUrl(linkedOption) || props.assetUrl || "";
  }

  if (!assetUrl) return;

  const imgEl = await loadImage(assetUrl);
  if (ctx.isCancelled() || !imgEl) return;

  const nativeW = imgEl.naturalWidth || imgEl.width || geo.drawW || 1;
  const nativeH = imgEl.naturalHeight || imgEl.height || geo.drawH || 1;

  const fabricImg = new fabric.Image(imgEl, {
    left: geo.drawX,
    top: geo.drawY,
    originX: "center",
    originY: "center",
    angle: geo.drawRot,
    scaleX: geo.drawW / nativeW,
    scaleY: geo.drawH / nativeH,
    opacity,
    selectable: false,
    evented: false,
    objectCaching: false,
  });

  const maskLayer = findLinkedMaskLayer(ctx.allLayers, layer);
  if (maskLayer && maskLayer.isVisible) {
    const maskProps = maskLayer.properties || {};
    if (maskProps.maskShape === "CUSTOM" && maskProps.maskAssetUrl) {
      await ensureCustomMaskReady(maskProps.maskAssetUrl);
      if (ctx.isCancelled()) return;
    }
    applyPhotoMaskClipPath(fabricImg, maskLayer, getMaskLiveGeometry(undefined, maskLayer));
  }

  fc.add(fabricImg);
}

async function renderDoodleLayer(
  fc: fabric.Canvas,
  layer: CanvasLayerItem,
  geo: LayerGeometry,
  ctx: RenderContext
) {
  const props = layer.properties || {};
  const doodlePackId = props.doodlePackId;
  const targetPack = ctx.doodlePacks?.find((p: any) => p.id === doodlePackId) || ctx.doodlePacks?.[0];
  const override = ctx.doodleTextValues[layer.id];
  const inputText = String(override !== undefined && override !== "" ? override : props.text || "AUNTIE").trim();
  const rule = props.styleSelectionRule || "RANDOM_SHUFFLE";
  const fixedStyleId = props.fixedStyleId || "";
  const seed = Number(props.seed) || 12345;
  const letterSpacing = Number(props.letterSpacing) || 4;
  const autoFitContainer = props.autoFitContainer !== false;
  const align = props.align || "center";
  const renderWidth = geo.drawW;
  const renderHeight = geo.drawH;

  const assignments = targetPack
    ? resolveDoodleStyleAssignments(inputText, targetPack, rule, fixedStyleId, seed)
    : [];

  const imgObjs = await Promise.all(
    assignments.map((item: any) => {
      if (!item.imageUrl) return Promise.resolve(null);
      return loadAndTrimImage(item.imageUrl).then((trimmedCanvas) =>
        trimmedCanvas ? new fabric.Image(trimmedCanvas) : null
      );
    })
  );
  if (ctx.isCancelled()) return;

  const hasLetters = imgObjs.some((o) => o);
  if (!hasLetters) {
    // Fallback: plain text so the customer still sees their input.
    const fallback = new fabric.Text(inputText || "DOODLE", {
      left: geo.drawX,
      top: geo.drawY,
      originX: "center",
      originY: "center",
      fontSize: 42,
      fontFamily: "Arial",
      fontWeight: "bold",
      fill: "#9333ea",
      angle: geo.drawRot,
      selectable: false,
      evented: false,
    });
    fc.add(fallback);
    return;
  }

  const groupObjects: fabric.Object[] = [];
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
      selectable: false,
      evented: false,
    });
    groupObjects.push(img);
    currentX += w + finalLetterSpacing;
  });

  const doodleGroup = new fabric.Group(groupObjects, {
    left: geo.drawX,
    top: geo.drawY,
    originX: "center",
    originY: "center",
    angle: geo.drawRot,
    width: renderWidth,
    height: renderHeight,
    selectable: false,
    evented: false,
    objectCaching: false,
  });
  fc.add(doodleGroup);
}

async function renderWordSearchLayer(
  fc: fabric.Canvas,
  layer: CanvasLayerItem,
  geo: LayerGeometry,
  ctx: RenderContext
) {
  const props = layer.properties || {};
  const rawWords: string[] =
    props.words && Array.isArray(props.words) && props.words.length > 0
      ? props.words
      : ["SIMON", "LISA", "JANE", "HAPPY", "URI", "RONALDO", "MESSI"];

  const gridW = props.gridWidth || 10;
  const gridH = props.gridHeight || 10;
  const seed = props.seed || 12345;
  const allowDiag = props.allowDiagonal !== false;
  const allowRev = props.allowReverse === true && props.explicitReverse === true;
  const fontFam = props.gridFontFamily || props.fontFamily || "Roboto";
  const fontWeight = props.fontWeight || "bold";
  const fontStyle = props.fontStyle || "normal";
  const textTransform = props.textTransform || props.wordStyle || "UPPERCASE";
  const density = props.overlapDensity || "BALANCED";

  await ensureFontLoaded(fontFam, ctx.fonts);
  if (ctx.isCancelled()) return;

  const { grid, placedWords } = generateWordSearchPuzzle({
    words: rawWords,
    gridWidth: gridW,
    gridHeight: gridH,
    allowDiagonal: allowDiag,
    allowReverse: allowRev,
    seed,
    overlapDensity: density as any,
  });

  const renderWidth = geo.drawW;
  const renderHeight = geo.drawH;
  const cellW = renderWidth / gridW;
  const cellH = renderHeight / gridH;
  const autoFontSize = Math.min(cellW, cellH) * 0.55;
  const rawFontSize = Number(props.fontSize || props.gridFontSize);
  const actualFontSize = rawFontSize && rawFontSize > 0 ? rawFontSize : Math.max(10, Math.round(autoFontSize));

  const startGridX = -renderWidth / 2 + cellW / 2;
  const startGridY = -renderHeight / 2 + cellH / 2;

  const groupObjects: fabric.Object[] = [];

  const showHighlights = props.showHighlights === undefined ? true : Boolean(props.showHighlights);
  const activeHighlightColor = props.highlightColor || props.ovalColor || "#FD005D";
  const strokeWidth = Number(props.highlightLineWidth) || 4;
  const isTransparentFill = props.transparentHighlightFill === true;
  const rawFillColor = props.highlightFillColor || activeHighlightColor;
  const fillOpacity = isTransparentFill
    ? 0
    : props.highlightFillOpacity !== undefined
      ? Number(props.highlightFillOpacity)
      : 0.22;
  const capsuleFill = hexToRgba(rawFillColor, fillOpacity);

  if (showHighlights && placedWords.length > 0) {
    placedWords.forEach((pw: any) => {
      const x1 = startGridX + pw.startX * cellW;
      const y1 = startGridY + pw.startY * cellH;
      const x2 = startGridX + pw.endX * cellW;
      const y2 = startGridY + pw.endY * cellH;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

      const pillLength = Math.max(len + cellW * 0.85, cellW * 1.2);
      const pillHeight = Math.max(Math.min(cellW, cellH) * 0.85, 20);

      groupObjects.push(
        new fabric.Rect({
          left: (x1 + x2) / 2,
          top: (y1 + y2) / 2,
          width: pillLength,
          height: pillHeight,
          rx: pillHeight / 2,
          ry: pillHeight / 2,
          fill: capsuleFill,
          stroke: activeHighlightColor,
          strokeWidth,
          originX: "center",
          originY: "center",
          angle: angleDeg,
          selectable: false,
          evented: false,
        })
      );
    });
  }

  const targetCellSet = new Set<string>();
  placedWords.forEach((pw: any) => {
    const dx = pw.endX === pw.startX ? 0 : pw.endX > pw.startX ? 1 : -1;
    const dy = pw.endY === pw.startY ? 0 : pw.endY > pw.startY ? 1 : -1;
    const steps = Math.max(Math.abs(pw.endX - pw.startX), Math.abs(pw.endY - pw.startY)) + 1;
    for (let s = 0; s < steps; s++) {
      targetCellSet.add(`${pw.startY + s * dy}_${pw.startX + s * dx}`);
    }
  });

  const fillerTextColor = props.gridTextColor || props.color || props.fill || "#1E293B";
  const wordTextColor = props.wordTextColor || props.highlightTextColor || fillerTextColor;

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      let letter = grid[r][c];
      if (textTransform === "LOWERCASE") letter = letter.toLowerCase();
      else if (textTransform === "UPPERCASE") letter = letter.toUpperCase();

      const isTargetLetter = targetCellSet.has(`${r}_${c}`);
      const letterColor = isTargetLetter ? wordTextColor : fillerTextColor;
      const isWhiteText = letterColor.toUpperCase() === "#FFFFFF" || letterColor.toUpperCase() === "FFF";

      groupObjects.push(
        new fabric.Text(letter, {
          left: startGridX + c * cellW,
          top: startGridY + r * cellH,
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
        })
      );
    }
  }

  const puzzleGroup = new fabric.Group(groupObjects, {
    left: geo.drawX,
    top: geo.drawY,
    originX: "center",
    originY: "center",
    angle: geo.drawRot,
    width: renderWidth,
    height: renderHeight,
    selectable: false,
    evented: false,
    objectCaching: false,
  });
  fc.add(puzzleGroup);
}

async function renderLayer(fc: fabric.Canvas, layer: CanvasLayerItem, ctx: RenderContext) {
  const linkedField = layer.linkedFieldId ? ctx.fields.find((f) => f.id === layer.linkedFieldId) : undefined;
  const linkedValue = layer.linkedFieldId ? ctx.formValues[layer.linkedFieldId] : undefined;
  const linkedOption = linkedField ? findOptionByValue(linkedField, linkedValue) : undefined;
  const geo = resolveLayerGeometry(layer, linkedOption);

  if (layer.layerType === "TEXT") {
    await renderTextLayer(fc, layer, geo, ctx, linkedField, linkedValue);
  } else if (layer.layerType === "DOODLE_ALPHABET") {
    await renderDoodleLayer(fc, layer, geo, ctx);
  } else if (layer.layerType === "WORD_SEARCH_PUZZLE") {
    await renderWordSearchLayer(fc, layer, geo, ctx);
  } else if (
    layer.layerType === "ASSET" ||
    layer.layerType === "OVERLAY" ||
    layer.layerType === "PHOTO_UPLOAD" ||
    (layer.layerType as string) === "IMAGE"
  ) {
    await renderImageLayer(fc, layer, geo, ctx, linkedField, linkedOption);
  }
  // MASK layers are never drawn directly; they only clip their linked photo/asset.
}

/**
 * Warm the browser image/font cache for everything the scene will draw, without
 * touching the canvas. Called before the canvas is cleared so the subsequent
 * rebuild paints immediately (no flicker on customer input changes).
 */
async function preloadSceneImages(
  bgUrl: string | null | undefined,
  drawable: CanvasLayerItem[],
  ctx: RenderContext
): Promise<void> {
  const urls = new Set<string>();
  if (bgUrl) urls.add(bgUrl);

  for (const layer of drawable) {
    const props = layer.properties || {};
    if (props.assetUrl) urls.add(props.assetUrl);

    if (layer.layerType === "PHOTO_UPLOAD" && layer.linkedFieldId) {
      const up = ctx.customerPhotoUploads[layer.linkedFieldId];
      if (up) urls.add(up);
    }

    if (layer.linkedFieldId) {
      const field = ctx.fields.find((f) => f.id === layer.linkedFieldId);
      const opts = field?.config?.options || [];
      for (const opt of opts) {
        const u = getOptionAssetUrl(opt);
        if (u) urls.add(u);
      }
    }
  }

  // Custom mask PNGs used by any linked mask layer.
  const maskPreloads = (ctx.allLayers || [])
    .filter((l) => l.layerType === "MASK" && l.properties?.maskShape === "CUSTOM" && l.properties?.maskAssetUrl)
    .map((l) => ensureCustomMaskReady(l.properties.maskAssetUrl));

  // Fonts used by text / word-search layers.
  const fontPreloads = drawable
    .filter((l) => l.layerType === "TEXT" || l.layerType === "WORD_SEARCH_PUZZLE")
    .map((l) => {
      const font = l.properties?.fontFamily || l.properties?.gridFontFamily || "Roboto";
      return ensureFontLoaded(font, ctx.fonts).catch(() => false);
    });

  await Promise.all([
    ...Array.from(urls).map((u) => loadImage(u)),
    ...maskPreloads,
    ...fontPreloads,
  ]);
}

export async function renderStudioScene(params: RenderStudioSceneParams): Promise<void> {
  const {
    canvas: fc,
    widthPx,
    heightPx,
    bgUrl,
    bgColor,
    layers,
    fields,
    rules = [],
    formValues,
    customerPhotoUploads = {},
    doodleTextValues = {},
    fonts = [],
    doodlePacks = [],
    token,
  } = params;

  if (!fc) return;
  const isCancelled = () => Boolean(token?.cancelled);

  const ctx: RenderContext = {
    allLayers: layers || [],
    fields: fields || [],
    formValues,
    customerPhotoUploads,
    doodleTextValues,
    fonts,
    doodlePacks,
    isCancelled,
  };

  // Draw in strict z-index order (awaiting each layer keeps stacking deterministic).
  const drawable = (layers || [])
    .filter((l) => l.isVisible && l.layerType !== "MASK" && isLayerVisibleByRules(l.id, rules, formValues))
    .sort((a, b) => a.zIndex - b.zIndex);

  // Warm the browser image cache BEFORE clearing the canvas so the rebuild is
  // near-instant. This prevents a visible flash/flicker of a half-built scene
  // every time a customer input changes.
  await preloadSceneImages(bgUrl, drawable, ctx);
  if (isCancelled()) return;

  fc.clear();
  fc.setDimensions({ width: widthPx, height: heightPx });
  fc.backgroundColor = bgColor && bgColor !== "transparent" ? bgColor : "#ffffff";

  if (bgUrl) {
    const bgImg = await loadImage(bgUrl);
    if (isCancelled()) return;
    if (bgImg) {
      const fabricBg = new fabric.Image(bgImg, {
        left: 0,
        top: 0,
        originX: "left",
        originY: "top",
        scaleX: widthPx / (bgImg.naturalWidth || widthPx),
        scaleY: heightPx / (bgImg.naturalHeight || heightPx),
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      fc.add(fabricBg);
    }
  }

  for (const layer of drawable) {
    if (isCancelled()) return;
    try {
      await renderLayer(fc, layer, ctx);
    } catch (e) {
      // Never let a single bad layer abort the whole preview render.
      // eslint-disable-next-line no-console
      console.warn("Preview render skipped a layer:", layer?.id, e);
    }
  }

  if (!isCancelled()) fc.requestRenderAll();
}

/**
 * Returns the DOODLE_ALPHABET layers on a screen that the customer is allowed
 * to personalize (so the storefront form can render a text input for each).
 */
export function getPersonalizableDoodleLayers(layers: CanvasLayerItem[] = []): CanvasLayerItem[] {
  return layers.filter(
    (l) => l.layerType === "DOODLE_ALPHABET" && l.isVisible && (l.properties?.allowPersonalized !== false)
  );
}
