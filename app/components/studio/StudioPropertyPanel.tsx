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
  EyeOff,
  Upload,
  Edit3,
  Scissors,
  Layers,
  ListFilter,
  Radio,
  LayoutGrid,
  Images,
  Copy,
  Grid,
  X,
  Package,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { autoGenerateSquareThumbnail } from "../../utils/thumbnailGenerator";
import { isEmptyOption } from "../../utils/fieldHelpers";
import type { ClipArtInstanceGroup } from "../../utils/clipArtInstance";
import { clipArtGroupsForArtworkDisplay, resolveDrivenClipArtGroups } from "../../utils/clipArtInstance";
import StudioFontPicker from "./StudioFontPicker";
import TextGradientEditor from "./TextGradientEditor";

export interface BackgroundOptionItem {
  id: string;
  label?: string;
  assetUrl?: string;
  aspectRatio?: number;
}

interface StudioPropertyPanelProps {
  selectedLayer: CanvasLayerItem | null;
  selectedLayerIds?: string[];
  fields: StudioFieldItem[];
  fonts?: { id: string; name: string; family: string; fontType: string }[] | any;
  doodlePacks?: any[];
  onUpdateLayer: (layerId: string, updatedProps: Partial<CanvasLayerItem>) => void;
  onUpdateField?: (fieldId: string, updatedProps: Partial<StudioFieldItem>) => void;
  onAddField?: (fieldType: StudioFieldItem["fieldType"]) => void;
  onOpenMediaPickerForLayer?: (layerId: string, bgOptionIndex?: number) => void;
  onOpenMediaPickerForOption?: (fieldId: string, optionIndex: number, targetType: "SWATCH" | "ASSET") => void;
  onOpenMediaPickerForBatchOptions?: (fieldId: string) => void;
  onPreviewOptionChoice?: (fieldId: string, option: any) => void;
  onOpenPhotoUploadModal?: (layerId: string) => void;
  onAddMaskLayer?: (photoLayerId: string) => void;
  onDeleteLayer?: (layerId: string) => void;
  onReloadClipArt?: (layerId: string) => void;
  reloadingClipArtLayerId?: string | null;
}

