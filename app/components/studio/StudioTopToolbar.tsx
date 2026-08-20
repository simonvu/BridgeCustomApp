import React, { useState } from "react";
import { CanvasLayerItem } from "./StudioCanvas";
import { FontItem } from "../../utils/fontLoader";
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
} from "lucide-react";

interface StudioTopToolbarProps {
  selectedLayer: CanvasLayerItem | null;
  fonts?: FontItem[];
  onUpdateLayer: (layerId: string, updatedProps: Partial<CanvasLayerItem>) => void;
}

export default function StudioTopToolbar({
  selectedLayer,
  fonts = [],
  onUpdateLayer,
}: StudioTopToolbarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  if (!selectedLayer) {
    return (
      <div className="h-11 bg-white border-b border-slate-200 px-4 flex items-center justify-between text-xs text-slate-400 select-none shrink-0 shadow-2xs">
        <span className="flex items-center gap-2 text-slate-400 font-medium italic">
          <Sliders className="w-3.5 h-3.5" /> Select any layer on canvas to edit visual properties
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

  const hasAdvancedModified =
    (props.strokeWidth || 0) > 0 ||
    (props.shadowBlur || 0) > 0 ||
    (props.shadowOffsetX || 0) !== 0 ||
    (props.shadowOffsetY || 0) !== 0 ||
    (props.opacity !== undefined && props.opacity < 1) ||
    props.autoFit === false;

  return (
    <div className="relative z-30 h-11 bg-white border-b border-slate-200 px-3 flex items-center justify-between gap-2 text-xs select-none shrink-0 shadow-2xs w-full">
      {/* LEFT SECTION: Core Visual Toolbar Controls (Scrolls internally if narrow) */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 flex-1 min-w-0">
        {/* Layer Badge Name */}
        <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md font-semibold text-[#303030] shrink-0">
          {selectedLayer.layerType === "TEXT" ? (
            <Type className="w-3.5 h-3.5 text-indigo-600" />
          ) : (
            <Layers className="w-3.5 h-3.5 text-blue-600" />
          )}
          <span className="truncate max-w-[110px]">{selectedLayer.name}</span>
        </div>

        <div className="h-5 w-px bg-slate-200 my-auto shrink-0" />

        {/* TEXT LAYER CORE PROPERTIES */}
        {selectedLayer.layerType === "TEXT" && (
          <>
            {/* 1. Font Family Picker */}
            <div className="flex items-center gap-1 shrink-0">
              <select
                value={props.fontFamily || "Roboto"}
                onChange={(e) => handlePropChange("fontFamily", e.target.value)}
                className="h-8 border border-slate-300 rounded-lg px-2 bg-white text-xs font-semibold cursor-pointer focus:ring-2 focus:ring-blue-500 focus:outline-none hover:border-slate-400 max-w-[130px]"
                style={{ fontFamily: props.fontFamily || "Roboto" }}
              >
                {fonts.map((f) => (
                  <option key={f.id} value={f.family} style={{ fontFamily: f.family }}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Font Size (px) Input with -/+ buttons */}
            <div className="flex items-center bg-slate-100 border border-slate-300 rounded-lg h-8 px-1 shrink-0">
              <button
                type="button"
                onClick={() => handlePropChange("fontSize", Math.max(8, (props.fontSize || 36) - 2))}
                className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-white rounded font-bold cursor-pointer"
                title="Decrease font size"
              >
                -
              </button>
              <input
                type="number"
                value={props.fontSize || 36}
                onChange={(e) => handlePropChange("fontSize", Number(e.target.value))}
                className="w-10 text-center font-mono font-bold bg-transparent border-none text-xs focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handlePropChange("fontSize", (props.fontSize || 36) + 2)}
                className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-white rounded font-bold cursor-pointer"
                title="Increase font size"
              >
                +
              </button>
            </div>

            <div className="h-5 w-px bg-slate-200 my-auto shrink-0" />

            {/* 3. Color Picker (Solid vs Gradient) */}
            <div className="flex items-center gap-1.5 shrink-0">
              {props.colorMode === "GRADIENT" ? (
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 px-1.5 py-0.5 rounded-lg">
                  <span className="text-[9px] font-bold text-pink-600">Grad</span>
                  <input
                    type="color"
                    value={props.gradientColor1 || "#3b82f6"}
                    onChange={(e) => handlePropChange("gradientColor1", e.target.value)}
                    className="w-5 h-5 rounded cursor-pointer p-0 border border-slate-300"
                    title="Gradient Start Color"
                  />
                  <input
                    type="color"
                    value={props.gradientColor2 || "#ec4899"}
                    onChange={(e) => handlePropChange("gradientColor2", e.target.value)}
                    className="w-5 h-5 rounded cursor-pointer p-0 border border-slate-300"
                    title="Gradient End Color"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="color"
                    value={props.color || "#1e293b"}
                    onChange={(e) => handlePropChange("color", e.target.value)}
                    className="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0.5 bg-white"
                    title="Font Color"
                  />
                  <input
                    type="text"
                    value={props.color || "#1e293b"}
                    onChange={(e) => handlePropChange("color", e.target.value)}
                    className="w-16 font-mono text-[11px] border border-slate-300 rounded px-1.5 py-1 focus:ring-1 focus:ring-blue-500 uppercase"
                  />
                </div>
              )}

              {/* Toggle Color Mode */}
              <button
                type="button"
                onClick={() =>
                  handlePropChange("colorMode", props.colorMode === "GRADIENT" ? "SOLID" : "GRADIENT")
                }
                className={`text-[10px] font-bold px-1.5 py-1 rounded border cursor-pointer ${
                  props.colorMode === "GRADIENT"
                    ? "bg-pink-50 border-pink-300 text-pink-700"
                    : "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {props.colorMode === "GRADIENT" ? "Gradient" : "Solid"}
              </button>
            </div>

            <div className="h-5 w-px bg-slate-200 my-auto shrink-0" />

            {/* 4. Horizontal & Vertical Align Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => handlePropChange("align", "left")}
                className={`w-7 h-7 flex items-center justify-center rounded transition cursor-pointer ${
                  props.align === "left" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align Left"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("align", "center")}
                className={`w-7 h-7 flex items-center justify-center rounded transition cursor-pointer ${
                  !props.align || props.align === "center" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align Center"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("align", "right")}
                className={`w-7 h-7 flex items-center justify-center rounded transition cursor-pointer ${
                  props.align === "right" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align Right"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => handlePropChange("verticalAlign", "top")}
                className={`w-7 h-7 flex items-center justify-center rounded transition cursor-pointer ${
                  props.verticalAlign === "top" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align Top"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16" strokeWidth="2.5" />
                  <rect x="7" y="8" width="10" height="12" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("verticalAlign", "middle")}
                className={`w-7 h-7 flex items-center justify-center rounded transition cursor-pointer ${
                  !props.verticalAlign || props.verticalAlign === "middle" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align Middle"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12h16" strokeWidth="2.5" />
                  <rect x="7" y="5" width="10" height="14" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("verticalAlign", "bottom")}
                className={`w-7 h-7 flex items-center justify-center rounded transition cursor-pointer ${
                  props.verticalAlign === "bottom" ? "bg-white shadow-2xs text-blue-600 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
                title="Align Bottom"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 20h16" strokeWidth="2.5" />
                  <rect x="7" y="4" width="10" height="12" rx="1" />
                </svg>
              </button>
            </div>
          </>
        )}

        {/* 5. FRAME DIMENSIONS (W x H) & ROTATION ANGLE ° (DIRECTLY ON MAIN TOP BAR) */}
        <div className="h-5 w-px bg-slate-200 my-auto shrink-0" />

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-semibold text-slate-500">Frame:</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={selectedLayer.width}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { width: Number(e.target.value) })}
              className="w-14 font-mono text-[11px] border border-slate-300 rounded px-1.5 py-1 text-center font-bold bg-white focus:ring-1 focus:ring-blue-500 outline-none"
              title="Width (px)"
            />
            <span className="text-slate-400 font-bold">×</span>
            <input
              type="number"
              value={selectedLayer.height}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { height: Number(e.target.value) })}
              className="w-14 font-mono text-[11px] border border-slate-300 rounded px-1.5 py-1 text-center font-bold bg-white focus:ring-1 focus:ring-blue-500 outline-none"
              title="Height (px)"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 border border-slate-300 rounded-lg h-8 px-1.5">
          <RotateCw className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <div className="relative flex items-center bg-white border border-slate-200 rounded px-1">
            <input
              type="number"
              value={selectedLayer.rotation}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { rotation: Number(e.target.value) })}
              className="w-10 font-mono text-[11px] font-bold text-slate-800 bg-transparent border-none text-center outline-none p-0 pr-2.5 h-6"
              title="Rotation Angle (°)"
            />
            <span className="absolute right-1 text-[11px] font-bold text-slate-400 pointer-events-none">°</span>
          </div>
        </div>
      </div>

      {/* RIGHT SECTION: Advanced Properties Button & Popover */}
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
          <div className="absolute top-full right-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl p-4 space-y-4 z-50 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-indigo-600" /> Advanced Effects & Settings
              </span>
              <button
                type="button"
                onClick={() => setAdvancedOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. AUTO-FIT FRAME TOGGLE */}
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
                  onClick={() => handlePropChange("autoFit", !(props.autoFit !== false))}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                    props.autoFit !== false
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {props.autoFit !== false ? "ON" : "OFF"}
                </button>
              </div>
            )}

            {/* 2. OPACITY */}
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

            {/* 3. TEXT CURVATURE (BẺ CONG TEXT) */}
            {selectedLayer.layerType === "TEXT" && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">
                    Text Curvature (Bẻ Cong)
                  </span>
                  <span className="font-mono font-bold text-indigo-600">
                    {props.curveAngle || 0}°
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400">Smile (-180°)</span>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="5"
                    value={props.curveAngle || 0}
                    onChange={(e) => handlePropChange("curveAngle", Number(e.target.value))}
                    className="w-full cursor-pointer accent-indigo-600"
                  />
                  <span className="text-[10px] font-bold text-slate-400">Arch (+180°)</span>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handlePropChange("curveAngle", 60)}
                    className={`flex-1 py-1 rounded border text-[10px] font-bold cursor-pointer transition ${
                      props.curveAngle === 60 ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    Arch (+60°)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePropChange("curveAngle", 0)}
                    className={`flex-1 py-1 rounded border text-[10px] font-bold cursor-pointer transition ${
                      !props.curveAngle || props.curveAngle === 0 ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    Straight (0°)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePropChange("curveAngle", -60)}
                    className={`flex-1 py-1 rounded border text-[10px] font-bold cursor-pointer transition ${
                      props.curveAngle === -60 ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    Valley (-60°)
                  </button>
                </div>
              </div>
            )}

            {/* 3. TEXT STROKE & SHADOW EFFECTS */}
            {selectedLayer.layerType === "TEXT" && (
              <>
                {/* Stroke / Border */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Text Stroke / Border
                  </span>
                  <div className="grid grid-cols-2 gap-2 items-center">
                    <div>
                      <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Width (px)</span>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={props.strokeWidth || 0}
                        onChange={(e) => handlePropChange("strokeWidth", Number(e.target.value))}
                        className="w-full border border-slate-300 rounded px-2 py-1 font-mono text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Stroke Color</span>
                      <input
                        type="color"
                        value={props.strokeColor || "#000000"}
                        onChange={(e) => handlePropChange("strokeColor", e.target.value)}
                        className="w-full h-7 rounded border border-slate-300 cursor-pointer p-0.5 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Drop Shadow */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Drop Shadow
                  </span>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Shadow Color</span>
                        <input
                          type="color"
                          value={props.shadowColor || "#000000"}
                          onChange={(e) => handlePropChange("shadowColor", e.target.value)}
                          className="w-full h-6 rounded border border-slate-300 cursor-pointer p-0.5 bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Blur (px)</span>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={props.shadowBlur || 0}
                          onChange={(e) => handlePropChange("shadowBlur", Number(e.target.value))}
                          className="w-full border border-slate-300 rounded px-1.5 py-0.5 font-mono text-xs focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Offset X</span>
                        <input
                          type="number"
                          min="-50"
                          max="50"
                          value={props.shadowOffsetX || 0}
                          onChange={(e) => handlePropChange("shadowOffsetX", Number(e.target.value))}
                          className="w-full border border-slate-300 rounded px-1.5 py-0.5 font-mono text-xs focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium block mb-0.5">Offset Y</span>
                        <input
                          type="number"
                          min="-50"
                          max="50"
                          value={props.shadowOffsetY || 0}
                          onChange={(e) => handlePropChange("shadowOffsetY", Number(e.target.value))}
                          className="w-full border border-slate-300 rounded px-1.5 py-0.5 font-mono text-xs focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
