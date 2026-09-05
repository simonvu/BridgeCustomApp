import React from "react";
import { CanvasLayerItem } from "./StudioCanvas";
import { StudioFieldItem } from "./StudioFieldPanel";
import {
  SlidersHorizontal,
  ImageIcon,
  Sparkles,
  Plus,
  Trash2,
  Palette,
  Eye,
  EyeOff,
  Upload,
  Scissors,
  Layers,
  Copy,
  Grid,
  X,
  Package,
  Pencil,
  RefreshCw,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { autoGenerateSquareThumbnail } from "../../utils/thumbnailGenerator";
import {
  isEmptyOption,
  isListItemField,
  isConditionOnlyField,
  normalizeDisplayType,
  listRequiresItemImages,
  optionHasListImage,
} from "../../utils/fieldHelpers";
import type { ClipArtInstanceGroup } from "../../utils/clipArtInstance";
import {
  clipArtGroupsForArtworkDisplay,
  reorderClipArtFormGroups,
  resolveDrivenClipArtGroups,
} from "../../utils/clipArtInstance";

export interface BackgroundOptionItem {
  id: string;
  label?: string;
  assetUrl?: string;
  aspectRatio?: number;
}

function PersonalizationControls({
  allowPersonalized,
  isRequired,
  helpText,
  onAllowPersonalizedChange,
  onRequiredChange,
  onHelpTextChange,
  helpPlaceholder = "Shown under the field on the storefront",
}: {
  allowPersonalized: boolean;
  isRequired: boolean;
  helpText: string;
  onAllowPersonalizedChange: (checked: boolean) => void;
  onRequiredChange: (checked: boolean) => void;
  onHelpTextChange: (value: string) => void;
  helpPlaceholder?: string;
}) {
  return (
    <div className="space-y-2.5">
      <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer text-xs" title="Show this field on the storefront so the customer can personalize it">
        <input
          type="checkbox"
          checked={allowPersonalized}
          onChange={(e) => onAllowPersonalizedChange(e.target.checked)}
          className="rounded text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-emerald-950 font-semibold">Allow Personalized</span>
      </label>
      {allowPersonalized && (
        <div className="space-y-2.5">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Instructional Help Text
            </label>
            <input
              type="text"
              value={helpText}
              onChange={(e) => onHelpTextChange(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-xs text-slate-800 bg-white"
              placeholder={helpPlaceholder}
            />
          </div>
          <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer text-xs" title="Require the customer to fill this field before ordering">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => onRequiredChange(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span>Required</span>
          </label>
        </div>
      )}
    </div>
  );
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
  const [collapsedClipGroups, setCollapsedClipGroups] = React.useState<Record<string, boolean>>({});
  const [draggedClipGroupId, setDraggedClipGroupId] = React.useState<string | null>(null);
  const [clipFormDraftIds, setClipFormDraftIds] = React.useState<string[] | null>(null);
  const draggedClipGroupIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    setCollapsedClipGroups({});
    setDraggedClipGroupId(null);
    setClipFormDraftIds(null);
    draggedClipGroupIdRef.current = null;
    setEditingClipGroupId(null);
  }, [selectedLayer?.id]);

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
        <p className="text-[11px] text-slate-400">Click a layer on the canvas or layer list to edit properties</p>
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

  const linkedFieldForLayer = fields.find((f) => f.id === selectedLayer.linkedFieldId);
  const isListTypeLayer = isListItemField(linkedFieldForLayer);

  const applyLayerPersonalization = (patch: {
    allowPersonalized?: boolean;
    isRequired?: boolean;
    helpText?: string;
  }) => {
    handlePropChange(patch);
    if (linkedFieldForLayer && onUpdateField) {
      const next: Partial<StudioFieldItem> = {};
      if (patch.allowPersonalized !== undefined) next.allowPersonalized = patch.allowPersonalized;
      if (patch.isRequired !== undefined) next.isRequired = patch.isRequired;
      if (patch.helpText !== undefined) {
        next.config = { ...(linkedFieldForLayer.config || {}), helpText: patch.helpText };
      }
      onUpdateField(linkedFieldForLayer.id, next);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white w-full select-none overflow-y-auto">
      {/* Header */}
      <div className="h-9 px-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
        <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
          <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
          Properties
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
            <p className="text-[10px] text-slate-400 mt-1">
              Canvas transform (X, Y, size, rotation) is on the top toolbar.
            </p>
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

            <p className="text-[10px] text-slate-500 leading-snug">
              Collapse groups and drag the handle to reorder the customer form. Canvas draw order stays the same.
            </p>

            {(() => {
              const visibleGroups = clipArtGroupsForArtworkDisplay(
                props.clipArtGroups || [],
                props.clipArtRules || []
              );
              const byId = new Map(visibleGroups.map((g) => [g.id, g]));
              const formGroups = (clipFormDraftIds || visibleGroups.map((g) => g.id))
                .map((id) => byId.get(id))
                .filter((g): g is ClipArtInstanceGroup => Boolean(g));

              const persistFormOrder = (orderedIds: string[]) => {
                handlePropChange(
                  "clipArtGroups",
                  reorderClipArtFormGroups(props.clipArtGroups || [], orderedIds)
                );
              };

              return (
            <div
              className="space-y-2"
              onDragOver={(e) => {
                if (!draggedClipGroupIdRef.current) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
            >
            {formGroups.map((group) => {
              const isEditing = editingClipGroupId === group.id;
              const isCollapsed = Boolean(collapsedClipGroups[group.id]);
              const isDragging = draggedClipGroupId === group.id;
              return (
                <section
                  key={group.id}
                  onDragOver={(e) => {
                    if (!draggedClipGroupIdRef.current) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    const fromId = draggedClipGroupIdRef.current;
                    if (!fromId || fromId === group.id) return;
                    setClipFormDraftIds((prev) => {
                      const ids = prev || formGroups.map((g) => g.id);
                      const from = ids.indexOf(fromId);
                      const to = ids.indexOf(group.id);
                      if (from < 0 || to < 0 || from === to) return prev;
                      const next = [...ids];
                      next.splice(from, 1);
                      next.splice(to, 0, fromId);
                      return next;
                    });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const ordered = clipFormDraftIds || formGroups.map((g) => g.id);
                    persistFormOrder(ordered);
                    draggedClipGroupIdRef.current = null;
                    setDraggedClipGroupId(null);
                    setClipFormDraftIds(null);
                  }}
                  onDragEnd={() => {
                    const fromId = draggedClipGroupIdRef.current;
                    if (fromId && clipFormDraftIds) persistFormOrder(clipFormDraftIds);
                    draggedClipGroupIdRef.current = null;
                    setDraggedClipGroupId(null);
                    setClipFormDraftIds(null);
                  }}
                  className={`rounded-xl border overflow-hidden ${
                    isDragging
                      ? "opacity-50 border-dashed border-blue-400"
                      : "border-slate-200 bg-slate-50/60"
                  }`}
                >
                  <header className="flex items-center gap-0.5 px-1 py-1 bg-white border-b border-slate-100">
                    <span
                      draggable
                      onMouseDown={(e) => e.stopPropagation()}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", group.id);
                        draggedClipGroupIdRef.current = group.id;
                        setDraggedClipGroupId(group.id);
                        setClipFormDraftIds(formGroups.map((g) => g.id));
                      }}
                      title="Drag to reorder this group on the form"
                      className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-grab active:cursor-grabbing p-1.5 rounded-md shrink-0"
                    >
                      <GripVertical className="w-4 h-4 pointer-events-none" />
                    </span>
                    <button
                      type="button"
                      title={isCollapsed ? "Expand group" : "Collapse group"}
                      onClick={() =>
                        setCollapsedClipGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))
                      }
                      className="p-0.5 text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
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
                        <button
                          type="button"
                          title={isCollapsed ? "Expand group" : "Collapse group"}
                          onClick={() =>
                            setCollapsedClipGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))
                          }
                          className="flex-1 text-left text-[12px] font-bold text-slate-800 truncate cursor-pointer"
                        >
                          {group.name}
                        </button>
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
                  {!isCollapsed && (
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
                  )}
                </section>
              );
            })}
            </div>
              );
            })()}
            <PersonalizationControls
              allowPersonalized={props.allowPersonalized !== false}
              isRequired={props.isRequired !== false}
              helpText={props.helpText !== undefined ? props.helpText : ""}
              onAllowPersonalizedChange={(checked) => handlePropChange("allowPersonalized", checked)}
              onRequiredChange={(checked) => handlePropChange("isRequired", checked)}
              onHelpTextChange={(value) => handlePropChange("helpText", value)}
              helpPlaceholder="e.g. Pick a style for this clip art"
            />
          </div>
        )}

        {/* DOODLE ALPHABET EDITOR */}
        {selectedLayer.layerType === "DOODLE_ALPHABET" && (
          <div className="space-y-4 pt-3 border-t border-slate-200">
            {/* Header & Re-roll Seed Button */}
            <div className="flex items-center justify-between bg-purple-50/60 p-2.5 rounded-xl border border-purple-100">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>Personalization</span>
              </div>
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

            <PersonalizationControls
              allowPersonalized={props.allowPersonalized !== false}
              isRequired={props.isRequired !== false}
              helpText={props.helpText !== undefined ? props.helpText : ""}
              onAllowPersonalizedChange={(checked) => handlePropChange("allowPersonalized", checked)}
              onRequiredChange={(checked) => handlePropChange("isRequired", checked)}
              onHelpTextChange={(value) => handlePropChange("helpText", value)}
              helpPlaceholder="e.g. Type text to render custom doodle font art"
            />
          </div>
        )}

        {/* WORD SEARCH PUZZLE EDITOR */}
        {selectedLayer.layerType === "WORD_SEARCH_PUZZLE" && (
          <div className="space-y-4 pt-3 border-t border-slate-200">
            {/* 1. Header & Regenerate Seed */}
            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                <Grid className="w-4 h-4 text-blue-600" /> Hidden Words ({((props.words && Array.isArray(props.words) ? props.words : ["SIMON", "LISA", "JANE", "HAPPY", "URI", "RONALDO", "MESSI"]) as string[]).length})
              </h4>
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

            {/* Placement constraints */}
            <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <label className="text-[10px] font-bold text-slate-700 block uppercase tracking-wider">Placement Constraints</label>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Word Intersections (Overlaps)</label>
                <select
                  value={props.overlapDensity || "BALANCED"}
                  onChange={(e) => handlePropChange("overlapDensity", e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                >
                  <option value="BALANCED">Harmony (1-2 light intersections)</option>
                  <option value="MINIMAL">Minimal (spread out / 0 intersections)</option>
                  <option value="HIGH">Dense (many intersections)</option>
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

            <PersonalizationControls
              allowPersonalized={props.allowPersonalized !== false}
              isRequired={props.isRequired !== false}
              helpText={props.helpText !== undefined ? props.helpText : ""}
              onAllowPersonalizedChange={(checked) => handlePropChange("allowPersonalized", checked)}
              onRequiredChange={(checked) => handlePropChange("isRequired", checked)}
              onHelpTextChange={(value) => handlePropChange("helpText", value)}
              helpPlaceholder="e.g. Enter names to hide in the puzzle"
            />
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

            <PersonalizationControls
              allowPersonalized={
                linkedFieldForLayer ? linkedFieldForLayer.allowPersonalized !== false : props.allowPersonalized !== false
              }
              isRequired={linkedFieldForLayer ? linkedFieldForLayer.isRequired !== false : props.isRequired !== false}
              helpText={
                linkedFieldForLayer?.config?.helpText !== undefined
                  ? String(linkedFieldForLayer.config.helpText || "")
                  : props.helpText !== undefined
                    ? props.helpText
                    : ""
              }
              onAllowPersonalizedChange={(checked) => applyLayerPersonalization({ allowPersonalized: checked })}
              onRequiredChange={(checked) => applyLayerPersonalization({ isRequired: checked })}
              onHelpTextChange={(value) => applyLayerPersonalization({ helpText: value })}
              helpPlaceholder="e.g. Enter your custom name or message"
            />

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
          </div>
        )}

        {/* List / Item Customization Properties Editor (Independent top-level block) */}
            {(() => {
              const linkedField = fields.find((f) => f.id === selectedLayer.linkedFieldId);

              if (linkedField && isListItemField(linkedField)) {
                const config = linkedField.config || {};
                const options: any[] = config.options || [];
                const conditionOnly = isConditionOnlyField(linkedField);
                const viewType = normalizeDisplayType(linkedField.displayType);
                const requiresItemImages = listRequiresItemImages(linkedField);
                const missingImageCount = requiresItemImages
                  ? options.filter((o) => !optionHasListImage(o)).length
                  : 0;
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

                        <PersonalizationControls
                          allowPersonalized={linkedField.allowPersonalized !== false}
                          isRequired={linkedField.isRequired !== false}
                          helpText={linkedField.config?.helpText ? String(linkedField.config.helpText) : ""}
                          onAllowPersonalizedChange={(checked) =>
                            handleFieldUpdate(linkedField.id, { allowPersonalized: checked })
                          }
                          onRequiredChange={(checked) =>
                            handleFieldUpdate(linkedField.id, { isRequired: checked })
                          }
                          onHelpTextChange={(value) =>
                            handleFieldUpdate(linkedField.id, { config: { ...config, helpText: value } })
                          }
                          helpPlaceholder="e.g. Choose the pet that appears on the design"
                        />

                        {/* List Type: Condition Only Checkbox */}
                        <div className="bg-indigo-50/70 border border-indigo-200/90 rounded-lg p-2.5 space-y-1">
                          <label className="flex items-center gap-2 font-bold text-indigo-950 cursor-pointer text-xs select-none">
                            <input
                              type="checkbox"
                              checked={conditionOnly}
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
                            {conditionOnly
                              ? "Form input only. Items are not drawn on canvas — use them in Conditions to show or hide other fields."
                              : "Each item can have its own canvas graphic, size, and position (edit transform on the top toolbar)."}
                          </p>
                        </div>

                        {/* View Type Selector */}
                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold text-slate-700">View Type (Storefront Layout)</label>
                          <select
                            value={viewType}
                            onChange={(e) =>
                              handleFieldUpdate(linkedField.id, {
                                displayType: e.target.value as "DROPDOWN" | "RADIO" | "THUMBNAIL",
                              })
                            }
                            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                          >
                            <option value="DROPDOWN">Dropdown</option>
                            <option value="RADIO">Button View</option>
                            <option value="THUMBNAIL">Thumbnail Swatch</option>
                          </select>
                          {requiresItemImages && (
                            <p className={`text-[10px] leading-tight ${missingImageCount > 0 ? "text-rose-600 font-semibold" : "text-indigo-700"}`}>
                              {missingImageCount > 0
                                ? `${missingImageCount} item${missingImageCount === 1 ? "" : "s"} still need an image for Thumbnail Swatch.`
                                : "Each item needs an image for Thumbnail Swatch."}
                            </p>
                          )}
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
                            {!conditionOnly && (
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
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const geom = conditionOnly
                                  ? {}
                                  : {
                                      posX: (activeOpt.posX !== undefined ? activeOpt.posX : selectedLayer.posX) + 20,
                                      posY: (activeOpt.posY !== undefined ? activeOpt.posY : selectedLayer.posY) + 20,
                                      hasCustomPosition: true,
                                    };
                                const newOpt = {
                                  ...activeOpt,
                                  id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                                  label: `${activeOpt.label || `Item ${activeOptIdx + 1}`} (Copy)`,
                                  value: `${activeOpt.value || `item_${activeOptIdx + 1}`}_copy_${Date.now().toString(36).substring(2, 6)}`,
                                  isVisible: true,
                                  ...geom,
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

                        {requiresItemImages ? (
                          <div className="space-y-1">
                            <label className="block text-[11px] font-semibold text-slate-700">
                              Image <span className="text-rose-600">*</span>
                            </label>
                            <p className="text-[10px] text-slate-500 -mt-0.5">
                              Required for Thumbnail Swatch on the customize form.
                            </p>
                            {optionHasListImage(activeOpt) ? (
                              <div className="space-y-1.5">
                                <div className="w-full aspect-square max-h-32 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center p-2">
                                  <img
                                    src={activeOpt.swatchImageUrl || activeOpt.assetImageUrl}
                                    alt=""
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenMediaPickerForOption &&
                                    onOpenMediaPickerForOption(linkedField.id, activeOptIdx, "SWATCH")
                                  }
                                  className="w-full py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition cursor-pointer"
                                >
                                  Change Image
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenMediaPickerForOption &&
                                  onOpenMediaPickerForOption(linkedField.id, activeOptIdx, "SWATCH")
                                }
                                className="w-full py-2.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl border-dashed flex items-center justify-center gap-1 transition cursor-pointer"
                              >
                                <Plus className="w-4 h-4 text-rose-600" /> Choose Image
                              </button>
                            )}
                          </div>
                        ) : (
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
                                  onOpenMediaPickerForOption &&
                                  onOpenMediaPickerForOption(linkedField.id, activeOptIdx, "SWATCH")
                                }
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                              >
                                {activeOpt.swatchImageUrl ? "Change Swatch" : "+ Choose Swatch"}
                              </button>
                              {activeOpt.assetImageUrl && !conditionOnly && (
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
                        )}

                        {/* Canvas Image Picker & Visual Properties (Hidden if Condition Only is checked) */}
                        {!conditionOnly ? (
                          <div className="space-y-3 pt-2 border-t border-slate-200">
                            <div className="space-y-1">
                              <label className="block text-[11px] font-semibold text-slate-700">
                                Canvas Graphic Image
                              </label>
                              <p className="text-[10px] text-slate-400 -mt-0.5 mb-1">
                                Size and position for this item are on the top toolbar.
                              </p>
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

                          </div>
                        ) : !requiresItemImages ? (
                          <div className="bg-indigo-50/60 border border-indigo-200 rounded-lg p-2.5 text-[11px] text-indigo-900">
                            <span className="font-bold block">Condition only</span>
                            <span className="text-[10px] text-indigo-700 leading-tight block">
                              This item is form data only. Use its value in Conditions — nothing is drawn on canvas.
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              }

              return null;
            })()}

        {linkedFieldForLayer &&
          !isListTypeLayer &&
          selectedLayer.layerType !== "TEXT" &&
          selectedLayer.layerType !== "PHOTO_UPLOAD" && (
            <div className="pt-3 border-t border-slate-200">
              <PersonalizationControls
                allowPersonalized={linkedFieldForLayer.allowPersonalized !== false}
                isRequired={linkedFieldForLayer.isRequired !== false}
                helpText={linkedFieldForLayer.config?.helpText ? String(linkedFieldForLayer.config.helpText) : ""}
                onAllowPersonalizedChange={(checked) =>
                  onUpdateField?.(linkedFieldForLayer.id, { allowPersonalized: checked })
                }
                onRequiredChange={(checked) =>
                  onUpdateField?.(linkedFieldForLayer.id, { isRequired: checked })
                }
                onHelpTextChange={(value) =>
                  onUpdateField?.(linkedFieldForLayer.id, {
                    config: { ...(linkedFieldForLayer.config || {}), helpText: value },
                  })
                }
              />
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

              <PersonalizationControls
                allowPersonalized={
                  linkedFieldForLayer ? linkedFieldForLayer.allowPersonalized !== false : props.allowPersonalized !== false
                }
                isRequired={
                  linkedFieldForLayer ? linkedFieldForLayer.isRequired !== false : props.isRequired !== false
                }
                helpText={
                  linkedFieldForLayer?.config?.helpText !== undefined
                    ? String(linkedFieldForLayer.config.helpText || "")
                    : props.helpText !== undefined
                      ? props.helpText
                      : "High resolution JPG or PNG recommended"
                }
                onAllowPersonalizedChange={(checked) => applyLayerPersonalization({ allowPersonalized: checked })}
                onRequiredChange={(checked) => applyLayerPersonalization({ isRequired: checked })}
                onHelpTextChange={(value) => applyLayerPersonalization({ helpText: value })}
                helpPlaceholder="e.g. High resolution JPG or PNG recommended"
              />
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
                This layer defines the cutout for Photo Upload. Set position and size on the top toolbar, then choose the shape below.
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

      </div>
    </div>
  );
}