export default function StudioPropertyPanel({
  selectedLayer,
  selectedLayerIds = [],
  fields,
  fonts = [],
  doodlePacks = [],
  onUpdateLayer,
  onUpdateField,
  onAddField,
  onOpenMediaPickerForLayer,
  onOpenMediaPickerForOption,
  onOpenMediaPickerForBatchOptions,
  onPreviewOptionChoice,
  onOpenPhotoUploadModal,
  onAddMaskLayer,
  onDeleteLayer,
  onReloadClipArt,
  reloadingClipArtLayerId = null,
}: StudioPropertyPanelProps) {
  const [isUploadingMask, setIsUploadingMask] = React.useState(false);
  const [editingClipGroupId, setEditingClipGroupId] = React.useState<string | null>(null);
  const [editingClipGroupName, setEditingClipGroupName] = React.useState("");

  if (selectedLayerIds.length > 1) {
    return (
      <div className="flex flex-col h-full bg-white w-full select-none items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-3">
          <Layers className="w-6 h-6 text-blue-600" />
        </div>
        <h3 className="text-xs font-bold text-slate-900 mb-1 uppercase tracking-wider">Multi-Selection Active</h3>
        <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-extrabold mb-3">
          {selectedLayerIds.length} Layers Selected
        </span>
        <p className="text-[11px] text-slate-500 max-w-[240px] leading-relaxed">
          Drag any selected layer on canvas or use Keyboard Arrow Keys (Shift + Arrow for 10px) to move all selected layers together in lockstep.
        </p>
      </div>
    );
  }

  if (!selectedLayer) {
    return (
      <div className="flex flex-col h-full bg-white w-full select-none items-center justify-center p-6 text-center text-slate-400">
        <SlidersHorizontal className="w-8 h-8 text-slate-300 mb-2" />
        <p className="text-xs font-semibold text-slate-600">No Layer Selected</p>
        <p className="text-[11px] text-slate-400">Click a layer on the canvas or layer stack to edit properties</p>
      </div>
    );
  }

  const props = selectedLayer.properties || {};

  const handlePropChange = (keyOrObject: string | Record<string, any>, value?: any) => {
    const patch = typeof keyOrObject === "string" ? { [keyOrObject]: value } : keyOrObject;
    onUpdateLayer(selectedLayer.id, {
      properties: { ...(selectedLayer.properties || {}), ...patch },
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

  const isListTypeLayer = Boolean(
    selectedLayer.linkedFieldId ||
    selectedLayer.name.toLowerCase().includes("list") ||
    selectedLayer.name.toLowerCase().includes("dropdown") ||
    selectedLayer.name.toLowerCase().includes("select")
  );

  return (
    <div className="flex flex-col h-full bg-white w-full select-none overflow-y-auto">
      {/* Header */}
      <div className="h-9 px-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
        <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
          <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
          {selectedLayer.name} Properties
        </h3>
      </div>

      <div className="p-4 space-y-4 text-xs">
        {/* Layer Name Input (Only for non-List layers; List layers render Layer Name inside !activeOpt) */}
        {!isListTypeLayer && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Layer Name</label>
            <input
              type="text"
              value={selectedLayer.name}
              onChange={(e) => onUpdateLayer(selectedLayer.id, { name: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-semibold text-slate-800"
            />
          </div>
        )}

        {selectedLayer.layerType === "CLIPART" && (
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-start gap-2 text-emerald-900">
              <Package className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="font-bold text-[11px] block">
                  {props.clipArtName || selectedLayer.name}
                </span>
                <span className="text-[10px] text-emerald-700 block leading-tight">
                  One object on canvas. Rename groups for this artwork and pick the default option to show.
                </span>
              </div>
              <button
                type="button"
                disabled={!props.clipArtId || reloadingClipArtLayerId === selectedLayer.id}
                onClick={() => onReloadClipArt?.(selectedLayer.id)}
                title="Reload the latest clip art. Keeps this artwork's group names and selected options."
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-300 bg-white text-emerald-800 text-[10px] font-bold hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <RefreshCw
                  className={`w-3 h-3 ${reloadingClipArtLayerId === selectedLayer.id ? "animate-spin" : ""}`}
                />
                Reload
              </button>
            </div>

            {clipArtGroupsForArtworkDisplay(
              props.clipArtGroups || [],
              props.clipArtRules || []
            ).map((group) => {
              const isEditing = editingClipGroupId === group.id;
              return (
                <section key={group.id} className="rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden">
                  <header className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border-b border-slate-100">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editingClipGroupName}
                        onChange={(e) => setEditingClipGroupName(e.target.value)}
                        onBlur={() => {
                          const next = editingClipGroupName.trim();
                          if (next && next !== group.name) {
                            const groups = (props.clipArtGroups || []).map((g: ClipArtInstanceGroup) =>
                              g.id === group.id ? { ...g, name: next } : g
                            );
                            handlePropChange("clipArtGroups", groups);
                          }
                          setEditingClipGroupId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setEditingClipGroupId(null);
                        }}
                        className="flex-1 h-7 px-2 rounded-md border border-blue-400 text-[12px] font-bold text-slate-800 focus:outline-none"
                      />
                    ) : (
                      <>
                        <p className="flex-1 text-[12px] font-bold text-slate-800 truncate">{group.name}</p>
                        <button
                          type="button"
                          title="Rename group for this artwork"
                          onClick={() => {
                            setEditingClipGroupId(group.id);
                            setEditingClipGroupName(group.name);
                          }}
                          className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </header>
                  <div className="p-2 flex flex-wrap gap-2">
                    {group.options.map((opt) => {
                      const active = opt.id === group.activeOptionId;
                      const empty = isEmptyOption(opt);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          title={empty ? "None" : opt.label || "Option"}
                          onClick={() => {
                            const groups = (props.clipArtGroups || []).map((g: ClipArtInstanceGroup) =>
                              g.id === group.id ? { ...g, activeOptionId: opt.id } : g
                            );
                            handlePropChange("clipArtGroups", resolveDrivenClipArtGroups(groups));
                          }}
                          className={`relative w-14 h-14 rounded-lg border bg-white overflow-hidden cursor-pointer flex items-center justify-center ${
                            active ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          {empty ? (
                            <span className="text-[9px] font-bold text-slate-400">None</span>
                          ) : opt.swatchImageUrl || opt.assetImageUrl ? (
                            <img
                              src={opt.swatchImageUrl || opt.assetImageUrl}
                              alt=""
                              className="w-full h-full object-contain"
                              draggable={false}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* DOODLE ALPHABET EDITOR */}
        {selectedLayer.layerType === "DOODLE_ALPHABET" && (
          <div className="space-y-4 pt-3 border-t border-slate-200">
            {/* Header & Re-roll Seed Button */}
            <div className="flex items-center justify-between bg-purple-50/60 p-2.5 rounded-xl border border-purple-100">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>Doodle Alphabet Controls</span>
              </div>

              <button
                type="button"
                onClick={() => handlePropChange("seed", (props.seed || 12345) + 1)}
                className="text-[10px] font-extrabold text-purple-700 bg-white border border-purple-200 px-2.5 py-1 rounded-lg hover:bg-purple-100 transition cursor-pointer flex items-center gap-1 shrink-0 shadow-2xs"
                title="Re-roll / Reshuffle style variant assignments for each letter"
              >
                <Sparkles className="w-3 h-3 text-purple-600" />
                <span>🔀 Re-roll Shuffle</span>
              </button>
            </div>

            {/* 1. Input Text String */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1 uppercase tracking-wider">
                Doodle Text Content
              </label>
              <input
                type="text"
                value={props.text ?? "AUNTIE"}
                onChange={(e) => handlePropChange("text", e.target.value)}
                placeholder="e.g. AUNTIE, MERRY, SANTA"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>

            {/* 2. Select Doodle Pack */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1 uppercase tracking-wider">
                Doodle Pack
              </label>
              <select
                value={props.doodlePackId || doodlePacks?.[0]?.id || ""}
                onChange={(e) => handlePropChange("doodlePackId", e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              >
                {doodlePacks && doodlePacks.length > 0 ? (
                  doodlePacks.map((pack: any) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name} ({pack.styles?.length || 0} styles)
                    </option>
                  ))
                ) : (
                  <option value="">No Doodle Packs created yet</option>
                )}
              </select>
            </div>

            {/* 3. Style Selection Rule */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1 uppercase tracking-wider">
                Smart Style Randomization Rule
              </label>
              <select
                value={props.styleSelectionRule || "RANDOM_SHUFFLE"}
                onChange={(e) => handlePropChange("styleSelectionRule", e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              >
                <option value="RANDOM_SHUFFLE">🔀 Random Shuffle (Mix styles per letter)</option>
                <option value="CYCLE_PATTERN">🔄 Cycle Pattern (Style 1 ➔ Style 2 ➔ Style 3...)</option>
                <option value="SEED_SHUFFLE">🎲 Seeded Shuffle (Deterministic per word)</option>
                <option value="FIXED_STYLE">🎯 Fixed Style (Use 1 style for all letters)</option>
              </select>
            </div>

            {/* 4. Fixed Style Selector if FIXED_STYLE rule is active */}
            {props.styleSelectionRule === "FIXED_STYLE" && (
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1 uppercase tracking-wider">
                  Select Fixed Style Variant
                </label>
                <select
                  value={props.fixedStyleId || ""}
                  onChange={(e) => handlePropChange("fixedStyleId", e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                >
                  {(() => {
                    const activePack = doodlePacks?.find((p: any) => p.id === (props.doodlePackId || doodlePacks?.[0]?.id));
                    const styles = activePack?.styles || [];
                    if (styles.length === 0) return <option value="">No styles found</option>;
                    return styles.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ));
                  })()}
                </select>
              </div>
            )}

            {/* 5. Letter Spacing & Max Height */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1 uppercase tracking-wider">
                  Letter Spacing ({props.letterSpacing ?? 4}px)
                </label>
                <input
                  type="range"
                  min="-10"
                  max="40"
                  value={props.letterSpacing ?? 4}
                  onChange={(e) => handlePropChange("letterSpacing", Number(e.target.value))}
                  className="w-full accent-purple-600"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1 uppercase tracking-wider">
                  Max Height ({props.maxLetterHeight ?? 120}px)
                </label>
                <input
                  type="range"
                  min="40"
                  max="300"
                  value={props.maxLetterHeight ?? 120}
                  onChange={(e) => handlePropChange("maxLetterHeight", Number(e.target.value))}
                  className="w-full accent-purple-600"
                />
              </div>
            </div>

            {/* 6. Auto Fit to Container Toggle Option */}
            <div className="pt-1">
              <div className="bg-purple-50/50 p-2.5 rounded-xl border border-purple-100/90 flex items-center justify-between">
                <div>
                  <p className="font-extrabold text-xs text-slate-800">Auto Shrink to Fit Container</p>
                  <p className="text-[10px] text-slate-500">Auto-downscale text when it overflows layer width</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={props.autoFitContainer !== false}
                    onChange={(e) => handlePropChange("autoFitContainer", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
            </div>

            {/* 7. Alignment */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1 uppercase tracking-wider">
                Letter Alignment
              </label>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => handlePropChange("align", "left")}
                  className={`flex-1 py-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                    props.align === "left" ? "bg-white text-purple-700 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                  <span>Left</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange("align", "center")}
                  className={`flex-1 py-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                    !props.align || props.align === "center" ? "bg-white text-purple-700 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                  <span>Center</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange("align", "right")}
                  className={`flex-1 py-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                    props.align === "right" ? "bg-white text-purple-700 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <AlignRight className="w-3.5 h-3.5" />
                  <span>Right</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* WORD SEARCH PUZZLE EDITOR */}
        {selectedLayer.layerType === "WORD_SEARCH_PUZZLE" && (
          <div className="space-y-4 pt-3 border-t border-slate-200">
            {/* 1. Header & Regenerate Seed */}
            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                <Grid className="w-4 h-4 text-blue-600" /> Word Search Puzzle ({((props.words && Array.isArray(props.words) ? props.words : ["SIMON", "LISA", "JANE", "HAPPY", "URI", "RONALDO", "MESSI"]) as string[]).length} words)
              </h4>
              <button
                type="button"
                onClick={() => handlePropChange("seed", (props.seed || 12345) + 1)}
                className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded hover:bg-indigo-100 transition cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Sparkles className="w-3 h-3" />
                <span>Regenerate</span>
              </button>
            </div>

            {/* 2. Hidden Words Manager */}
            <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <label className="text-[11px] font-bold text-slate-700 block uppercase tracking-wider">
                Hidden Words List
              </label>
              <div className="border border-slate-300 rounded-lg p-2.5 bg-white min-h-[85px] space-y-2">
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {((props.words && Array.isArray(props.words) ? props.words : ["SIMON", "LISA", "JANE", "HAPPY", "URI", "RONALDO", "MESSI"]) as string[]).map((w: string, idx: number) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs">
                      <span>{w}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const currentWords = props.words || ["SIMON", "LISA", "JANE", "HAPPY", "URI", "RONALDO", "MESSI"];
                          const nextWords = currentWords.filter((_: any, i: number) => i !== idx);
                          handlePropChange("words", nextWords);
                        }}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Type name and press Enter..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      const inputEl = e.currentTarget;
                      const val = inputEl.value.trim();
                      if (val) {
                        const currentWords = props.words || ["SIMON", "LISA", "JANE", "HAPPY", "URI", "RONALDO", "MESSI"];
                        const nextWords = Array.from(new Set([...currentWords, val.toUpperCase()]));
                        handlePropChange("words", nextWords);
                        inputEl.value = "";
                      }
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-slate-400 block">
                Type names (e.g. Ashley, Simon) and press Enter or comma.
              </span>
            </div>

            {/* 3. Grid Dimensions & Placement Rules */}
            <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <label className="text-[10px] font-bold text-slate-700 block uppercase tracking-wider">Grid & Placement Rules</label>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Columns (Cols)</label>
                  <select
                    value={props.gridWidth || 10}
                    onChange={(e) => handlePropChange("gridWidth", Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    {[8, 9, 10, 11, 12, 13, 14, 15, 16].map((n) => (
                      <option key={n} value={n}>{n} Cols</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Rows (Rows)</label>
                  <select
                    value={props.gridHeight || 10}
                    onChange={(e) => handlePropChange("gridHeight", Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    {[8, 9, 10, 11, 12, 13, 14, 15, 16].map((n) => (
                      <option key={n} value={n}>{n} Rows</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Word Intersections (Overlaps)</label>
                <select
                  value={props.overlapDensity || "BALANCED"}
                  onChange={(e) => handlePropChange("overlapDensity", e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                >
                  <option value="BALANCED">✨ Harmony (1-2 Light Intersections - Recommended)</option>
                  <option value="MINIMAL">🍃 Minimal (Spread Out / 0 Intersections)</option>
                  <option value="HIGH">🔗 Dense (Many Intersections)</option>
                </select>
              </div>

              <div className="pt-1 space-y-1.5">
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer">
                  <span>Allow Diagonal Words</span>
                  <input
                    type="checkbox"
                    checked={props.allowDiagonal !== false}
                    onChange={(e) => handlePropChange("allowDiagonal", e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer">
                  <span>Allow Backward Words (Reverse)</span>
                  <input
                    type="checkbox"
                    checked={props.allowReverse === true && props.explicitReverse === true}
                    onChange={(e) => handlePropChange({ allowReverse: e.target.checked, explicitReverse: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* 4. Typography & Text Style */}
            <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <label className="text-[10px] font-bold text-slate-700 block uppercase tracking-wider">Typography & Text Style</label>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Font Family</label>
                  <StudioFontPicker
                    selectedFont={props.fontFamily || props.gridFontFamily || selectedLayer.fontFamily || "Roboto"}
                    fonts={fonts}
                    onSelectFont={(family) => {
                      handlePropChange({ fontFamily: family, gridFontFamily: family });
                      onUpdateLayer(selectedLayer.id, { fontFamily: family });
                    }}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Font Size (pt)</label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={props.fontSize ?? props.gridFontSize ?? 22}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        handlePropChange({ fontSize: "", gridFontSize: "" });
                      } else {
                        const v = Number(val);
                        if (!isNaN(v)) {
                          handlePropChange({ fontSize: v, gridFontSize: v });
                        }
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-bold text-slate-800 text-center outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Word Case</label>
                  <select
                    value={props.textTransform || props.wordStyle || "UPPERCASE"}
                    onChange={(e) => {
                      handlePropChange({ textTransform: e.target.value, wordStyle: e.target.value });
                    }}
                    className="w-full bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="UPPERCASE">UPPERCASE (A B C)</option>
                    <option value="LOWERCASE">lowercase (a b c)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Font Weight</label>
                  <select
                    value={props.fontWeight || "bold"}
                    onChange={(e) => handlePropChange("fontWeight", e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="bold">Bold</option>
                    <option value="normal">Normal</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 5. Colors Palette & Oval Highlight Tuning */}
            <div className="space-y-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <label className="text-[10px] font-bold text-slate-700 block uppercase tracking-wider">Letter Text Colors</label>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-slate-600 block mb-1">Grid Filler Color</label>
                  <div className="flex items-center gap-1.5 bg-white border border-slate-300 p-1 rounded-md shadow-2xs">
                    <input
                      type="color"
                      value={props.gridTextColor || props.color || props.fill || "#1E293B"}
                      onChange={(e) => {
                        handlePropChange({ gridTextColor: e.target.value, color: e.target.value, fill: e.target.value });
                      }}
                      className="w-5 h-5 rounded cursor-pointer border-none bg-transparent p-0"
                      title="Color of random background filler letters"
                    />
                    <span className="font-mono text-[10px] font-bold text-slate-700 uppercase truncate">
                      {props.gridTextColor || props.color || props.fill || "#1E293B"}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-600 block mb-1">Target Word Color</label>
                  <div className="flex items-center gap-1.5 bg-white border border-slate-300 p-1 rounded-md shadow-2xs">
                    <input
                      type="color"
                      value={props.wordTextColor || props.gridTextColor || props.color || "#1E293B"}
                      onChange={(e) => {
                        handlePropChange({ wordTextColor: e.target.value, highlightTextColor: e.target.value });
                      }}
                      className="w-5 h-5 rounded cursor-pointer border-none bg-transparent p-0"
                      title="Color of target hidden word letters"
                    />
                    <span className="font-mono text-[10px] font-bold text-slate-700 uppercase truncate">
                      {props.wordTextColor || props.gridTextColor || props.color || "#1E293B"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Oval Capsule Highlights Settings */}
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800">Show Oval Highlights</span>
                  <input
                    type="checkbox"
                    checked={props.showHighlights !== false}
                    onChange={(e) => handlePropChange("showHighlights", e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                </div>

                {props.showHighlights !== false && (
                  <div className="space-y-2.5 pt-1">
                    {/* Border Controls */}
                    <div className="grid grid-cols-2 gap-2 bg-white p-2 rounded-md border border-slate-200">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-600 block mb-1">Oval Border Color</label>
                        <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 p-1 rounded-md">
                          <input
                            type="color"
                            value={props.highlightColor || "#FD005D"}
                            onChange={(e) => handlePropChange("highlightColor", e.target.value)}
                            className="w-4 h-4 rounded cursor-pointer border-none bg-transparent p-0"
                            title="Color of oval capsule highlight loops"
                          />
                          <span className="font-mono text-[9px] font-bold text-slate-700 uppercase truncate">
                            {props.highlightColor || "#FD005D"}
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                          Border Width ({props.highlightLineWidth || 4}px)
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="0.5"
                          value={props.highlightLineWidth || 4}
                          onChange={(e) => handlePropChange("highlightLineWidth", Number(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-1.5"
                        />
                      </div>
                    </div>

                    {/* Capsule Fill Controls */}
                    <div className="bg-white p-2 rounded-md border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Capsule Background Fill</span>
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={props.transparentHighlightFill === true}
                            onChange={(e) => handlePropChange("transparentHighlightFill", e.target.checked)}
                            className="w-3.5 h-3.5 text-indigo-600 rounded cursor-pointer"
                          />
                          <span>Transparent Fill</span>
                        </label>
                      </div>

                      {!props.transparentHighlightFill ? (
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Fill Color</label>
                            <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 p-1 rounded-md">
                              <input
                                type="color"
                                value={props.highlightFillColor || props.highlightColor || "#FD005D"}
                                onChange={(e) => handlePropChange("highlightFillColor", e.target.value)}
                                className="w-4 h-4 rounded cursor-pointer border-none bg-transparent p-0"
                              />
                              <span className="font-mono text-[9px] font-bold text-slate-700 uppercase truncate">
                                {props.highlightFillColor || props.highlightColor || "#FD005D"}
                              </span>
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                              Fill Opacity ({Math.round((props.highlightFillOpacity !== undefined ? Number(props.highlightFillOpacity) : 0.22) * 100)}%)
                            </label>
                            <input
                              type="range"
                              min="0.05"
                              max="1"
                              step="0.05"
                              value={props.highlightFillOpacity !== undefined ? Number(props.highlightFillOpacity) : 0.22}
                              onChange={(e) => handlePropChange("highlightFillOpacity", Number(e.target.value))}
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-1.5"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] italic text-slate-400 bg-slate-50 p-1.5 rounded text-center">
                          ✨ Capsule background is transparent (border line only)
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
          <div className="space-y-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Default Text
              </label>
              <input
                type="text"
                value={props.text !== undefined ? props.text : selectedLayer.name}
                onChange={(e) => handlePropChange("text", e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs font-semibold text-slate-800 bg-white"
                placeholder="e.g. Happy Family"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Instructional Help Text
              </label>
              <input
                type="text"
                value={props.helpText !== undefined ? props.helpText : ""}
                onChange={(e) => handlePropChange("helpText", e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs text-slate-800 bg-white"
                placeholder="e.g. Enter your custom name or message"
              />
            </div>

            <TextGradientEditor props={props} onChange={(patch) => handlePropChange(patch)} />

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer" title="Require customer to fill out this text field before ordering">
                <input
                  type="checkbox"
                  checked={props.isRequired === true}
                  onChange={(e) => handlePropChange("isRequired", e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Required</span>
              </label>

              <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer" title="Allow customer to personalize this text field on storefront order">
                <input
                  type="checkbox"
                  checked={props.allowPersonalized !== false}
                  onChange={(e) => handlePropChange("allowPersonalized", e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-emerald-950 font-semibold">Allow Personalized</span>
              </label>
            </div>

            {/* Min / Max Length & Special Characters Filter */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Min Chars</label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={props.minCharacters !== undefined ? props.minCharacters : 3}
                    onChange={(e) => handlePropChange("minCharacters", Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Max Chars</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={props.maxCharacters !== undefined ? props.maxCharacters : 50}
                    onChange={(e) => handlePropChange("maxCharacters", Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer" title="Prevent customer from typing special/invalid symbols for printing">
                  <input
                    type="checkbox"
                    checked={props.disallowSpecialChars === true}
                    onChange={(e) => handlePropChange("disallowSpecialChars", e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-amber-950 text-xs font-semibold">Disallow Special Characters</span>
                </label>
              </div>

              <div className="space-y-1.5 pt-0.5">
                <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer" title="Allow text to wrap onto multiple lines when typing (disables Auto-Fit)">
                  <input
                    type="checkbox"
                    checked={props.allowMultiline === true}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      if (isChecked) {
                        onUpdateLayer(selectedLayer.id, {
                          properties: {
                            ...(selectedLayer.properties || {}),
                            allowMultiline: true,
                            maxLines: props.maxLines || 2,
                            autoFit: false,
                          },
                        });
                      } else {
                        handlePropChange("allowMultiline", false);
                      }
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-indigo-950 text-xs font-semibold">Allow Multi-line Text (Auto Wrap)</span>
                </label>

                {props.allowMultiline && (
                  <div className="flex items-center gap-2 pt-1 pl-6">
                    <label className="text-[11px] font-semibold text-slate-700 shrink-0">Max Lines Limit:</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={props.maxLines !== undefined ? props.maxLines : 2}
                      onChange={(e) => handlePropChange("maxLines", Number(e.target.value))}
                      className="w-16 border border-slate-300 rounded px-2 py-0.5 bg-white text-xs font-mono font-bold text-indigo-950 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400">(Max line count limit)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Graphic Asset Selector & Opacity (If LayerType is ASSET or OVERLAY and NOT a List Container Layer) */}
        {((selectedLayer.layerType === "ASSET" || selectedLayer.layerType === "OVERLAY") && !selectedLayer.linkedFieldId) && (
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

        {/* List / Item Customization Properties Editor (Independent top-level block) */}
            {(() => {
              let linkedField = fields.find((f) => f.id === selectedLayer.linkedFieldId);

              const isOptionField =
                linkedField &&
                (linkedField.fieldType === "SELECT" ||
                  linkedField.fieldType === "RADIO" ||
                  linkedField.fieldType === "FIELD_ASSET");

              const isListTypeLayer = Boolean(
                isOptionField ||
                selectedLayer.name.toLowerCase().includes("list") ||
                selectedLayer.name.toLowerCase().includes("dropdown") ||
                selectedLayer.name.toLowerCase().includes("select")
              );

              if (!linkedField && isListTypeLayer) {
                linkedField = fields.find((f) => f.fieldType === "SELECT") || {
                  id: selectedLayer.linkedFieldId || `field_${selectedLayer.id}`,
                  label: selectedLayer.name || "List / Item",
                  fieldType: "SELECT",
                  displayType: "DROPDOWN",
                  sortOrder: 0,
                  isRequired: true,
                  allowPersonalized: true,
                  config: {
                    isConditionOnly: false,
                    options: [
                      { id: `item_${Date.now()}_1`, label: "Item 1", value: "item_1", swatchImageUrl: "", assetImageUrl: "" },
                      { id: `item_${Date.now()}_2`, label: "Item 2", value: "item_2", swatchImageUrl: "", assetImageUrl: "" },
                      { id: `item_${Date.now()}_3`, label: "Item 3", value: "item_3", swatchImageUrl: "", assetImageUrl: "" },
                    ],
                  },
                };
              }

              if (linkedField && (isOptionField || isListTypeLayer)) {
                const config = linkedField.config || {};
                const options: any[] = config.options || [];
                const isItemSelected = Boolean(linkedField.activeOptionId);
                const activeOptIdx = isItemSelected ? options.findIndex((o) => o.id === linkedField.activeOptionId) : -1;
                const activeOpt = activeOptIdx >= 0 ? options[activeOptIdx] : null;

                const handleFieldUpdate = (fieldId: string, updates: any) => {
                  if (onUpdateField) onUpdateField(fieldId, updates);
                  if (!selectedLayer.linkedFieldId) {
                    onUpdateLayer(selectedLayer.id, { linkedFieldId: fieldId });
                  }
                };

                return (
                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-indigo-900 flex items-center gap-1.5 uppercase tracking-wider">
                        <ListFilter className="w-4 h-4 text-indigo-600" />
                        {activeOpt ? "Item Properties" : "List Field Settings"}
                      </h4>
                      <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                        {linkedField.label}
                      </span>
                    </div>

                    {/* IF PARENT LIST LAYER IS SELECTED: SHOW LIST FIELD LEVEL PROPERTIES */}
                    {!activeOpt && (
                      <div className="space-y-3">
                        {/* Layer Name Input */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Layer Name</label>
                          <input
                            type="text"
                            value={selectedLayer.name}
                            onChange={(e) => onUpdateLayer(selectedLayer.id, { name: e.target.value })}
                            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-semibold text-slate-800"
                          />
                        </div>

                        {/* Customer Field Title / Label */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Customer Field Title / Label
                          </label>
                          <input
                            type="text"
                            value={linkedField.label}
                            onChange={(e) => handleFieldUpdate(linkedField.id, { label: e.target.value })}
                            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-xs font-semibold text-slate-800 bg-white"
                            placeholder="e.g. Select You Pet"
                          />
                        </div>

                        {/* List Type: Condition Only Checkbox */}
                        <div className="bg-indigo-50/70 border border-indigo-200/90 rounded-lg p-2.5 space-y-1">
                          <label className="flex items-center gap-2 font-bold text-indigo-950 cursor-pointer text-xs select-none">
                            <input
                              type="checkbox"
                              checked={config.isConditionOnly === true}
                              onChange={(e) => {
                                handleFieldUpdate(linkedField.id, {
                                  config: { ...config, isConditionOnly: e.target.checked },
                                });
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                            />
                            <span>Condition only</span>
                          </label>
                          <p className="text-[10px] text-indigo-700 leading-tight pl-6">
                            {config.isConditionOnly
                              ? "Only used for conditional rules. Items inside will NOT show graphic images on Studio canvas."
                              : "Items have graphic images visible on Studio canvas for design composition."}
                          </p>
                        </div>

                        {/* View Type Selector */}
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-bold text-slate-700">View Type (Storefront Layout)</label>
                          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-[10px]">
                            <button
                              type="button"
                              onClick={() => handleFieldUpdate(linkedField.id, { displayType: "DROPDOWN" })}
                              className={`py-1.5 px-1 rounded font-bold transition flex items-center justify-center gap-1 cursor-pointer text-center ${
                                !linkedField.displayType || linkedField.displayType === "DROPDOWN"
                                  ? "bg-white text-indigo-700 shadow-2xs border border-indigo-200"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                              title="Dropdown (item name)"
                            >
                              <span>Dropdown</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFieldUpdate(linkedField.id, { displayType: "RADIO" })}
                              className={`py-1.5 px-1 rounded font-bold transition flex items-center justify-center gap-1 cursor-pointer text-center ${
                                linkedField.displayType === "RADIO" || linkedField.displayType === "BUTTON"
                                  ? "bg-white text-indigo-700 shadow-2xs border border-indigo-200"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                              title="Button View (item name)"
                            >
                              <span>Button View</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFieldUpdate(linkedField.id, { displayType: "THUMBNAIL" })}
                              className={`py-1.5 px-1 rounded font-bold transition flex items-center justify-center gap-1 cursor-pointer text-center ${
                                linkedField.displayType === "THUMBNAIL" || linkedField.displayType === "IMAGE_SWATCH"
                                  ? "bg-white text-indigo-700 shadow-2xs border border-indigo-200"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                              title="Thumbnail Swatcher"
                            >
                              <span>Thumbnail Swatch</span>
                            </button>
                          </div>
                        </div>

                        {/* Required & Allow Personalized Checkboxes */}
                        <div className="flex items-center gap-4 pt-1">
                          <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={linkedField.isRequired !== false}
                              onChange={(e) => handleFieldUpdate(linkedField.id, { isRequired: e.target.checked })}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Required</span>
                          </label>

                          <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={linkedField.allowPersonalized !== false}
                              onChange={(e) => handleFieldUpdate(linkedField.id, { allowPersonalized: e.target.checked })}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-emerald-950 font-semibold">Allow Personalized</span>
                          </label>
                        </div>

                        {/* Items Summary & Add Item Button */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-600">
                            Configured Items ({options.length})
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenMediaPickerForBatchOptions && onOpenMediaPickerForBatchOptions(linkedField.id)
                              }
                              className="text-xs font-bold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer"
                              title="Select multiple images from Media Library to create items automatically"
                            >
                              <Images className="w-3.5 h-3.5 text-indigo-600" /> + Add Items by Images
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const item1 = options[0];
                                const firstPosX = item1?.posX !== undefined ? item1.posX : selectedLayer.posX;
                                const firstPosY = item1?.posY !== undefined ? item1.posY : selectedLayer.posY;

                                const newOpt = {
                                  id: `item_${Date.now()}`,
                                  label: `Item ${options.length + 1}`,
                                  value: `item_${options.length + 1}`,
                                  swatchImageUrl: "",
                                  assetImageUrl: "",
                                  posX: firstPosX,
                                  posY: firstPosY,
                                  width: 300,
                                  height: 300,
                                  rotation: item1?.rotation !== undefined ? item1.rotation : selectedLayer.rotation || 0,
                                  opacity: item1?.opacity !== undefined ? item1.opacity : selectedLayer.properties?.opacity ?? 1,
                                  isVisible: true,
                                };
                                onUpdateField(linkedField.id, {
                                  config: { ...config, options: [...options, newOpt] },
                                  activeOptionId: newOpt.id,
                                });
                              }}
                              className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <Plus className="w-3.5 h-3.5" /> Add Item
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* IF A SPECIFIC ITEM ROW IS SELECTED: SHOW ITEM LEVEL PROPERTIES */}
                    {activeOpt && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <label className="block text-[11px] font-bold text-indigo-900 uppercase tracking-wider truncate flex-1">
                            Editing Item {activeOptIdx + 1}: {activeOpt.label || `Item ${activeOptIdx + 1}`}
                          </label>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const updatedOpts = [...options];
                                const isVis = activeOpt.isVisible !== false;
                                updatedOpts[activeOptIdx] = { ...activeOpt, isVisible: !isVis };
                                handleFieldUpdate(linkedField.id, { config: { ...config, options: updatedOpts } });
                              }}
                              className={`text-[10px] font-bold flex items-center gap-0.5 cursor-pointer px-2 py-0.5 rounded border transition ${
                                activeOpt.isVisible !== false
                                  ? "text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100"
                                  : "text-slate-500 bg-slate-100 border-slate-300 hover:bg-slate-200"
                              }`}
                              title={activeOpt.isVisible !== false ? "Hide Item on Studio Canvas" : "Show Item on Studio Canvas"}
                            >
                              {activeOpt.isVisible !== false ? (
                                <Eye className="w-3 h-3 text-indigo-600" />
                              ) : (
                                <EyeOff className="w-3 h-3 text-slate-400" />
                              )}
                              {activeOpt.isVisible !== false ? "Visible" : "Hidden"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const newOpt = {
                                  ...activeOpt,
                                  id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                                  label: `${activeOpt.label || `Item ${activeOptIdx + 1}`} (Copy)`,
                                  value: `${activeOpt.value || `item_${activeOptIdx + 1}`}_copy_${Date.now().toString(36).substring(2, 6)}`,
                                  posX: (activeOpt.posX !== undefined ? activeOpt.posX : selectedLayer.posX) + 20,
                                  posY: (activeOpt.posY !== undefined ? activeOpt.posY : selectedLayer.posY) + 20,
                                  isVisible: true,
                                };
                                const updatedOpts = [...options];
                                updatedOpts.splice(activeOptIdx + 1, 0, newOpt);
                                onUpdateField(linkedField.id, {
                                  config: { ...config, options: updatedOpts },
                                  activeOptionId: newOpt.id,
                                });
                              }}
                              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 cursor-pointer bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200"
                              title="Duplicate this Item"
                            >
                              <Copy className="w-3 h-3" /> Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updatedOpts = options.filter((_: any, i: number) => i !== activeOptIdx);
                                const nextOpt = updatedOpts[0];
                                onUpdateField(linkedField.id, {
                                  config: { ...config, options: updatedOpts },
                                  activeOptionId: nextOpt?.id || null,
                                });
                              }}
                              className="text-[10px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-0.5 cursor-pointer bg-rose-50 px-2 py-0.5 rounded border border-rose-200"
                              title="Delete this Item"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        </div>

                        {/* Item Name Input */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Item Name
                          </label>
                          <input
                            type="text"
                            value={activeOpt.label}
                            onChange={(e) => {
                              const updatedOpts = [...options];
                              updatedOpts[activeOptIdx] = {
                                ...activeOpt,
                                label: e.target.value,
                                value: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                              };
                              onUpdateField(linkedField.id, {
                                config: { ...config, options: updatedOpts },
                              });
                            }}
                            placeholder="e.g. Golden Retriever"
                            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-xs font-semibold text-slate-800 bg-white"
                          />
                        </div>

                        {/* Swatch Image Picker */}
                        <div className="space-y-1">
                          <label className="block text-[11px] font-semibold text-slate-700">
                            Swatch Thumbnail Image
                          </label>
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-lg border border-slate-300 bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden">
                              {activeOpt.swatchImageUrl ? (
                                <img src={activeOpt.swatchImageUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                onOpenMediaPickerForOption && onOpenMediaPickerForOption(linkedField.id, activeOptIdx, "SWATCH")
                              }
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                            >
                              {activeOpt.swatchImageUrl ? "Change Swatch" : "+ Choose Swatch"}
                            </button>
                            {activeOpt.assetImageUrl && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const trimmedSquareUrl = await autoGenerateSquareThumbnail(activeOpt.assetImageUrl);
                                  const updatedOpts = [...options];
                                  updatedOpts[activeOptIdx] = { ...activeOpt, swatchImageUrl: trimmedSquareUrl };
                                  handleFieldUpdate(linkedField.id, { config: { ...config, options: updatedOpts } });
                                }}
                                className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                                title="Auto trim transparent padding & center in a 1:1 square"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Auto Swatch
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Canvas Image Picker & Visual Properties (Hidden if Condition Only is checked) */}
                        {!config.isConditionOnly ? (
                          <div className="space-y-3 pt-2 border-t border-slate-200">
                            <div className="space-y-1">
                              <label className="block text-[11px] font-semibold text-slate-700">
                                Canvas Graphic Image
                              </label>
                              {activeOpt.assetImageUrl ? (
                                <div className="space-y-1.5">
                                  <div className="w-full aspect-square max-h-32 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center p-2">
                                    <img src={activeOpt.assetImageUrl} alt="" className="w-full h-full object-contain" />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenMediaPickerForOption && onOpenMediaPickerForOption(linkedField.id, activeOptIdx, "ASSET")
                                    }
                                    className="w-full py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition cursor-pointer"
                                  >
                                    Change Canvas Image
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenMediaPickerForOption && onOpenMediaPickerForOption(linkedField.id, activeOptIdx, "ASSET")
                                  }
                                  className="w-full py-2.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 rounded-xl border-dashed flex items-center justify-center gap-1 transition cursor-pointer"
                                >
                                  <Plus className="w-4 h-4 text-indigo-600" /> Choose Canvas Graphic Image
                                </button>
                              )}
                            </div>

                            {/* Position & Size Controls for Item Graphic */}
                            <div className="space-y-2 pt-2 border-t border-slate-100">
                              <div className="flex items-center justify-between">
                                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                  <Maximize2 className="w-3.5 h-3.5 text-indigo-600" /> Position & Size
                                </h4>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[11px]">
                                <div>
                                  <label className="block text-[10px] font-medium text-slate-500 mb-0.5">X Position (px)</label>
                                  <input
                                    type="number"
                                    value={activeOpt.posX !== undefined ? activeOpt.posX : selectedLayer.posX}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      const updatedOpts = [...options];
                                      updatedOpts[activeOptIdx] = { ...activeOpt, posX: val };
                                      handleFieldUpdate(linkedField.id, { config: { ...config, options: updatedOpts } });
                                    }}
                                    className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs font-mono"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Y Position (px)</label>
                                  <input
                                    type="number"
                                    value={activeOpt.posY !== undefined ? activeOpt.posY : selectedLayer.posY}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      const updatedOpts = [...options];
                                      updatedOpts[activeOptIdx] = { ...activeOpt, posY: val };
                                      handleFieldUpdate(linkedField.id, { config: { ...config, options: updatedOpts } });
                                    }}
                                    className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs font-mono"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Width (px)</label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={activeOpt.width !== undefined ? activeOpt.width : selectedLayer.width}
                                    onChange={(e) => {
                                      const val = Math.max(1, Number(e.target.value));
                                      const updatedOpts = [...options];
                                      updatedOpts[activeOptIdx] = { ...activeOpt, width: val };
                                      handleFieldUpdate(linkedField.id, { config: { ...config, options: updatedOpts } });
                                    }}
                                    className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs font-mono"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Height (px)</label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={activeOpt.height !== undefined ? activeOpt.height : selectedLayer.height}
                                    onChange={(e) => {
                                      const val = Math.max(1, Number(e.target.value));
                                      const updatedOpts = [...options];
                                      updatedOpts[activeOptIdx] = { ...activeOpt, height: val };
                                      handleFieldUpdate(linkedField.id, { config: { ...config, options: updatedOpts } });
                                    }}
                                    className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs font-mono"
                                  />
                                </div>

                                <div className="col-span-2">
                                  <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Rotation (°)</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="range"
                                      min="-180"
                                      max="180"
                                      value={activeOpt.rotation !== undefined ? activeOpt.rotation : selectedLayer.rotation || 0}
                                      onChange={(e) => {
                                        const val = Number(e.target.value);
                                        const updatedOpts = [...options];
                                        updatedOpts[activeOptIdx] = { ...activeOpt, rotation: val };
                                        handleFieldUpdate(linkedField.id, { config: { ...config, options: updatedOpts } });
                                      }}
                                      className="flex-1 accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                                    />
                                    <input
                                      type="number"
                                      value={activeOpt.rotation !== undefined ? activeOpt.rotation : selectedLayer.rotation || 0}
                                      onChange={(e) => {
                                        const val = Number(e.target.value);
                                        const updatedOpts = [...options];
                                        updatedOpts[activeOptIdx] = { ...activeOpt, rotation: val };
                                        handleFieldUpdate(linkedField.id, { config: { ...config, options: updatedOpts } });
                                      }}
                                      className="w-14 text-center font-mono text-[11px] font-bold border border-slate-300 rounded px-1 py-0.5"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Opacity Control for Item Graphic */}
                            <div className="pt-2 border-t border-slate-100 space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-700">Opacity / Transparency</span>
                                <span className="font-mono font-bold text-indigo-600">
                                  {Math.round(((activeOpt.opacity !== undefined ? activeOpt.opacity : props.opacity !== undefined ? Number(props.opacity) : 1)) * 100)}%
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.01"
                                  value={activeOpt.opacity !== undefined ? activeOpt.opacity : props.opacity !== undefined ? Number(props.opacity) : 1}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    const updatedOpts = [...options];
                                    updatedOpts[activeOptIdx] = { ...activeOpt, opacity: val };
                                    handleFieldUpdate(linkedField.id, { config: { ...config, options: updatedOpts } });
                                  }}
                                  className="flex-1 accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={Math.round(((activeOpt.opacity !== undefined ? activeOpt.opacity : props.opacity !== undefined ? Number(props.opacity) : 1)) * 100)}
                                  onChange={(e) => {
                                    const val = Math.max(0, Math.min(100, Number(e.target.value))) / 100;
                                    const updatedOpts = [...options];
                                    updatedOpts[activeOptIdx] = { ...activeOpt, opacity: val };
                                    handleFieldUpdate(linkedField.id, { config: { ...config, options: updatedOpts } });
                                  }}
                                  className="w-12 text-center font-mono text-[11px] font-bold border border-slate-300 rounded px-1 py-0.5"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-indigo-50/60 border border-indigo-200 rounded-lg p-2.5 text-[11px] text-indigo-900">
                            <span className="font-bold block">Condition Only Enabled</span>
                            <span className="text-[10px] text-indigo-700 leading-tight block">
                              Canvas graphic image is disabled for items because this List layer is set to "Condition only".
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }

              return null;
            })()}

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

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer" title="Require customer to upload photo before ordering">
                  <input
                    type="checkbox"
                    checked={props.isRequired !== false}
                    onChange={(e) => handlePropChange("isRequired", e.target.checked)}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span>Required</span>
                </label>

                <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer" title="Allow customer to personalize this photo upload on storefront order">
                  <input
                    type="checkbox"
                    checked={props.allowPersonalized !== false}
                    onChange={(e) => handlePropChange("allowPersonalized", e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-emerald-950 font-semibold">Allow Personalized</span>
                </label>
              </div>
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
                <span>MASK CUTOUT LAYER</span>
              </label>
              <p className="text-[10px] text-purple-700 leading-tight">
                This layer defines the cutout mask for Photo Upload. Adjust position X, Y, W, H and select the cutout shape below.
              </p>

              {/* Cutout Shape Selector */}
              <div>
                <label className="block text-[10px] font-bold text-purple-800 mb-1">Mask Cutout Shape</label>
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

                  <button
                    type="button"
                    onClick={() => {
                      handlePropChange("maskShape", "CUSTOM");
                      if (!props.maskAssetUrl && onOpenMediaPickerForLayer) {
                        onOpenMediaPickerForLayer(selectedLayer.id);
                      }
                    }}
                    className={`py-1.5 px-1 text-center text-[11px] font-bold rounded-lg border transition cursor-pointer flex items-center justify-center gap-1 col-span-3 ${
                      props.maskShape === "CUSTOM"
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-white text-purple-900 border-purple-200 hover:bg-purple-100/50"
                    }`}
                  >
                    <span>🎨</span>
                    <span>Custom PNG / SVG Mask</span>
                  </button>
                </div>
              </div>

              {/* Radius Slider if ROUNDED */}
              {props.maskShape === "ROUNDED" && (
                <div className="bg-white p-2.5 rounded-lg border border-purple-200 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-purple-900">
                    <span>Corner Radius</span>
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
              <div className="bg-white p-2.5 rounded-lg border border-purple-200 space-y-2">
                <label className="block text-[10px] font-bold text-purple-900">Upload Custom PNG/SVG Mask File</label>
                {props.maskAssetUrl ? (
                  <div className="flex items-center gap-2 bg-purple-50/50 p-2 rounded-lg border border-purple-200">
                    <img src={props.maskAssetUrl} alt="Custom Mask" className="w-9 h-9 rounded border border-purple-300 object-contain bg-white shrink-0 p-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="block text-[10px] font-bold text-purple-900 truncate">Custom Mask Loaded</span>
                      <span className="block text-[9px] text-purple-600 font-mono truncate">{props.maskAssetUrl.split("/").pop()}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateLayer(selectedLayer.id, {
                          properties: {
                            ...(selectedLayer.properties || {}),
                            maskAssetUrl: "",
                            maskShape: "RECTANGLE",
                          },
                        });
                      }}
                      className="text-[10px] text-rose-600 hover:underline font-bold px-1.5 py-1 bg-white rounded border border-rose-200 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        accept="image/png,image/svg+xml,image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !selectedLayer) return;

                          setIsUploadingMask(true);
                          try {
                            const formData = new FormData();
                            formData.append("file", file);

                            const res = await fetch("/api/upload", {
                              method: "POST",
                              body: formData,
                            });

                            if (res.ok) {
                              const data = await res.json();
                              if (data.url) {
                                onUpdateLayer(selectedLayer.id, {
                                  properties: {
                                    ...(selectedLayer.properties || {}),
                                    maskShape: "CUSTOM",
                                    maskAssetUrl: data.url,
                                  },
                                });
                              }
                            }
                          } catch (err) {
                            console.error("Mask upload failed:", err);
                          } finally {
                            setIsUploadingMask(false);
                          }
                        }}
                        disabled={isUploadingMask}
                        className="hidden"
                      />
                      <span className="w-full py-2 text-xs font-semibold text-purple-700 bg-white border border-purple-300 border-dashed rounded-lg hover:bg-purple-100/50 flex items-center justify-center gap-1.5">
                        <Upload className="w-3.5 h-3.5" />
                        {isUploadingMask ? "Uploading..." : "Upload PNG/SVG File"}
                      </span>
                    </label>

                    {onOpenMediaPickerForLayer && (
                      <button
                        type="button"
                        onClick={() => onOpenMediaPickerForLayer(selectedLayer.id)}
                        className="py-2 px-2.5 text-xs font-semibold text-purple-700 bg-white border border-purple-300 rounded-lg hover:bg-purple-100/50 flex items-center justify-center shrink-0 cursor-pointer"
                        title="Choose from Media Library"
                      >
                        Library
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bounding Box Position & Dimensions (Hidden for List Container Layer) */}
        {!selectedLayer.linkedFieldId && (
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
        )}
      </div>
    </div>
  );
}
