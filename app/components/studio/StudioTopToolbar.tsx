import React, { useState } from "react";
import { CanvasLayerItem } from "./StudioCanvas";
import { FontItem, loadSingleFontOnDemand } from "../../utils/fontLoader";
import StudioFontPicker from "./StudioFontPicker";
import {
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCw,
  Sparkles,
  Sliders,
  Layers,
  ChevronDown,
  X,
  SlidersHorizontal,
  Grid,
  ZoomIn,
  ZoomOut,
  Move,
  Image as ImageIcon,
  Eye,
  ListFilter,
} from "lucide-react";

interface StudioTopToolbarProps {
  selectedLayer: CanvasLayerItem | null;
  fonts?: FontItem[];
  onUpdateLayer: (layerId: string, updatedProps: Partial<CanvasLayerItem>) => void;
  onOpenMediaPickerForLayer?: (layerId: string) => void;
}

export default function StudioTopToolbar({
  selectedLayer,
  fonts = [],
  onUpdateLayer,
  onOpenMediaPickerForLayer,
}: StudioTopToolbarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isFontLoading, setIsFontLoading] = useState(false);

  if (!selectedLayer) {
    return (
      <div className="h-11 bg-white border-b border-slate-200 px-3 flex items-center justify-between text-xs text-slate-400 select-none shrink-0 shadow-2xs w-full">
        <span className="flex items-center gap-2 text-slate-400 font-medium italic">
          <Sliders className="w-3.5 h-3.5" /> Select any layer on canvas to edit visual properties
        </span>
      </div>
    );
  }

  if (selectedLayer.linkedFieldId) {
    return (
      <div className="h-11 bg-white border-b border-slate-200 px-3 flex items-center justify-between text-xs text-slate-500 select-none shrink-0 shadow-2xs w-full">
        <span className="flex items-center gap-2 text-indigo-700 font-semibold">
          <ListFilter className="w-4 h-4 text-indigo-600" />
          List / Item Layer ({selectedLayer.name}) - Configure field settings & items in the right panel
        </span>
      </div>
    );
  }

  const props = selectedLayer.properties || {};

  const handlePropChange = (key: string, value: any) => {
    onUpdateLayer(selectedLayer.id, {
      properties: { ...props, [key]: value },
    });
  };

  const isImageLayer = ["ASSET", "IMAGE", "OVERLAY", "PHOTO_UPLOAD"].includes(selectedLayer.layerType);

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
        properties: { ...props, fontFamily: family, fontWeight: "normal" },
      });
    }
  };

  const hasAdvancedModified =
    (props.strokeWidth || 0) > 0 ||
    props.colorMode === "GRADIENT" ||
    (props.shadowBlur || 0) > 0 ||
    (props.curveAngle || 0) !== 0 ||
    props.opacity !== undefined ||
    props.autoFit === false;

  return (
    <div className="relative h-11 bg-white border-b border-slate-200 px-3 flex items-center justify-between select-none shrink-0 shadow-2xs z-30 w-full">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 min-w-0 flex-1">
        {/* 1. Fieldtype Icon Badge */}
        <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-300 flex items-center justify-center shrink-0">
          {selectedLayer.layerType === "TEXT" ? (
            <Type className="w-4 h-4 text-indigo-600" />
          ) : (
            <ImageIcon className="w-4 h-4 text-emerald-600" />
          )}
        </div>

        <div className="h-5 w-px bg-slate-200 my-auto shrink-0" />

        {/* IMAGE LAYER CONTROLS (Change Image + Opacity Slider) */}
        {isImageLayer && (
          <>
            {/* Change Image Button */}
            <button
              type="button"
              onClick={() => onOpenMediaPickerForLayer && onOpenMediaPickerForLayer(selectedLayer.id)}
              className="h-7 px-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md text-emerald-700 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer shrink-0"
              title="Change Image Asset from Media Library"
            >
              <Sparkles className="w-3 h-3 text-emerald-600" />
              <span>{props.assetUrl ? "Change Image" : "Choose Image"}</span>
            </button>

            <div className="h-4 w-px bg-slate-200 my-auto shrink-0" />

            {/* Opacity Control Slider & Input */}
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

            {/* 3. Color Swatch */}
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
            </div>

            {/* 4. Bold Toggle */}
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
              title="Bold Toggle"
            >
              B
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
          </div>
        )}
      </div>
    </div>
  );
}
