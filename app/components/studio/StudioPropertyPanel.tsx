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
  fonts?: { id: string; name: string; family: string; fontType: string }[];
  onUpdateLayer: (layerId: string, updatedProps: Partial<CanvasLayerItem>) => void;
  onOpenMediaPickerForLayer?: (layerId: string, bgOptionIndex?: number) => void;
}

export default function StudioPropertyPanel({
  selectedLayer,
  fields,
  fonts = [],
  onUpdateLayer,
  onOpenMediaPickerForLayer,
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

        {/* Graphic Asset Selector (If LayerType is ASSET or OVERLAY) */}
        {(selectedLayer.layerType === "ASSET" || selectedLayer.layerType === "OVERLAY") && (
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-emerald-600" /> Graphic Image Source
            </h4>

            {props.assetUrl ? (
              <div className="space-y-2">
                <div className="w-full aspect-square max-h-40 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center p-2">
                  <img src={props.assetUrl} alt="" className="w-full h-full object-contain" />
                </div>
                <button
                  type="button"
                  onClick={() => onOpenMediaPickerForLayer && onOpenMediaPickerForLayer(selectedLayer.id)}
                  className="w-full py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition"
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
                onChange={(e) => onUpdateLayer(selectedLayer.id, { width: Number(e.target.value) })}
                className="w-full border border-slate-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Height (px)</label>
              <input
                type="number"
                value={selectedLayer.height}
                onChange={(e) => onUpdateLayer(selectedLayer.id, { height: Number(e.target.value) })}
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
