import React from "react";
import { CanvasLayerItem } from "./StudioCanvas";
import { StudioFieldItem } from "./StudioFieldPanel";
import {
  SlidersHorizontal,
  Type,
  ImageIcon,
  Sparkles,
  Link,
  Maximize2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  Trash2,
  Palette,
  Eye,
  Upload,
  Edit3,
  Scissors,
} from "lucide-react";

export interface BackgroundOptionItem {
  id: string;
  label: string;
  bgType: "IMAGE" | "COLOR" | "TRANSPARENT";
  assetUrl?: string;
  color?: string;
  fitMode?: "COVER" | "CONTAIN" | "STRETCH";
  opacity?: number;
}

interface StudioPropertyPanelProps {
  selectedLayer: CanvasLayerItem | null;
  fields: StudioFieldItem[];
  fonts?: { id: string; name: string; family: string; fontType: string }[] | any;
  onUpdateLayer: (layerId: string, updatedProps: Partial<CanvasLayerItem>) => void;
  onOpenMediaPickerForLayer?: (layerId: string, bgOptionIndex?: number) => void;
  onOpenPhotoUploadModal?: (layerId: string) => void;
  onAddMaskLayer?: (photoLayerId: string) => void;
  onDeleteLayer?: (layerId: string) => void;
}

