import React, { useState } from "react";
import {
  Monitor,
  Plus,
  Trash2,
  Settings,
  Sparkles,
  Palette,
  X,
  Copy,
  SlidersHorizontal,
  Image as ImageIcon,
  GripVertical,
} from "lucide-react";
import { StudioFieldItem } from "./StudioFieldPanel";

export interface StudioScreenItem {
  id: string;
  name: string; // Internal admin screen title (e.g. "1 Grandkid", "4 Grandkids")
  bgUrl?: string; // Screen background image URL from R2
  bgColor?: string; // Screen solid fill color
  iconUrl?: string; // Custom icon image for ICON view mode
  sortOrder: number;
}

export interface StudioScreenFieldConfig {
  enableScreenField?: boolean; // Enable screen selector field for customers
  customerLabel?: string; // Customer label (e.g. "Number Of Grandkids")
  displayViewMode?: "BUTTON" | "DROPDOWN" | "ICON" | "THUMBNAIL"; // View mode on storefront
}

interface StudioScreenBarProps {
  screens: StudioScreenItem[];
  activeScreenId: string;
  screenFieldConfig: StudioScreenFieldConfig;
  fields: StudioFieldItem[];
  onSelectScreen: (screenId: string) => void;
  onAddScreen: () => void;
  onUpdateScreen: (screenId: string, updatedProps: Partial<StudioScreenItem>) => void;
  onUpdateScreenFieldConfig: (updatedConfig: Partial<StudioScreenFieldConfig>) => void;
  onDeleteScreen: (screenId: string) => void;
  onDuplicateScreen?: (screenId: string) => void;
  onReorderScreens?: (reorderedScreens: StudioScreenItem[]) => void;
  onOpenMediaPickerForScreenBg?: (screenId: string) => void;
  onOpenMediaPickerForScreenIcon?: (screenId: string) => void;
}

