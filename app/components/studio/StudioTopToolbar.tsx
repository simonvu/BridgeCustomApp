import React, { useState } from "react";
import { CanvasLayerItem } from "./StudioCanvas";
import { FontItem, loadSingleFontOnDemand } from "../../utils/fontLoader";
import StudioFontPicker from "./StudioFontPicker";
import {
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Italic,
  RotateCw,
  FlipHorizontal,
  Sparkles,
  Sliders,
  Layers,
  ChevronDown,
  X,
  SlidersHorizontal,
  Grid,
  Move,
  Image as ImageIcon,
  Eye,
  ListFilter,
  GitBranch,
} from "lucide-react";

import { StudioFieldItem } from "./StudioFieldPanel";
import { isConditionOnlyField, isOptionFieldType } from "../../utils/fieldHelpers";
import { defaultGradientPatch, getGradientCss, getNormalizedGradientStops } from "../../utils/textFill";
import TextGradientEditor from "./TextGradientEditor";

interface StudioTopToolbarProps {
  selectedLayer: CanvasLayerItem | null;
  selectedCount?: number;
  fields?: StudioFieldItem[];
  fonts?: FontItem[];
  onUpdateLayer: (layerId: string, updatedProps: Partial<CanvasLayerItem>) => void;
  onUpdateField?: (fieldId: string, updatedProps: Partial<StudioFieldItem>) => void;
  onOpenMediaPickerForLayer?: (layerId: string) => void;
  onFlipSelected?: () => void;
  onMergeSelected?: () => void;
  /** When true, X/Y/W/H on a linked option group edit the layer only (shared by all options). */
  lockOptionGeometry?: boolean;
}