export default function StudioPropertyPanel({
  selectedLayer,
  fields,
  fonts = [],
  onUpdateLayer,
  onOpenMediaPickerForLayer,
  onOpenPhotoUploadModal,
}: StudioPropertyPanelProps) {
  if (!selectedLayer) {
    return (
      <div className="flex flex-col h-full bg-white border-l border-slate-200 w-80 shrink-0 select-none items-center justify-center p-6 text-center text-slate-400">
        <SlidersHorizontal className="w-8 h-8 text-slate-300 mb-2" />
        <p className="text-xs font-semibold text-slate-600">No Layer Selected</p>
        <p className="text-[11px] text-slate-400">Click a layer on the canvas or layer stack to edit properties</p>
      </div>
    );
  }

  const props = selectedLayer.properties || {};

  const handlePropChange = (key: string, value: any) => {
    onUpdateLayer(selectedLayer.id, {
      properties: { ...props, [key]: value },
    });
  };

  // Background Options Management
  const bgOptions: BackgroundOptionItem[] = props.bgOptions || [
    {
      id: "bg_default",
      label: "Default Background",
      bgType: props.assetUrl ? "IMAGE" : "TRANSPARENT",
      assetUrl: props.assetUrl || "",
      color: "#ffffff",
      fitMode: "COVER",
      opacity: 1,
    },
  ];
  const activeOptionIndex = props.activeOptionIndex || 0;

  const updateBgOption = (index: number, updatedItem: Partial<BackgroundOptionItem>) => {
    const newOptions = [...bgOptions];
    newOptions[index] = { ...newOptions[index], ...updatedItem };
    handlePropChange("bgOptions", newOptions);
  };

  const addBgOption = (type: "IMAGE" | "COLOR" | "TRANSPARENT") => {
    const newOpt: BackgroundOptionItem = {
      id: `bg_opt_${Date.now()}`,
      label: `Background ${bgOptions.length + 1}`,
      bgType: type,
      assetUrl: "",
      color: "#f8fafc",
      fitMode: "COVER",
      opacity: 1,
    };
    const newOptions = [...bgOptions, newOpt];
    handlePropChange("bgOptions", newOptions);
    handlePropChange("activeOptionIndex", newOptions.length - 1);
  };

  const deleteBgOption = (index: number) => {
    if (bgOptions.length <= 1) return;
    const newOptions = bgOptions.filter((_, i) => i !== index);
    handlePropChange("bgOptions", newOptions);
    handlePropChange("activeOptionIndex", Math.max(0, index - 1));
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 w-80 shrink-0 select-none overflow-y-auto">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/70">
        <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2 uppercase tracking-wider">
          <SlidersHorizontal className="w-4 h-4 text-blue-600" />
          {selectedLayer.name} Properties
        </h3>
      </div>

      <div className="p-4 space-y-4 text-xs">
        {/* Layer Name Input */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Layer Name</label>
          <input
            type="text"
            value={selectedLayer.name}
            onChange={(e) => onUpdateLayer(selectedLayer.id, { name: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold text-slate-800"
          />
        </div>

        {/* SMART BACKGROUND OPTIONS EDITOR */}
        {selectedLayer.layerType === "BACKGROUND" && (
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-blue-600" /> Background Options ({bgOptions.length})
              </h4>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => addBgOption("IMAGE")}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded cursor-pointer"
                  title="Add Image Background Option"
                >
                  + Image
                </button>
                <button
                  type="button"
                  onClick={() => addBgOption("COLOR")}
                  className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded cursor-pointer"
                  title="Add Solid Color Background Option"
                >
                  + Color
                </button>
              </div>
            </div>

            {/* Active Preview Switcher Bar */}
            {bgOptions.length > 1 && (
              <div className="bg-slate-100 p-1.5 rounded-lg border border-slate-200 space-y-1">
                <span className="text-[10px] font-semibold text-slate-600 block">Preview Background Choice:</span>
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                  {bgOptions.map((opt, idx) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handlePropChange("activeOptionIndex", idx)}
                      className={`px-2 py-1 rounded text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                        activeOptionIndex === idx
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Background Options List Editor */}
            <div className="space-y-3">
              {bgOptions.map((opt, idx) => {
                const isActive = activeOptionIndex === idx;
                return (
                  <div
                    key={opt.id}
                    className={`p-3 rounded-xl border transition space-y-2.5 ${
                      isActive
                        ? "bg-blue-50/50 border-blue-400 shadow-2xs"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={opt.label}
                        onChange={(e) => updateBgOption(idx, { label: e.target.value })}
                        className="font-bold text-xs text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none truncate px-0.5"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handlePropChange("activeOptionIndex", idx)}
                          className={`p-1 rounded ${isActive ? "text-blue-600 font-bold" : "text-slate-400"}`}
                          title="Preview on Canvas"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {bgOptions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => deleteBgOption(idx)}
                            className="text-slate-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Type</label>
                        <select
                          value={opt.bgType}
                          onChange={(e) => updateBgOption(idx, { bgType: e.target.value as any })}
                          className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs"
                        >
                          <option value="IMAGE">Image File (R2)</option>
                          <option value="COLOR">Solid Color</option>
                          <option value="TRANSPARENT">Transparent</option>
                        </select>
                      </div>

                      {opt.bgType === "IMAGE" && (
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Fit Mode</label>
                          <select
                            value={opt.fitMode || "COVER"}
                            onChange={(e) => updateBgOption(idx, { fitMode: e.target.value as any })}
                            className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs"
                          >
                            <option value="COVER">Cover (Fill Proportional)</option>
                            <option value="CONTAIN">Contain (Fit Aspect Ratio)</option>
                            <option value="STRETCH">Stretch (100% Canvas)</option>
                          </select>
                        </div>
                      )}

                      {opt.bgType === "COLOR" && (
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Fill Color</label>
                          <input
                            type="color"
                            value={opt.color || "#ffffff"}
                            onChange={(e) => updateBgOption(idx, { color: e.target.value })}
                            className="w-full h-7 rounded border border-slate-300 cursor-pointer p-0.5 bg-white"
                          />
                        </div>
                      )}
                    </div>

                    {/* Image Selector for IMAGE Type */}
                    {opt.bgType === "IMAGE" && (
                      <div className="space-y-1.5 pt-1">
                        {opt.assetUrl ? (
                          <div className="flex items-center gap-2 bg-white p-1.5 rounded border border-slate-200">
                            <img src={opt.assetUrl} alt="" className="w-10 h-10 object-cover rounded border" />
                            <button
                              type="button"
                              onClick={() => onOpenMediaPickerForLayer && onOpenMediaPickerForLayer(selectedLayer.id, idx)}
                              className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                            >
                              Change Image
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenMediaPickerForLayer && onOpenMediaPickerForLayer(selectedLayer.id, idx)}
                            className="w-full py-2 text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg flex items-center justify-center gap-1 transition cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Choose Image from R2
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TEXT FIELD SAMPLE DATA (RIGHT PANEL) */}
        {selectedLayer.layerType === "TEXT" && (
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
              <Type className="w-4 h-4 text-indigo-600" /> Text Sample Data
            </h4>

            {/* Sample Preview Text */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Sample Data / Default Text
              </label>
              <input
                type="text"
                value={props.text !== undefined ? props.text : selectedLayer.name}
                onChange={(e) => handlePropChange("text", e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs font-semibold text-slate-800 bg-white"
                placeholder="e.g. Hello Simon"
              />
              <p className="text-[10px] text-slate-400 mt-1">Sample content rendered on canvas for artwork preview</p>
            </div>
          </div>
        )}

        {/* Graphic Asset Selector & Opacity (If LayerType is ASSET or OVERLAY) */}
        {(selectedLayer.layerType === "ASSET" || selectedLayer.layerType === "OVERLAY") && (
          <div className="space-y-3 pt-3 border-t border-slate-200">
            {/* Non-customizable Static Design Element Notice */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-start gap-2 text-emerald-900">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[11px] block">Static Design Element</span>
                <span className="text-[10px] text-emerald-700 block leading-tight">
                  This image layer is strictly for artwork design composition. End customers cannot customize or change this layer.
                </span>
              </div>
            </div>

            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-emerald-600" /> Image Graphic Source
            </h4>

            {props.assetUrl ? (
              <div className="space-y-2">
                <div className="w-full aspect-square max-h-40 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center p-2">
                  <img src={props.assetUrl} alt="" className="w-full h-full object-contain" />
                </div>
                <button
                  type="button"
                  onClick={() => onOpenMediaPickerForLayer && onOpenMediaPickerForLayer(selectedLayer.id)}
                  className="w-full py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition cursor-pointer"
                >
                  Change Image Asset
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenMediaPickerForLayer && onOpenMediaPickerForLayer(selectedLayer.id)}
                className="w-full py-3 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl border-dashed flex flex-col items-center justify-center gap-1 transition cursor-pointer"
              >
                <Sparkles className="w-5 h-5 text-emerald-600" /> Choose Image from R2 Library
              </button>
            )}

            {/* Opacity Control */}
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-700">Opacity / Transparency</span>
                <span className="font-mono font-bold text-indigo-600">
                  {Math.round((props.opacity !== undefined ? Number(props.opacity) : 1) * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={props.opacity !== undefined ? Number(props.opacity) : 1}
                  onChange={(e) => handlePropChange("opacity", Number(e.target.value))}
                  className="flex-1 accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={Math.round((props.opacity !== undefined ? Number(props.opacity) : 1) * 100)}
                  onChange={(e) => handlePropChange("opacity", Math.max(0, Math.min(100, Number(e.target.value))) / 100)}
                  className="w-12 text-center font-mono text-[11px] font-bold border border-slate-300 rounded px-1 py-0.5"
                />
              </div>
            </div>
          </div>
        )}

        {/* Photo Upload Configuration (If LayerType is PHOTO_UPLOAD) */}
        {selectedLayer.layerType === "PHOTO_UPLOAD" && (
          <div className="space-y-3 pt-3 border-t border-slate-200">

            {/* Field Label & Help Text */}
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Customer Field Title / Label
                </label>
                <input
                  type="text"
                  value={props.fieldLabel !== undefined ? props.fieldLabel : "Upload Your Photo"}
                  onChange={(e) => handlePropChange("fieldLabel", e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500 focus:outline-none text-xs font-semibold text-slate-800 bg-white"
                  placeholder="e.g. Upload Your Photo"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Instructional Help Text
                </label>
                <input
                  type="text"
                  value={props.helpText !== undefined ? props.helpText : "High resolution JPG or PNG recommended"}
                  onChange={(e) => handlePropChange("helpText", e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500 focus:outline-none text-xs text-slate-800 bg-white"
                  placeholder="e.g. High resolution JPG or PNG recommended"
                />
              </div>

              <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={props.isRequired !== false}
                  onChange={(e) => handlePropChange("isRequired", e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span>Required Field for Customer Order</span>
              </label>
            </div>

            {/* Sample Photo Selector for Admin Design Composition */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="block text-[11px] font-bold text-slate-800">
                Sample Default Photo (Design Preview)
              </label>
              {props.assetUrl ? (
                <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-200 space-y-2">
                  <div className="flex items-center gap-3">
                    <img
                      src={props.assetUrl}
                      alt="Uploaded Photo"
                      className="w-14 h-14 rounded-lg object-cover border border-amber-300 shadow-2xs shrink-0"
                    />

                    {/* Replace & Delete Buttons */}
                    <div className="flex items-center gap-2 flex-1">
                      {/* Replace Button */}
                      <button
                        type="button"
                        onClick={() => onOpenMediaPickerForLayer && onOpenMediaPickerForLayer(selectedLayer.id)}
                        className="flex-1 py-1.5 px-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-700 flex items-center justify-center gap-1 transition cursor-pointer text-xs"
                        title="Replace with New Photo"
                      >
                        <Upload className="w-3.5 h-3.5 text-amber-600" />
                        <span>Replace</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handlePropChange("assetUrl", "")}
                        className="flex-1 py-1.5 px-2 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg font-semibold text-rose-700 flex items-center justify-center gap-1 transition cursor-pointer text-xs"
                        title="Remove Photo"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenMediaPickerForLayer && onOpenMediaPickerForLayer(selectedLayer.id)}
                  className="w-full py-2.5 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl border-dashed flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-amber-600" /> Choose Sample Photo
                </button>
              )}
            </div>

            {/* Add / Edit Linked Mask Layer Button */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => onAddMaskLayer && onAddMaskLayer(selectedLayer.id)}
                className="w-full py-2 px-3 bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded-xl text-purple-900 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Scissors className="w-4 h-4 text-purple-600" />
                <span>{selectedLayer.maskLayerId ? "🎭 Edit Linked Mask Layer" : "+ Add Mask Layer for Photo Upload"}</span>
              </button>
            </div>
          </div>
        )}

        {/* MASK LAYER PROPERTIES */}
        {selectedLayer.layerType === "MASK" && (
          <div className="space-y-3 pt-3 border-t border-purple-200">
            <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 space-y-3">
              <label className="block text-[11px] font-bold text-purple-900 flex items-center gap-1.5">
                <Scissors className="w-4 h-4 text-purple-600 shrink-0" />
                <span>🎭 LỚP MẶT NẠ CẮT (MASK LAYER)</span>
              </label>
              <p className="text-[10px] text-purple-700 leading-tight">
                Lớp này dùng để làm khung cắt (mask) cho Photo Upload. Hãy chỉnh vị trí X, Y, W, H và hình dạng cắt bên dưới.
              </p>

              {/* Cutout Shape Selector */}
              <div>
                <label className="block text-[10px] font-bold text-purple-800 mb-1">Khung hình dạng Cắt (Mask Cutout Shape)</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePropChange("maskShape", "RECTANGLE")}
                    className={`py-1.5 px-1 text-center text-[11px] font-bold rounded-lg border transition cursor-pointer flex items-center justify-center gap-1 ${
                      (props.maskShape || "RECTANGLE") === "RECTANGLE"
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-white text-purple-900 border-purple-200 hover:bg-purple-100/50"
                    }`}
                  >
                    <span>⏹️</span>
                    <span>Rectangle</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePropChange("maskShape", "ROUNDED")}
                    className={`py-1.5 px-1 text-center text-[11px] font-bold rounded-lg border transition cursor-pointer flex items-center justify-center gap-1 ${
                      props.maskShape === "ROUNDED"
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-white text-purple-900 border-purple-200 hover:bg-purple-100/50"
                    }`}
                  >
                    <span>🔲</span>
                    <span>Rounded</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePropChange("maskShape", "CIRCLE")}
                    className={`py-1.5 px-1 text-center text-[11px] font-bold rounded-lg border transition cursor-pointer flex items-center justify-center gap-1 ${
                      props.maskShape === "CIRCLE"
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-white text-purple-900 border-purple-200 hover:bg-purple-100/50"
                    }`}
                  >
                    <span>⚪</span>
                    <span>Circle</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePropChange("maskShape", "HEART")}
                    className={`py-1.5 px-1 text-center text-[11px] font-bold rounded-lg border transition cursor-pointer flex items-center justify-center gap-1 ${
                      props.maskShape === "HEART"
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-white text-purple-900 border-purple-200 hover:bg-purple-100/50"
                    }`}
                  >
                    <span>❤️</span>
                    <span>Heart</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePropChange("maskShape", "STAR")}
                    className={`py-1.5 px-1 text-center text-[11px] font-bold rounded-lg border transition cursor-pointer flex items-center justify-center gap-1 ${
                      props.maskShape === "STAR"
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-white text-purple-900 border-purple-200 hover:bg-purple-100/50"
                    }`}
                  >
                    <span>⭐</span>
                    <span>Star</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePropChange("maskShape", "HEXAGON")}
                    className={`py-1.5 px-1 text-center text-[11px] font-bold rounded-lg border transition cursor-pointer flex items-center justify-center gap-1 ${
                      props.maskShape === "HEXAGON"
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-white text-purple-900 border-purple-200 hover:bg-purple-100/50"
                    }`}
                  >
                    <span>⬡</span>
                    <span>Hexagon</span>
                  </button>
                </div>
              </div>

              {/* Radius Slider if ROUNDED */}
              {props.maskShape === "ROUNDED" && (
                <div className="bg-white p-2.5 rounded-lg border border-purple-200 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-purple-900">
                    <span>Corner Radius (Bo góc)</span>
                    <span className="font-mono text-purple-700">{props.borderRadius || 16}px</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={100}
                    value={props.borderRadius || 16}
                    onChange={(e) => handlePropChange("borderRadius", Number(e.target.value))}
                    className="w-full accent-purple-600 cursor-pointer"
                  />
                </div>
              )}

              {/* Custom Vector / Image Mask Asset */}
              <div>
                <label className="block text-[10px] font-bold text-purple-800 mb-1">Custom Vector / PNG Mask File</label>
                {props.maskAssetUrl ? (
                  <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-purple-200">
                    <img src={props.maskAssetUrl} alt="Mask" className="w-8 h-8 rounded border border-purple-300 object-contain bg-slate-100" />
                    <span className="text-[10px] truncate font-mono text-purple-900 flex-1">Custom Mask Asset</span>
                    <button
                      type="button"
                      onClick={() => handlePropChange("maskAssetUrl", "")}
                      className="text-xs text-rose-600 hover:underline font-bold"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenMediaPickerForLayer && onOpenMediaPickerForLayer(selectedLayer.id)}
                    className="w-full py-2 text-xs font-semibold text-purple-700 bg-white border border-purple-300 border-dashed rounded-lg hover:bg-purple-100/50 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" /> Choose Custom Mask PNG/SVG
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bounding Box Position & Dimensions */}
        <div className="space-y-3 pt-3 border-t border-slate-200">
          <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
            <Maximize2 className="w-4 h-4 text-slate-600" /> Position & Size
          </h4>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5">X Position (px)</label>
              <input
                type="number"
                value={selectedLayer.posX}
                onChange={(e) => onUpdateLayer(selectedLayer.id, { posX: Number(e.target.value) })}
                className="w-full border border-slate-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Y Position (px)</label>
              <input
                type="number"
                value={selectedLayer.posY}
                onChange={(e) => onUpdateLayer(selectedLayer.id, { posY: Number(e.target.value) })}
                className="w-full border border-slate-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Width (px)</label>
              <input
                type="number"
                value={selectedLayer.width}
                onChange={(e) => {
                  const newW = Number(e.target.value);
                  const isImageLayer = ["ASSET", "IMAGE", "OVERLAY"].includes(selectedLayer.layerType);
                  if (isImageLayer) {
                    const ratio = props.aspectRatio || (selectedLayer.width / selectedLayer.height) || 1;
                    const newH = Math.max(1, Math.round(newW / ratio));
                    onUpdateLayer(selectedLayer.id, { width: newW, height: newH });
                  } else {
                    onUpdateLayer(selectedLayer.id, { width: newW });
                  }
                }}
                className="w-full border border-slate-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Height (px)</label>
              <input
                type="number"
                value={selectedLayer.height}
                onChange={(e) => {
                  const newH = Number(e.target.value);
                  const isImageLayer = ["ASSET", "IMAGE", "OVERLAY"].includes(selectedLayer.layerType);
                  if (isImageLayer) {
                    const ratio = props.aspectRatio || (selectedLayer.width / selectedLayer.height) || 1;
                    const newW = Math.max(1, Math.round(newH * ratio));
                    onUpdateLayer(selectedLayer.id, { width: newW, height: newH });
                  } else {
                    onUpdateLayer(selectedLayer.id, { height: newH });
                  }
                }}
                className="w-full border border-slate-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Rotation (°)</label>
            <input
              type="number"
              value={selectedLayer.rotation}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { rotation: Number(e.target.value) })}
              className="w-full border border-slate-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