export default function StudioScreenBar({
  screens,
  activeScreenId,
  screenFieldConfig,
  fields,
  onSelectScreen,
  onAddScreen,
  onUpdateScreen,
  onUpdateScreenFieldConfig,
  onDeleteScreen,
  onDuplicateScreen,
  onReorderScreens,
  onOpenMediaPickerForScreenBg,
  onOpenMediaPickerForScreenIcon,
}: StudioScreenBarProps) {
  const [showGlobalConfigModal, setShowGlobalConfigModal] = useState(false);
  const [showScreenModal, setShowScreenModal] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const isMultiScreenEnabled = screenFieldConfig.enableScreenField === true;
  const activeScreen = screens.find((s) => s.id === activeScreenId) || screens[0];
  const displayedScreens = isMultiScreenEnabled ? screens : [screens[0]];

  // Drag & Drop Reordering Handlers for Screen Tabs
  const handleDragStart = (idx: number) => {
    if (!isMultiScreenEnabled) return;
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, targetIdx: number) => {
    if (!isMultiScreenEnabled || draggedIdx === null || draggedIdx === targetIdx) return;
    e.preventDefault();
    if (onReorderScreens) {
      const reordered = [...screens];
      const [movedItem] = reordered.splice(draggedIdx, 1);
      reordered.splice(targetIdx, 0, movedItem);
      const updated = reordered.map((s, i) => ({ ...s, sortOrder: i }));
      onReorderScreens(updated);
      setDraggedIdx(targetIdx);
    }
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  return (
    <div className="bg-white text-slate-800 px-4 py-2 flex items-center justify-between border-b border-slate-200 shadow-2xs z-20 shrink-0 select-none">
      {/* Left: Screen Header & Config Icon & Screen Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto max-w-[80%] py-0.5">
        {/* Title */}
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider shrink-0">
          <Monitor className="w-4 h-4 text-blue-600" /> Screens ({displayedScreens.length}):
        </div>

        {/* COMPACT ICON BUTTON (Placed right next to SCREENS title) */}
        <button
          type="button"
          onClick={() => setShowGlobalConfigModal(true)}
          className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1.5 text-xs font-bold shrink-0 ${
            isMultiScreenEnabled
              ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-2xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-300"
          }`}
          title={
            isMultiScreenEnabled
              ? "Multi-Screen Customer Field is ENABLED (Click to configure)"
              : "Multi-Screen Field is DISABLED (Click to enable)"
          }
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="text-[10px] font-extrabold px-1 rounded bg-white/20">
            {isMultiScreenEnabled ? "ON" : "OFF"}
          </span>
        </button>

        <div className="w-[1px] h-4 bg-slate-200 mx-1 shrink-0" />

        {/* Screen Tabs Bar (Supports Drag & Drop Re-ordering when Multi-Screen is ON) */}
        {displayedScreens.map((scr, idx) => {
          const isActive = scr.id === activeScreenId;
          const isDraggingThis = draggedIdx === idx;

          return (
            <div
              key={scr.id}
              draggable={isMultiScreenEnabled}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelectScreen(scr.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 border ${
                isDraggingThis ? "opacity-40 border-dashed border-blue-400 bg-blue-50" : ""
              } ${
                isActive
                  ? "bg-blue-50/90 border-blue-400 text-blue-700 shadow-2xs"
                  : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900"
              } ${isMultiScreenEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
            >
              {isMultiScreenEnabled && (
                <GripVertical className="w-3 h-3 text-slate-400 shrink-0 opacity-60 hover:opacity-100" />
              )}

              <span>{scr.name || `Screen ${idx + 1}`}</span>

              {scr.bgUrl && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" title="Has Background Image" />
              )}

              {isActive && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowScreenModal(true);
                  }}
                  className="p-0.5 hover:bg-blue-200/60 rounded transition text-blue-600 cursor-pointer"
                  title="Screen Settings (Background & Icon)"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {/* Add Screen Button (ONLY SHOWN WHEN MULTI-SCREEN FIELD IS ENABLED!) */}
        {isMultiScreenEnabled && (
          <button
            type="button"
            onClick={onAddScreen}
            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg transition shrink-0 cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" /> Add Screen
          </button>
        )}
      </div>

      {/* Right: Screen Action Buttons (Duplicate / Delete) */}
      <div className="flex items-center gap-2 shrink-0">
        {isMultiScreenEnabled && onDuplicateScreen && activeScreen && (
          <button
            type="button"
            onClick={() => onDuplicateScreen(activeScreen.id)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 transition cursor-pointer shadow-2xs"
            title="Duplicate Screen (Copy Layers & Fields)"
          >
            <Copy className="w-3.5 h-3.5 text-blue-600" />
            <span>Duplicate</span>
          </button>
        )}

        {isMultiScreenEnabled && screens.length > 1 && activeScreen && (
          <button
            type="button"
            onClick={() => onDeleteScreen(activeScreen.id)}
            className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer"
            title="Delete Active Screen"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 1. GLOBAL ARTWORK SCREEN CUSTOMIZATION FIELD CONFIG MODAL */}
      {showGlobalConfigModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                Main Screen Customization Field Config
              </h3>
              <button
                onClick={() => setShowGlobalConfigModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Enable Toggle */}
              <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-blue-900 text-xs">Enable Screen Field for Customer Customization</p>
                  <p className="text-[11px] text-slate-500">
                    Turns the Screen selector into a customer field on Storefront & unlocks "+ Add Screen".
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={isMultiScreenEnabled}
                  onChange={(e) =>
                    onUpdateScreenFieldConfig({ enableScreenField: e.target.checked })
                  }
                  className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              {isMultiScreenEnabled && (
                <div className="space-y-4 pt-2">
                  {/* Customer-Facing Label */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Customer-Facing Field Label
                    </label>
                    <input
                      type="text"
                      value={screenFieldConfig.customerLabel || "Number Of Grandkids"}
                      onChange={(e) =>
                        onUpdateScreenFieldConfig({ customerLabel: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="e.g. Number Of Grandkids"
                    />
                  </div>

                  {/* Display View Mode Selector */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5">
                      Storefront Option View Mode:
                    </label>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {/* BUTTON VIEW */}
                      <button
                        type="button"
                        onClick={() => onUpdateScreenFieldConfig({ displayViewMode: "BUTTON" })}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                          !screenFieldConfig.displayViewMode || screenFieldConfig.displayViewMode === "BUTTON"
                            ? "bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <span className="font-bold text-slate-900 flex items-center gap-1">
                          🔘 Button View
                        </span>
                        <span className="text-[10px] text-slate-500 leading-tight">
                          Text buttons per screen name (e.g. 1, 2, 3, 4...)
                        </span>
                      </button>

                      {/* DROPDOWN VIEW */}
                      <button
                        type="button"
                        onClick={() => onUpdateScreenFieldConfig({ displayViewMode: "DROPDOWN" })}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                          screenFieldConfig.displayViewMode === "DROPDOWN"
                            ? "bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <span className="font-bold text-slate-900 flex items-center gap-1">
                          🔽 Dropdown View
                        </span>
                        <span className="text-[10px] text-slate-500 leading-tight">
                          Select dropdown list of screens
                        </span>
                      </button>

                      {/* ICON VIEW */}
                      <button
                        type="button"
                        onClick={() => onUpdateScreenFieldConfig({ displayViewMode: "ICON" })}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                          screenFieldConfig.displayViewMode === "ICON"
                            ? "bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <span className="font-bold text-slate-900 flex items-center gap-1">
                          🖼️ Icon View
                        </span>
                        <span className="text-[10px] text-slate-500 leading-tight">
                          Custom Icon thumbnail set per screen
                        </span>
                      </button>

                      {/* THUMBNAIL VIEW */}
                      <button
                        type="button"
                        onClick={() => onUpdateScreenFieldConfig({ displayViewMode: "THUMBNAIL" })}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                          screenFieldConfig.displayViewMode === "THUMBNAIL"
                            ? "bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <span className="font-bold text-slate-900 flex items-center gap-1">
                          📸 Thumbnail View
                        </span>
                        <span className="text-[10px] text-slate-500 leading-tight">
                          Auto uses each screen's background image
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGlobalConfigModal(false)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. INDIVIDUAL SCREEN SETTINGS MODAL */}
      {showScreenModal && activeScreen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-600" />
                Settings for Screen: {activeScreen.name}
              </h3>
              <button
                onClick={() => setShowScreenModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Screen Name */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Screen Option Label</label>
                <input
                  type="text"
                  value={activeScreen.name}
                  onChange={(e) => onUpdateScreen(activeScreen.id, { name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="e.g. 4 Grandkids"
                />
              </div>

              {/* Screen Background Image (Cloudflare R2) */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label className="block font-bold text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" /> Screen Background Image (R2 Base Canvas)
                </label>

                {activeScreen.bgUrl ? (
                  <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <img src={activeScreen.bgUrl} alt="" className="w-16 h-16 object-cover rounded-lg border shadow-2xs" />
                    <div className="flex-1 space-y-1">
                      <p className="text-[11px] font-bold text-slate-800 truncate">Background Set</p>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenMediaPickerForScreenBg && onOpenMediaPickerForScreenBg(activeScreen.id)
                        }
                        className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                      >
                        Change Image
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUpdateScreen(activeScreen.id, { bgUrl: undefined })}
                      className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                      title="Remove Background Image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenMediaPickerForScreenBg && onOpenMediaPickerForScreenBg(activeScreen.id)
                    }
                    className="w-full py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-emerald-600" /> Select Screen Background from R2
                  </button>
                )}
              </div>

              {/* Custom Icon Image if ICON View mode is active */}
              {screenFieldConfig.displayViewMode === "ICON" && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <label className="block font-bold text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-600" /> Custom Swatch Icon Image (for ICON View)
                  </label>

                  {activeScreen.iconUrl ? (
                    <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <img src={activeScreen.iconUrl} alt="" className="w-12 h-12 object-cover rounded-lg border shadow-2xs" />
                      <div className="flex-1 space-y-1">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenMediaPickerForScreenIcon && onOpenMediaPickerForScreenIcon(activeScreen.id)
                          }
                          className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                        >
                          Change Icon Image
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenMediaPickerForScreenIcon && onOpenMediaPickerForScreenIcon(activeScreen.id)
                      }
                      className="w-full py-2 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-800 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <ImageIcon className="w-4 h-4 text-blue-600" /> Select Icon Image from R2
                    </button>
                  )}
                </div>
              )}

              {/* Screen Base Solid Color */}
              <div className="pt-2 border-t border-slate-200">
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-indigo-600" /> Screen Base Solid Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={activeScreen.bgColor || "#ffffff"}
                    onChange={(e) => onUpdateScreen(activeScreen.id, { bgColor: e.target.value })}
                    className="w-10 h-9 rounded border border-slate-300 p-0.5 cursor-pointer"
                  />
                  <span className="font-mono text-xs text-slate-600">{activeScreen.bgColor || "#ffffff"}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowScreenModal(false)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