export default function StudioTopToolbar({
  selectedLayer,
  selectedCount = 0,
  fields = [],
  fonts = [],
  onUpdateLayer,
  onUpdateField,
  onOpenMediaPickerForLayer,
  onFlipSelected,
  onMergeSelected,
  lockOptionGeometry = false,
}: StudioTopToolbarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isFontLoading, setIsFontLoading] = useState(false);

  if (selectedCount > 1) {
    return (
      <div className="h-11 bg-white border-b border-slate-200 px-3 flex items-center justify-between text-xs select-none shrink-0 shadow-2xs w-full">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-7 px-2 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold flex items-center">
            {selectedCount} groups
          </span>
          <span className="text-slate-500 truncate hidden sm:inline">
            Drag on canvas to move together · Shift/⌘-click in Assets to add
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onFlipSelected && (
            <button
              type="button"
              onClick={onFlipSelected}
              className="h-7 px-2 rounded-md border border-slate-300 bg-slate-100 text-slate-700 hover:border-indigo-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              title="Flip all selected groups horizontally"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              Flip
            </button>
          )}
          {onMergeSelected && (
            <button
              type="button"
              onClick={onMergeSelected}
              className="h-7 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer"
              title="Merge selected option groups"
            >
              Merge
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!selectedLayer) {
    return (
      <div className="h-11 bg-white border-b border-slate-200 px-3 flex items-center justify-between text-xs text-slate-400 select-none shrink-0 shadow-2xs w-full">
        <span className="flex items-center gap-2 text-slate-400 font-medium italic">
          <Sliders className="w-3.5 h-3.5" /> Select any layer on canvas to edit visual properties
        </span>
      </div>
    );
  }

  const linkedField = selectedLayer.linkedFieldId
    ? fields.find((f) => f.id === selectedLayer.linkedFieldId)
    : undefined;

  if (linkedField && isOptionFieldType(linkedField.fieldType)) {
    if (isConditionOnlyField(linkedField)) {
      return (
        <div className="h-11 bg-white border-b border-slate-200 px-3 flex items-center gap-2 text-xs select-none shrink-0 shadow-2xs w-full">
          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <GitBranch className="w-4 h-4 text-amber-600" />
          </div>
          <span className="font-bold text-amber-800">Condition only</span>
          <span className="text-slate-500 truncate hidden sm:inline">
            Not drawn on canvas · drives the customize form and artwork conditions
          </span>
        </div>
      );
    }

    const config = linkedField?.config || {};
    const options: any[] = config.options || [];
    const activeOptId = linkedField?.activeOptionId || options[0]?.id;
    const activeOptIdx = activeOptId ? options.findIndex((o: any) => o.id === activeOptId) : -1;
    const activeOpt = activeOptIdx >= 0 ? options[activeOptIdx] : options[0];

    const currentPosX = !lockOptionGeometry && activeOpt?.posX !== undefined ? activeOpt.posX : selectedLayer.posX;
    const currentPosY = !lockOptionGeometry && activeOpt?.posY !== undefined ? activeOpt.posY : selectedLayer.posY;
    const currentW = !lockOptionGeometry && activeOpt?.width !== undefined ? activeOpt.width : selectedLayer.width;
    const currentH = !lockOptionGeometry && activeOpt?.height !== undefined ? activeOpt.height : selectedLayer.height;
    const currentRotation =
      !lockOptionGeometry && activeOpt?.rotation !== undefined ? activeOpt.rotation : selectedLayer.rotation || 0;
    const currentOpacity =
      !lockOptionGeometry && activeOpt?.opacity !== undefined
        ? Number(activeOpt.opacity)
        : selectedLayer.properties?.opacity ?? 1;

    const currentFlipH = Boolean(
      !lockOptionGeometry ? activeOpt?.flipH ?? selectedLayer.properties?.flipH : selectedLayer.properties?.flipH
    );

    const handleOptionPropChange = (key: string, value: any) => {
      const geomKey = ["posX", "posY", "width", "height", "rotation"].includes(key);
      const flipKey = key === "flipH" || key === "flipV";
      if (linkedField && onUpdateField && activeOptIdx >= 0 && !lockOptionGeometry) {
        const updatedOpts = [...options];
        updatedOpts[activeOptIdx] = {
          ...updatedOpts[activeOptIdx],
          [key]: value,
          ...(geomKey ? { hasCustomPosition: true } : {}),
        };
        onUpdateField(linkedField.id, {
          config: { ...config, options: updatedOpts },
          activeOptionId: activeOptId,
        });
      }
      if (geomKey) {
        onUpdateLayer(selectedLayer.id, { [key]: value });
      }
      if (flipKey) {
        onUpdateLayer(selectedLayer.id, {
          properties: { ...(selectedLayer.properties || {}), [key]: value },
        });
      }
      if (key === "opacity") {
        onUpdateLayer(selectedLayer.id, {
          properties: { ...(selectedLayer.properties || {}), opacity: value },
        });
      }
    };

    return (
      <div className="relative h-11 bg-white border-b border-slate-200 px-3 flex items-center justify-between select-none shrink-0 shadow-2xs z-30 w-full">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 min-w-0 flex-1">
          {/* Layer Badge */}
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0" title={selectedLayer.name}>
            <ListFilter className="w-4 h-4 text-indigo-600" />
          </div>

          <div className="h-5 w-px bg-slate-200 my-auto shrink-0" />

          {/* Opacity Control Slider & Input */}
          <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 border border-slate-300 rounded-md h-7 px-1.5">
            <Eye className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="text-[10px] font-bold text-slate-500">Opacity:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={currentOpacity}
              onChange={(e) => handleOptionPropChange("opacity", Number(e.target.value))}
              className="w-12 accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
            />
            <span className="font-mono text-[10px] font-bold text-indigo-700 w-7 text-right">
              {Math.round(currentOpacity * 100)}%
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200 my-auto shrink-0" />

          {/* POSITION (X, Y) BADGE */}
          <div className="flex items-center gap-1 shrink-0 bg-slate-100 border border-slate-300 rounded-md h-7 px-1.5">
            <Move className="w-3 h-3 text-slate-500 shrink-0" />
            <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded px-1 h-5">
              <span className="text-[9px] font-bold text-slate-400">X:</span>
              <input
                type="number"
                value={currentPosX}
                onChange={(e) => handleOptionPropChange("posX", Number(e.target.value))}
                className="w-8 font-mono text-[10px] font-bold text-slate-800 bg-transparent border-none text-center outline-none p-0 h-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                title="X Position (px)"
              />
            </div>
            <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded px-1 h-5">
              <span className="text-[9px] font-bold text-slate-400">Y:</span>
              <input
                type="number"
                value={currentPosY}
                onChange={(e) => handleOptionPropChange("posY", Number(e.target.value))}
                className="w-8 font-mono text-[10px] font-bold text-slate-800 bg-transparent border-none text-center outline-none p-0 h-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                title="Y Position (px)"
              />
            </div>
          </div>

          {/* FRAME DIMENSIONS (W x H) WITH ASPECT RATIO LOCK */}
          <div className="flex items-center gap-1 shrink-0 bg-slate-100 border border-slate-300 rounded-md h-7 px-1.5">
            <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded px-1 h-5">
              <span className="text-[9px] font-bold text-slate-400">W:</span>
              <input
                type="number"
                value={currentW}
                onChange={(e) => {
                  const newW = Number(e.target.value);
                  const ratio = (currentW / currentH) || 1;
                  const newH = Math.max(1, Math.round(newW / ratio));
                  handleOptionPropChange("width", newW);
                  handleOptionPropChange("height", newH);
                }}
                className="w-8 font-mono text-[10px] font-bold text-slate-800 bg-transparent border-none text-center outline-none p-0 h-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                title="Width (px)"
              />
            </div>
            <span className="text-slate-400 font-bold text-[10px]">×</span>
            <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded px-1 h-5">
              <span className="text-[9px] font-bold text-slate-400">H:</span>
              <input
                type="number"
                value={currentH}
                onChange={(e) => {
                  const newH = Number(e.target.value);
                  const ratio = (currentW / currentH) || 1;
                  const newW = Math.max(1, Math.round(newH * ratio));
                  handleOptionPropChange("height", newH);
                  handleOptionPropChange("width", newW);
                }}
                className="w-8 font-mono text-[10px] font-bold text-slate-800 bg-transparent border-none text-center outline-none p-0 h-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                title="Height (px)"
              />
            </div>
          </div>

          {/* ROTATION ° */}
          <div className="flex items-center gap-1 shrink-0 bg-slate-100 border border-slate-300 rounded-md h-7 px-1.5">
            <RotateCw className="w-3 h-3 text-slate-500 shrink-0" />
            <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded px-1 h-5">
              <input
                type="number"
                value={currentRotation}
                onChange={(e) => handleOptionPropChange("rotation", Number(e.target.value))}
                className="w-7 font-mono text-[10px] font-bold text-slate-800 bg-transparent border-none text-center outline-none p-0 h-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                title="Rotation Angle (°)"
              />
              <span className="text-[9px] font-bold text-slate-400 pointer-events-none">°</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleOptionPropChange("flipH", !currentFlipH)}
            className={`h-7 px-2 rounded-md border text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 ${
              currentFlipH
                ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                : "bg-slate-100 border-slate-300 text-slate-600 hover:border-indigo-300"
            }`}
            title="Flip horizontally"
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
            Flip
          </button>
        </div>
      </div>
    );
  }

  const props = selectedLayer.properties || {};

  const handlePropChange = (keyOrPatch: string | Record<string, any>, value?: any) => {
    const patch = typeof keyOrPatch === "string" ? { [keyOrPatch]: value } : keyOrPatch;
    onUpdateLayer(selectedLayer.id, {
      properties: { ...props, ...patch },
    });
  };

  const isImageLayer = ["ASSET", "IMAGE", "OVERLAY", "PHOTO_UPLOAD"].includes(selectedLayer.layerType);
  const showOpacityOnBar = isImageLayer || selectedLayer.layerType === "CLIPART";

  const handleFontSelect = async (family: string) => {
    setIsFontLoading(true);
    const selectedFont = fonts.find((f) => f.family === family);
    try {
      await loadSingleFontOnDemand(selectedFont || family, fonts);
    } catch (e) {
      console.warn("Font load error:", e);
    } finally {
      setIsFontLoading(false);
      onUpdateLayer(selectedLayer.id, {
        fontFamily: family,
        properties: {
          ...props,
          fontFamily: family,
          gridFontFamily: family,
        },
      });
    }
  };

  const hasAdvancedModified =
    (props.strokeWidth || 0) > 0 ||
    props.colorMode === "GRADIENT" ||
    (props.shadowBlur || 0) > 0 ||
    (props.curveAngle || 0) !== 0 ||
    (props.opacity !== undefined && Number(props.opacity) !== 1) ||
    props.autoFit === false ||
    props.autoFitContainer === false ||
    (selectedLayer.layerType === "WORD_SEARCH_PUZZLE" &&
      (props.showHighlights === false ||
        props.fontWeight === "normal" ||
        (props.textTransform || props.wordStyle) === "LOWERCASE"));

  return (
    <div className="relative h-11 bg-white border-b border-slate-200 px-3 flex items-center justify-between select-none shrink-0 shadow-2xs z-30 w-full">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 min-w-0 flex-1">
        {/* 1. Fieldtype Icon Badge */}
        <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-300 flex items-center justify-center shrink-0">
          {selectedLayer.layerType === "TEXT" ? (
            <Type className="w-4 h-4 text-indigo-600" />
          ) : selectedLayer.layerType === "WORD_SEARCH_PUZZLE" ? (
            <Grid className="w-4 h-4 text-blue-600" />
          ) : selectedLayer.layerType === "DOODLE_ALPHABET" ? (
            <Sparkles className="w-4 h-4 text-purple-600" />
          ) : selectedLayer.layerType === "CLIPART" ? (
            <Layers className="w-4 h-4 text-emerald-600" />
          ) : (
            <ImageIcon className="w-4 h-4 text-emerald-600" />
          )}
        </div>

        <div className="h-5 w-px bg-slate-200 my-auto shrink-0" />

        {/* IMAGE LAYER CONTROLS (Change Image + Opacity Slider) */}
        {(isImageLayer || selectedLayer.layerType === "CLIPART") && (
          <>
            {isImageLayer && (
            <button
              type="button"
              onClick={() => onOpenMediaPickerForLayer && onOpenMediaPickerForLayer(selectedLayer.id)}
              className="h-7 px-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md text-emerald-700 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer shrink-0"
              title="Change Image Asset from Media Library"
            >
              <Sparkles className="w-3 h-3 text-emerald-600" />
              <span>{props.assetUrl ? "Change Image" : "Choose Image"}</span>
            </button>
            )}

            {isImageLayer && <div className="h-4 w-px bg-slate-200 my-auto shrink-0" />}

            {showOpacityOnBar && (
            <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 border border-slate-300 rounded-md h-7 px-1.5">
              <Eye className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="text-[10px] font-bold text-slate-500">Opacity:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={props.opacity !== undefined ? Number(props.opacity) : 1}
                onChange={(e) => handlePropChange("opacity", Number(e.target.value))}
                className="w-12 accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
              />
            <span className="font-mono text-[10px] font-bold text-emerald-700 w-7 text-right">
              {Math.round((props.opacity !== undefined ? Number(props.opacity) : 1) * 100)}%
            </span>
            </div>
            )}

            {isImageLayer && (
            <button
              type="button"
              onClick={() => handlePropChange("flipH", !props.flipH)}
              className={`h-7 px-2 rounded-md border text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 ${
                props.flipH
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                  : "bg-slate-100 border-slate-300 text-slate-600 hover:border-emerald-300"
              }`}
              title="Flip horizontally"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              Flip
            </button>
            )}
          </>
        )}

        {/* TEXT LAYER CORE PROPERTIES */}
        {selectedLayer.layerType === "TEXT" && (
          <>
            {/* 1. Font Family Picker (Searchable, Lazy-Loaded, with Custom Font Upload) */}
            <StudioFontPicker
              selectedFont={props.fontFamily || "Roboto"}
              fonts={fonts}
              onSelectFont={(family) => handleFontSelect(family)}
              isFontLoading={isFontLoading}
            />

            {/* 2. Font Size (px) Input */}
            <div className="flex items-center bg-slate-100 border border-slate-300 rounded-md h-7 px-1 shrink-0">
              <input
                type="number"
                min="6"
                max="300"
                value={props.fontSize || 36}
                onChange={(e) => handlePropChange("fontSize", Number(e.target.value))}
                className="w-9 text-center font-mono font-bold bg-transparent border-none text-[11px] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                title="Font Size (pt)"
              />
            </div>

            {/* 3. Color Swatch / Gradient Preview */}
            {props.colorMode === "GRADIENT" ? (
              <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 p-0.5 rounded-md h-7 shrink-0">
                <div
                  className="w-10 h-5 rounded border border-slate-300 shadow-2xs shrink-0"
                  style={{ background: getGradientCss(props) }}
                  title="Gradient fill — edit stops in Properties"
                />
                {(() => {
                  const stops = getNormalizedGradientStops(props);
                  const ends = [stops[0], stops[stops.length - 1]];
                  return ends.map((stop, idx) => (
                    <input
                      key={idx}
                      type="color"
                      value={stop.color}
                      onChange={(e) => {
                        const next = getNormalizedGradientStops(props);
                        const targetIdx = idx === 0 ? 0 : next.length - 1;
                        next[targetIdx] = { ...next[targetIdx], color: e.target.value };
                        handlePropChange({
                          colorMode: "GRADIENT",
                          gradientStops: next,
                          gradientColor1: next[0]?.color,
                          gradientColor2: next[next.length - 1]?.color,
                        });
                      }}
                      className="w-5 h-5 rounded border border-slate-300 cursor-pointer p-0 bg-white shrink-0"
                      title={idx === 0 ? "Start color" : "End color"}
                    />
                  ));
                })()}
                <button
                  type="button"
                  onClick={() =>
                    handlePropChange({
                      colorMode: "SOLID",
                      color: getNormalizedGradientStops(props)[0]?.color || props.color || "#1e293b",
                    })
                  }
                  className="px-1 h-5 rounded text-[9px] font-extrabold text-indigo-700 bg-white border border-indigo-200 cursor-pointer"
                  title="Switch to solid color"
                >
                  G
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 p-0.5 rounded-md h-7 shrink-0">
                <input
                  type="color"
                  value={props.color || "#1e293b"}
                  onChange={(e) => handlePropChange("color", e.target.value)}
                  className="w-5 h-5 rounded border border-slate-300 cursor-pointer p-0 bg-white shrink-0"
                  title="Font Color"
                />
                <input
                  type="text"
                  value={props.color || "#1e293b"}
                  onChange={(e) => handlePropChange("color", e.target.value)}
                  className="w-13 font-mono text-[10px] border-none bg-transparent font-bold focus:outline-none uppercase p-0"
                />
                <button
                  type="button"
                  onClick={() => handlePropChange(defaultGradientPatch(props.color))}
                  className="px-1 h-5 rounded text-[9px] font-extrabold text-slate-500 hover:text-indigo-700 hover:bg-white cursor-pointer"
                  title="Use gradient fill"
                >
                  G
                </button>
              </div>
            )}

            {/* 4. Bold / Italic */}
            <button
              type="button"
              onClick={() =>
                handlePropChange("fontWeight", props.fontWeight === "bold" || Number(props.fontWeight) >= 700 ? "normal" : "bold")
              }
              className={`w-7 h-7 flex items-center justify-center rounded-md border font-serif font-black text-xs transition cursor-pointer shrink-0 ${
                props.fontWeight === "bold" || Number(props.fontWeight) >= 700
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              title="Bold"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => handlePropChange("fontStyle", props.fontStyle === "italic" ? "normal" : "italic")}
              className={`w-7 h-7 flex items-center justify-center rounded-md border transition cursor-pointer shrink-0 ${
                props.fontStyle === "italic"
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              title="Italic"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>

            {/* 5. Text Case Selector (Aa, AA, aa) */}
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-md border border-slate-300 shrink-0 h-7">
              <button
                type="button"
                onClick={() => handlePropChange("textCase", "NORMAL")}
                className={`px-1 h-5 text-[10px] font-bold rounded flex items-center justify-center transition cursor-pointer ${
                  !props.textCase || props.textCase === "NORMAL" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Normal Case"
              >
                Aa
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("textCase", "UPPERCASE")}
                className={`px-1 h-5 text-[10px] font-extrabold rounded flex items-center justify-center transition cursor-pointer ${
                  props.textCase === "UPPERCASE" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="UPPERCASE"
              >
                AA
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("textCase", "LOWERCASE")}
                className={`px-1 h-5 text-[10px] font-medium rounded flex items-center justify-center transition cursor-pointer ${
                  props.textCase === "LOWERCASE" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="lowercase"
              >
                aa
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("textCase", "TITLECASE")}
                className={`px-1 h-5 text-[10px] font-semibold rounded flex items-center justify-center transition cursor-pointer ${
                  props.textCase === "TITLECASE" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Title Case"
              >
                Tt
              </button>
            </div>

            {/* 6. Horizontal Alignment Icons */}
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-md border border-slate-300 shrink-0 h-7">
              <button
                type="button"
                onClick={() => handlePropChange("align", "left")}
                className={`w-5 h-5 flex items-center justify-center rounded transition cursor-pointer ${
                  props.align === "left" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align Left"
              >
                <AlignLeft className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("align", "center")}
                className={`w-5 h-5 flex items-center justify-center rounded transition cursor-pointer ${
                  !props.align || props.align === "center" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align Center"
              >
                <AlignCenter className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("align", "right")}
                className={`w-5 h-5 flex items-center justify-center rounded transition cursor-pointer ${
                  props.align === "right" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align Right"
              >
                <AlignRight className="w-3 h-3" />
              </button>
            </div>

            {/* 7. Vertical Alignment Icons (Top, Middle, Bottom) */}
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-md border border-slate-300 shrink-0 h-7">
              <button
                type="button"
                onClick={() => handlePropChange("verticalAlign", "top")}
                className={`w-5 h-5 flex items-center justify-center rounded transition cursor-pointer ${
                  props.verticalAlign === "top" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align Top"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16"/>
                  <rect x="7" y="8" width="10" height="12" rx="1"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("verticalAlign", "middle")}
                className={`w-5 h-5 flex items-center justify-center rounded transition cursor-pointer ${
                  !props.verticalAlign || props.verticalAlign === "middle" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align Middle (Center)"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12h16"/>
                  <rect x="7" y="6" width="10" height="12" rx="1"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("verticalAlign", "bottom")}
                className={`w-5 h-5 flex items-center justify-center rounded transition cursor-pointer ${
                  props.verticalAlign === "bottom" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align Bottom"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h16"/>
                  <rect x="7" y="4" width="10" height="12" rx="1"/>
                </svg>
              </button>
            </div>
          </>
        )}

        {selectedLayer.layerType === "DOODLE_ALPHABET" && (
          <>
            <button
              type="button"
              onClick={() => handlePropChange("seed", (props.seed || 12345) + 1)}
              className="h-7 px-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-2xs"
              title="Re-roll style assignments for each letter"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Re-roll</span>
            </button>
            <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 rounded-md h-7 px-1.5 shrink-0">
              <span className="text-[9px] font-bold text-slate-400">Sp:</span>
              <input
                type="number"
                min={-10}
                max={40}
                value={props.letterSpacing ?? 4}
                onChange={(e) => handlePropChange("letterSpacing", Number(e.target.value))}
                className="w-8 text-center font-mono font-bold bg-transparent border-none text-[11px] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                title="Letter spacing (px)"
              />
            </div>
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-md border border-slate-300 shrink-0 h-7">
              <button
                type="button"
                onClick={() => handlePropChange("align", "left")}
                className={`w-6 h-5 flex items-center justify-center rounded transition cursor-pointer ${
                  props.align === "left" ? "bg-white shadow-2xs text-purple-700" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align left"
              >
                <AlignLeft className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("align", "center")}
                className={`w-6 h-5 flex items-center justify-center rounded transition cursor-pointer ${
                  !props.align || props.align === "center" ? "bg-white shadow-2xs text-purple-700" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align center"
              >
                <AlignCenter className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("align", "right")}
                className={`w-6 h-5 flex items-center justify-center rounded transition cursor-pointer ${
                  props.align === "right" ? "bg-white shadow-2xs text-purple-700" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align right"
              >
                <AlignRight className="w-3 h-3" />
              </button>
            </div>
          </>
        )}

        {/* WORD SEARCH PUZZLE LAYER CORE CONTROLS */}
        {selectedLayer.layerType === "WORD_SEARCH_PUZZLE" && (
          <>
            {/* 1. Regenerate Layout Seed Button */}
            <button
              type="button"
              onClick={() => handlePropChange("seed", (props.seed || 12345) + 1)}
              className="h-7 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-2xs"
              title="Regenerate random layout seed"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Regenerate Layout</span>
            </button>

            {/* 2. Synced Grid Cols & Rows Select Dropdowns (8-16) */}
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-300 rounded-md h-7 px-2 shrink-0">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-500">Cols:</span>
                <select
                  value={props.gridWidth || 10}
                  onChange={(e) => handlePropChange("gridWidth", Number(e.target.value))}
                  className="bg-transparent text-[11px] font-bold text-slate-800 outline-none cursor-pointer"
                >
                  {[8, 9, 10, 11, 12, 13, 14, 15, 16].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <span className="text-[10px] font-bold text-slate-400">×</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-500">Rows:</span>
                <select
                  value={props.gridHeight || 10}
                  onChange={(e) => handlePropChange("gridHeight", Number(e.target.value))}
                  className="bg-transparent text-[11px] font-bold text-slate-800 outline-none cursor-pointer"
                >
                  {[8, 9, 10, 11, 12, 13, 14, 15, 16].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3. Font Family Selector */}
            <StudioFontPicker
              selectedFont={props.gridFontFamily || props.fontFamily || selectedLayer.fontFamily || "Roboto"}
              fonts={fonts}
              onSelectFont={(family) => {
                handlePropChange({ fontFamily: family, gridFontFamily: family });
                onUpdateLayer(selectedLayer.id, {
                  fontFamily: family,
                  properties: {
                    ...props,
                    fontFamily: family,
                    gridFontFamily: family,
                  },
                });
                handleFontSelect(family);
              }}
              isFontLoading={isFontLoading}
            />

            {/* 4. Font Size (px) Input */}
            <div className="flex items-center bg-slate-100 border border-slate-300 rounded-md h-7 px-1 shrink-0">
              <input
                type="number"
                min="1"
                max="200"
                value={props.gridFontSize ?? props.fontSize ?? 22}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") {
                    handlePropChange({ gridFontSize: "", fontSize: "" });
                  } else {
                    const v = Number(val);
                    if (!isNaN(v)) {
                      handlePropChange({ gridFontSize: v, fontSize: v });
                    }
                  }
                }}
                className="w-9 text-center font-mono font-bold bg-transparent border-none text-[11px] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                title="Grid Font Size (pt)"
              />
            </div>
            <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 p-0.5 rounded-md h-7 shrink-0" title="Filler letter color">
              <input
                type="color"
                value={props.gridTextColor || props.color || "#1E293B"}
                onChange={(e) => handlePropChange({ gridTextColor: e.target.value, color: e.target.value, fill: e.target.value })}
                className="w-5 h-5 rounded border border-slate-300 cursor-pointer p-0 bg-white shrink-0"
              />
            </div>
            <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 p-0.5 rounded-md h-7 shrink-0" title="Hidden word letter color">
              <input
                type="color"
                value={props.wordTextColor || props.gridTextColor || props.color || "#1E293B"}
                onChange={(e) => handlePropChange({ wordTextColor: e.target.value, highlightTextColor: e.target.value })}
                className="w-5 h-5 rounded border border-slate-300 cursor-pointer p-0 bg-white shrink-0"
              />
            </div>
          </>
        )}

        <div className="h-4 w-px bg-slate-200 my-auto shrink-0" />

        {/* 4. POSITION (X, Y) BADGE */}
        <div className="flex items-center gap-1 shrink-0 bg-slate-100 border border-slate-300 rounded-md h-7 px-1.5">
          <Move className="w-3 h-3 text-slate-500 shrink-0" />
          <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded px-1 h-5">
            <span className="text-[9px] font-bold text-slate-400">X:</span>
            <input
              type="number"
              value={selectedLayer.posX}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { posX: Number(e.target.value) })}
              className="w-8 font-mono text-[10px] font-bold text-slate-800 bg-transparent border-none text-center outline-none p-0 h-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              title="X Position (px)"
            />
          </div>
          <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded px-1 h-5">
            <span className="text-[9px] font-bold text-slate-400">Y:</span>
            <input
              type="number"
              value={selectedLayer.posY}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { posY: Number(e.target.value) })}
              className="w-8 font-mono text-[10px] font-bold text-slate-800 bg-transparent border-none text-center outline-none p-0 h-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              title="Y Position (px)"
            />
          </div>
        </div>

        {/* 5. FRAME DIMENSIONS (W x H) WITH ASPECT RATIO LOCK */}
        <div className="flex items-center gap-1 shrink-0 bg-slate-100 border border-slate-300 rounded-md h-7 px-1.5">
          <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded px-1 h-5">
            <span className="text-[9px] font-bold text-slate-400">W:</span>
            <input
              type="number"
              value={selectedLayer.width}
              onChange={(e) => {
                const newW = Number(e.target.value);
                const isImageLayer = ["ASSET", "IMAGE", "OVERLAY", "PHOTO_UPLOAD"].includes(selectedLayer.layerType);
                if (isImageLayer) {
                  const ratio = props.aspectRatio || (selectedLayer.width / selectedLayer.height) || 1;
                  const newH = Math.max(1, Math.round(newW / ratio));
                  onUpdateLayer(selectedLayer.id, { width: newW, height: newH });
                } else {
                  onUpdateLayer(selectedLayer.id, { width: newW });
                }
              }}
              className="w-8 font-mono text-[10px] font-bold text-slate-800 bg-transparent border-none text-center outline-none p-0 h-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              title="Width (px)"
            />
          </div>
          <span className="text-slate-400 font-bold text-[10px]">×</span>
          <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded px-1 h-5">
            <span className="text-[9px] font-bold text-slate-400">H:</span>
            <input
              type="number"
              value={selectedLayer.height}
              onChange={(e) => {
                const newH = Number(e.target.value);
                const isImageLayer = ["ASSET", "IMAGE", "OVERLAY", "PHOTO_UPLOAD"].includes(selectedLayer.layerType);
                if (isImageLayer) {
                  const ratio = props.aspectRatio || (selectedLayer.width / selectedLayer.height) || 1;
                  const newW = Math.max(1, Math.round(newH * ratio));
                  onUpdateLayer(selectedLayer.id, { width: newW, height: newH });
                } else {
                  onUpdateLayer(selectedLayer.id, { height: newH });
                }
              }}
              className="w-8 font-mono text-[10px] font-bold text-slate-800 bg-transparent border-none text-center outline-none p-0 h-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              title="Height (px)"
            />
          </div>
        </div>

        {/* 6. ROTATION ° */}
        <div className="flex items-center gap-1 shrink-0 bg-slate-100 border border-slate-300 rounded-md h-7 px-1.5">
          <RotateCw className="w-3 h-3 text-slate-500 shrink-0" />
          <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded px-1 h-5">
            <input
              type="number"
              value={selectedLayer.rotation}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { rotation: Number(e.target.value) })}
              className="w-7 font-mono text-[10px] font-bold text-slate-800 bg-transparent border-none text-center outline-none p-0 h-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              title="Rotation Angle (°)"
            />
            <span className="text-[9px] font-bold text-slate-400 pointer-events-none">°</span>
          </div>
        </div>
      </div>

      {/* RIGHT SECTION: ADVANCED PROPERTIES POPOVER CARD */}
      <div className="relative shrink-0 ml-1 z-50">
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
            className={`h-8 px-2.5 rounded-lg border font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              advancedOpen || hasAdvancedModified
                ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                : "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
            }`}
            title="Advanced Visual Effects & Settings"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Advanced</span>
            {hasAdvancedModified && !advancedOpen && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
            <ChevronDown className="w-3 h-3 opacity-80" />
          </button>

        {/* ADVANCED PROPERTIES POPOVER CARD */}
        {advancedOpen && (
          <div className="absolute top-full right-0 mt-1.5 w-84 bg-white border border-slate-200 rounded-xl shadow-2xl p-4 space-y-3.5 z-50 animate-in fade-in zoom-in-95 duration-150 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-indigo-600" /> Advanced Visual Effects
              </span>
              <button
                type="button"
                onClick={() => setAdvancedOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedLayer.layerType === "TEXT" && (
              <TextGradientEditor props={props} onChange={(patch) => handlePropChange(patch)} />
            )}

            {/* AUTO-FIT FRAME TOGGLE */}
            {selectedLayer.layerType === "TEXT" && (
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Auto-Fit to Container</span>
                    <span className="text-[10px] text-slate-400 block">Auto-scale text to fit inside frame</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const isTurningOn = props.autoFit === false || props.allowMultiline;
                    if (isTurningOn) {
                      onUpdateLayer(selectedLayer.id, {
                        properties: {
                          ...(selectedLayer.properties || {}),
                          autoFit: true,
                          allowMultiline: false,
                        },
                      });
                    } else {
                      handlePropChange("autoFit", false);
                    }
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                    props.autoFit !== false && !props.allowMultiline
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                  }`}
                >
                  {props.autoFit !== false && !props.allowMultiline ? "ON" : "OFF"}
                </button>
              </div>
            )}

            {selectedLayer.layerType === "DOODLE_ALPHABET" && (
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Auto Shrink to Fit</span>
                  <span className="text-[10px] text-slate-400 block">Downscale when the word is wider than the frame</span>
                </div>
                <button
                  type="button"
                  onClick={() => handlePropChange("autoFitContainer", props.autoFitContainer === false)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                    props.autoFitContainer !== false
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                  }`}
                >
                  {props.autoFitContainer !== false ? "ON" : "OFF"}
                </button>
              </div>
            )}

            {/* OPACITY */}
            <div className="space-y-1 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-700">Opacity / Transparency</span>
                <span className="font-mono font-bold text-indigo-600">
                  {Math.round((props.opacity !== undefined ? Number(props.opacity) : 1) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={props.opacity !== undefined ? Number(props.opacity) : 1}
                onChange={(e) => handlePropChange("opacity", Number(e.target.value))}
                className="w-full cursor-pointer accent-indigo-600"
              />
            </div>

            {/* TEXT CURVATURE */}
            {selectedLayer.layerType === "TEXT" && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">
                    Text Curvature
                  </span>
                  <span className="font-mono font-bold text-indigo-600">
                    {props.curveAngle || 0}°
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400">Smile (-360°)</span>
                  <input
                    type="range"
                    min="-360"
                    max="360"
                    step="5"
                    value={props.curveAngle || 0}
                    onChange={(e) => handlePropChange("curveAngle", Number(e.target.value))}
                    className="w-full cursor-pointer accent-indigo-600"
                  />
                  <span className="text-[10px] font-bold text-slate-400">Arch (+360°)</span>
                </div>
                <div className="grid grid-cols-5 gap-1 pt-1">
                  <button type="button" onClick={() => handlePropChange("curveAngle", 180)} className={`py-1 rounded border text-[9px] font-bold cursor-pointer transition text-center ${props.curveAngle === 180 ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"}`}>+180°</button>
                  <button type="button" onClick={() => handlePropChange("curveAngle", 90)} className={`py-1 rounded border text-[9px] font-bold cursor-pointer transition text-center ${props.curveAngle === 90 ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"}`}>+90°</button>
                  <button type="button" onClick={() => handlePropChange("curveAngle", 0)} className={`py-1 rounded border text-[9px] font-bold cursor-pointer transition text-center ${!props.curveAngle || props.curveAngle === 0 ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"}`}>0°</button>
                  <button type="button" onClick={() => handlePropChange("curveAngle", -90)} className={`py-1 rounded border text-[9px] font-bold cursor-pointer transition text-center ${props.curveAngle === -90 ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"}`}>-90°</button>
                  <button type="button" onClick={() => handlePropChange("curveAngle", -180)} className={`py-1 rounded border text-[9px] font-bold cursor-pointer transition text-center ${props.curveAngle === -180 ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"}`}>-180°</button>
                </div>
              </div>
            )}

            {selectedLayer.layerType === "TEXT" && (
              <>
                {/* 1. TEXT STROKE / BORDER CARD */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" /> Text Stroke / Border
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePropChange("strokeWidth", (props.strokeWidth || 0) > 0 ? 0 : 2)}
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition cursor-pointer ${
                        (props.strokeWidth || 0) > 0
                          ? "bg-indigo-600 text-white shadow-2xs"
                          : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                      }`}
                    >
                      {(props.strokeWidth || 0) > 0 ? "ON" : "OFF"}
                    </button>
                  </div>

                  {(props.strokeWidth || 0) > 0 && (
                    <div className="space-y-2.5 pt-1.5 border-t border-slate-200/60 animate-in fade-in zoom-in-95 duration-100">
                      {/* Color Picker & Hex Code */}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 font-medium">Stroke Color</span>
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded px-1.5 py-0.5 shadow-2xs">
                          <input
                            type="color"
                            value={props.strokeColor || "#000000"}
                            onChange={(e) => handlePropChange("strokeColor", e.target.value)}
                            className="w-5 h-5 rounded cursor-pointer p-0 border border-slate-300"
                          />
                          <span className="font-mono text-[11px] font-bold text-slate-700 uppercase">
                            {props.strokeColor || "#000000"}
                          </span>
                        </div>
                      </div>

                      {/* Stroke Width Slider + Number Input */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 font-medium">Stroke Thickness</span>
                          <span className="font-mono font-bold text-indigo-600">
                            {props.strokeWidth || 0}px
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="1"
                            max="20"
                            value={props.strokeWidth || 1}
                            onChange={(e) => handlePropChange("strokeWidth", Number(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600"
                          />
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={props.strokeWidth || 1}
                            onChange={(e) => handlePropChange("strokeWidth", Number(e.target.value))}
                            className="w-12 font-mono text-[11px] border border-slate-300 rounded px-1 py-0.5 text-center font-bold bg-white outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. DROP SHADOW CARD */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-500" /> Drop Shadow Effect
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handlePropChange(
                          "shadowBlur",
                          (props.shadowBlur || 0) > 0 || (props.shadowOffsetX || 0) !== 0 || (props.shadowOffsetY || 0) !== 0 ? 0 : 8
                        )
                      }
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition cursor-pointer ${
                        (props.shadowBlur || 0) > 0 || (props.shadowOffsetX || 0) !== 0 || (props.shadowOffsetY || 0) !== 0
                          ? "bg-indigo-600 text-white shadow-2xs"
                          : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                      }`}
                    >
                      {(props.shadowBlur || 0) > 0 || (props.shadowOffsetX || 0) !== 0 || (props.shadowOffsetY || 0) !== 0
                        ? "ON"
                        : "OFF"}
                    </button>
                  </div>

                  {((props.shadowBlur || 0) > 0 || (props.shadowOffsetX || 0) !== 0 || (props.shadowOffsetY || 0) !== 0) && (
                    <div className="space-y-2.5 pt-1.5 border-t border-slate-200/60 animate-in fade-in zoom-in-95 duration-100">
                      {/* Shadow Color */}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 font-medium">Shadow Color</span>
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded px-1.5 py-0.5 shadow-2xs">
                          <input
                            type="color"
                            value={props.shadowColor || "#000000"}
                            onChange={(e) => handlePropChange("shadowColor", e.target.value)}
                            className="w-5 h-5 rounded cursor-pointer p-0 border border-slate-300"
                          />
                          <span className="font-mono text-[11px] font-bold text-slate-700 uppercase">
                            {props.shadowColor || "#000000"}
                          </span>
                        </div>
                      </div>

                      {/* Shadow Blur Slider */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 font-medium">Blur Softness</span>
                          <span className="font-mono font-bold text-indigo-600">{props.shadowBlur || 0}px</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="50"
                          value={props.shadowBlur || 0}
                          onChange={(e) => handlePropChange("shadowBlur", Number(e.target.value))}
                          className="w-full cursor-pointer accent-indigo-600"
                        />
                      </div>

                      {/* Offsets X & Y Sliders */}
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                            <span>Offset X</span>
                            <span className="font-mono font-bold text-slate-700">{props.shadowOffsetX || 0}px</span>
                          </div>
                          <input
                            type="range"
                            min="-30"
                            max="30"
                            value={props.shadowOffsetX || 0}
                            onChange={(e) => handlePropChange("shadowOffsetX", Number(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                            <span>Offset Y</span>
                            <span className="font-mono font-bold text-slate-700">{props.shadowOffsetY || 0}px</span>
                          </div>
                          <input
                            type="range"
                            min="-30"
                            max="30"
                            value={props.shadowOffsetY || 0}
                            onChange={(e) => handlePropChange("shadowOffsetY", Number(e.target.value))}
                            className="w-full cursor-pointer accent-indigo-600"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {selectedLayer.layerType === "WORD_SEARCH_PUZZLE" && (
              <div className="space-y-3 pt-1 border-t border-slate-100">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Word case</label>
                    <select
                      value={props.textTransform || props.wordStyle || "UPPERCASE"}
                      onChange={(e) => handlePropChange({ textTransform: e.target.value, wordStyle: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-[11px] font-bold outline-none"
                    >
                      <option value="UPPERCASE">UPPERCASE</option>
                      <option value="LOWERCASE">lowercase</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Weight</label>
                    <select
                      value={props.fontWeight || "bold"}
                      onChange={(e) => handlePropChange("fontWeight", e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-[11px] font-bold outline-none"
                    >
                      <option value="bold">Bold</option>
                      <option value="normal">Normal</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800">Oval highlights</span>
                  <input
                    type="checkbox"
                    checked={props.showHighlights !== false}
                    onChange={(e) => handlePropChange("showHighlights", e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                </div>
                {props.showHighlights !== false && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-600">Oval color</span>
                      <input
                        type="color"
                        value={props.highlightColor || "#FD005D"}
                        onChange={(e) => handlePropChange("highlightColor", e.target.value)}
                        className="w-7 h-6 rounded border border-slate-300 cursor-pointer p-0"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                        <span>Border width</span>
                        <span className="font-mono">{props.highlightLineWidth || 4}px</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="0.5"
                        value={props.highlightLineWidth || 4}
                        onChange={(e) => handlePropChange("highlightLineWidth", Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                    </div>
                    <label className="flex items-center justify-between text-[11px] font-semibold text-slate-700 cursor-pointer">
                      <span>Transparent fill</span>
                      <input
                        type="checkbox"
                        checked={props.transparentHighlightFill === true}
                        onChange={(e) => handlePropChange("transparentHighlightFill", e.target.checked)}
                        className="w-3.5 h-3.5 text-indigo-600 rounded cursor-pointer"
                      />
                    </label>
                    {props.transparentHighlightFill !== true && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold text-slate-600">Fill color</span>
                        <input
                          type="color"
                          value={props.highlightFillColor || props.highlightColor || "#FD005D"}
                          onChange={(e) => handlePropChange("highlightFillColor", e.target.value)}
                          className="w-7 h-6 rounded border border-slate-300 cursor-pointer p-0"
                        />
                      </div>
                    )}
                    {props.transparentHighlightFill !== true && (
                      <div>
                        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                          <span>Fill opacity</span>
                          <span className="font-mono">
                            {Math.round((props.highlightFillOpacity !== undefined ? Number(props.highlightFillOpacity) : 0.22) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.05"
                          max="1"
                          step="0.05"
                          value={props.highlightFillOpacity !== undefined ? Number(props.highlightFillOpacity) : 0.22}
                          onChange={(e) => handlePropChange("highlightFillOpacity", Number(e.target.value))}
                          className="w-full accent-indigo-600"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
