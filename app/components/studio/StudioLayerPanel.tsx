import React, { useState } from "react";
import { CanvasLayerItem } from "./StudioCanvas";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Plus,
  GripVertical,
  Type,
  ImageIcon,
  Upload,
  Layers,
  Sparkles,
  Copy,
  ChevronDown,
  ChevronRight,
  Scissors,
  ListFilter,
  Images,
  RotateCcw,
  Grid,
} from "lucide-react";

import { StudioFieldItem } from "./StudioFieldPanel";

interface StudioLayerPanelProps {
  layers: CanvasLayerItem[];
  selectedLayerId: string | null;
  selectedLayerIds?: string[];
  fields?: StudioFieldItem[];
  onSelectLayer: (layerId: string | null, isMultiKey?: boolean) => void;
  onUpdateLayer: (layerId: string, updatedProps: Partial<CanvasLayerItem>) => void;
  onUpdateField?: (fieldId: string, updatedProps: Partial<StudioFieldItem>) => void;
  onAddLayer: (layerType: "BACKGROUND" | "ASSET" | "TEXT" | "PHOTO_UPLOAD" | "OVERLAY" | "DROPDOWN" | "WORD_SEARCH_PUZZLE") => void;
  onAddMaskLayer?: (photoLayerId: string) => void;
  onOpenMediaPickerForOption?: (fieldId: string, optionIndex: number, targetType: "SWATCH" | "ASSET") => void;
  onOpenMediaPickerForBatchOptions?: (fieldId: string) => void;
  onPreviewOptionChoice?: (fieldId: string, option: any) => void;
  onDuplicateLayer?: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onReorderLayers: (reorderedLayers: CanvasLayerItem[]) => void;
}

export default function StudioLayerPanel({
  layers,
  selectedLayerId,
  selectedLayerIds = [],
  fields = [],
  onSelectLayer,
  onUpdateLayer,
  onUpdateField,
  onAddLayer,
  onAddMaskLayer,
  onOpenMediaPickerForOption,
  onOpenMediaPickerForBatchOptions,
  onPreviewOptionChoice,
  onDuplicateLayer,
  onDeleteLayer,
  onReorderLayers,
}: StudioLayerPanelProps) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [collapsedLayerIds, setCollapsedLayerIds] = useState<Record<string, boolean>>({});

  const isLayerCollapsed = (layerId: string) => {
    return collapsedLayerIds[layerId] !== false;
  };

  const toggleCollapseLayer = (layerId: string) => {
    setCollapsedLayerIds((prev) => ({
      ...prev,
      [layerId]: prev[layerId] === false ? true : false,
    }));
  };

  // Item Drag & Drop Reordering State
  const [draggedItemIdx, setDraggedItemIdx] = useState<number | null>(null);
  const [draggedItemFieldId, setDraggedItemFieldId] = useState<string | null>(null);

  const handleItemDragStart = (e: React.DragEvent, fieldId: string, itemIdx: number) => {
    e.stopPropagation();
    setDraggedItemIdx(itemIdx);
    setDraggedItemFieldId(fieldId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleItemDragOver = (e: React.DragEvent, fieldId: string, targetIdx: number, linkedField: any) => {
    e.stopPropagation();
    if (draggedItemIdx === null || draggedItemFieldId !== fieldId || draggedItemIdx === targetIdx) return;
    e.preventDefault();

    const options = [...(linkedField.config?.options || [])];
    const [draggedOpt] = options.splice(draggedItemIdx, 1);
    options.splice(targetIdx, 0, draggedOpt);

    if (onUpdateField) {
      onUpdateField(fieldId, {
        config: { ...linkedField.config, options },
      });
    }
    setDraggedItemIdx(targetIdx);
  };

  const handleItemDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedItemIdx(null);
    setDraggedItemFieldId(null);
  };

  // Double Click Inline Layer Rename State
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");

  const handleStartRename = (id: string, currentName: string) => {
    setEditingLayerId(id);
    setEditingName(currentName);
  };

  const handleSaveRename = (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      onUpdateLayer(id, { name: trimmed });
    }
    setEditingLayerId(null);
  };

  // Double Click Inline Item Rename State
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemLabel, setEditingItemLabel] = useState<string>("");

  const handleStartRenameItem = (id: string, currentLabel: string) => {
    setEditingItemId(id);
    setEditingItemLabel(currentLabel);
  };

  const handleSaveRenameItem = (field: StudioFieldItem, optIdx: number) => {
    if (!editingItemId) return;
    const config = field.config || {};
    const options = [...(config.options || [])];
    if (options[optIdx]) {
      const trimmed = editingItemLabel.trim();
      options[optIdx] = {
        ...options[optIdx],
        label: trimmed || options[optIdx].label || `Item ${optIdx + 1}`,
      };
      if (onUpdateField) {
        onUpdateField(field.id, {
          config: { ...config, options },
        });
      }
    }
    setEditingItemId(null);
  };

  const getLayerIcon = (type: string) => {
    switch (type) {
      case "TEXT":
        return <Type className="w-4 h-4 text-indigo-600 shrink-0" />;
      case "WORD_SEARCH_PUZZLE":
        return <Grid className="w-4 h-4 text-blue-600 shrink-0" />;
      case "ASSET":
        return <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />;
      case "PHOTO_UPLOAD":
        return <Upload className="w-4 h-4 text-blue-600 shrink-0" />;
      case "MASK":
        return <Scissors className="w-4 h-4 text-purple-600 shrink-0" />;
      case "OVERLAY":
        return <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />;
      default:
        return <Layers className="w-4 h-4 text-slate-500 shrink-0" />;
    }
  };

  // Map linked mask layers to their parent PHOTO_UPLOAD layers
  const linkedMaskMap = new Map<string, CanvasLayerItem>();
  const dependentMaskIds = new Set<string>();

  layers.forEach((l) => {
    if (l.layerType === "MASK") {
      const parentPhoto = layers.find(
        (p) => p.layerType === "PHOTO_UPLOAD" && (p.maskLayerId === l.id || l.parentPhotoUploadId === p.id)
      );
      if (parentPhoto) {
        linkedMaskMap.set(parentPhoto.id, l);
        dependentMaskIds.add(l.id);
      }
    }
  });

  // Filter root layers to display in the main stack (excluding dependent mask layers)
  const rootDisplayLayers = [...layers]
    .filter((l) => !dependentMaskIds.has(l.id))
    .sort((a, b) => b.zIndex - a.zIndex);

  // Drag & Drop Handlers for Layer Reordering
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    if (draggedIdx === null || draggedIdx === targetIndex) return;
    e.preventDefault();

    const updated = [...rootDisplayLayers];
    const [draggedItem] = updated.splice(draggedIdx, 1);
    updated.splice(targetIndex, 0, draggedItem);

    // Reassign zIndex values (top of array = highest zIndex)
    let currentZ = updated.length * 2;
    const finalLayers: CanvasLayerItem[] = [];

    updated.forEach((layer) => {
      const parentZ = currentZ;
      currentZ--;

      const linkedMask = linkedMaskMap.get(layer.id);
      if (linkedMask) {
        finalLayers.push({ ...linkedMask, zIndex: parentZ + 1 });
      }
      finalLayers.push({ ...layer, zIndex: parentZ });
    });

    onReorderLayers(finalLayers);
    setDraggedIdx(targetIndex);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  return (
    <div className="flex flex-col h-full bg-white w-full select-none overflow-visible">
      {/* Header Actions */}
      <div className="h-9 px-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between relative overflow-visible z-20 shrink-0">
        <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
          <Layers className="w-3.5 h-3.5 text-blue-600" />
          Layer Stack ({rootDisplayLayers.length})
        </h3>

        {/* Add Layer Context Dropdown Menu Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAddMenu((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-blue-600 bg-white hover:bg-slate-100 border border-slate-200 hover:border-blue-300 px-2 py-1 rounded-md transition shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            <span>Add Layer</span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          {showAddMenu && (
            <>
              {/* Invisible Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowAddMenu(false)}
              />

              {/* Context Dropdown Menu */}
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1 font-bold text-[10px] uppercase tracking-wider text-slate-400">
                  Select Layer Type
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onAddLayer("TEXT");
                    setShowAddMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-indigo-50 flex items-center gap-2.5 text-slate-800 transition cursor-pointer"
                >
                  <Type className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <p className="font-bold text-xs text-slate-900">Text Layer</p>
                    <p className="text-[10px] text-slate-500">Custom text & typography</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onAddLayer("WORD_SEARCH_PUZZLE");
                    setShowAddMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-2.5 text-slate-800 transition cursor-pointer"
                >
                  <Grid className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <p className="font-bold text-xs text-slate-900">Word Search Puzzle</p>
                    <p className="text-[10px] text-slate-500">Name grid with oval highlights</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onAddLayer("ASSET");
                    setShowAddMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-emerald-50 flex items-center gap-2.5 text-slate-800 transition cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-bold text-xs text-slate-900">Graphic Image</p>
                    <p className="text-[10px] text-slate-500">Clipart & background graphics</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onAddLayer("PHOTO_UPLOAD");
                    setShowAddMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-start gap-2.5 transition group cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-800 group-hover:text-purple-600">Photo Upload</div>
                    <div className="text-[10px] text-slate-400">Customer photo upload box</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onAddLayer("DROPDOWN");
                    setShowAddMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-start gap-2.5 transition group cursor-pointer border-t border-slate-100 mt-1 pt-2"
                >
                  <ListFilter className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-800 group-hover:text-blue-600">List / Item</div>
                    <div className="text-[10px] text-slate-400">List options & items choice</div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Layer List Items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {rootDisplayLayers.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <Layers className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">No layers created yet</p>
            <p className="text-[11px] text-slate-400">Click "+ Text" or "+ Image" to start</p>
          </div>
        ) : (
          rootDisplayLayers.map((layer, index) => {
            const isSelected = selectedLayerIds.includes(layer.id) || layer.id === selectedLayerId;
            const isDragging = draggedIdx === index;
            const linkedMask = linkedMaskMap.get(layer.id);
            const isMaskSelected = linkedMask && (selectedLayerIds.includes(linkedMask.id) || linkedMask.id === selectedLayerId);

            return (
              <React.Fragment key={layer.id}>
                {/* Parent Layer Item Card */}
                <div
                  draggable={!layer.isLocked}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => {
                    onSelectLayer(layer.id, e.ctrlKey || e.metaKey);
                    const linkedField = fields.find((f) => f.id === layer.linkedFieldId);
                    if (linkedField && onUpdateField) {
                      onUpdateField(linkedField.id, { activeOptionId: null });
                    }
                  }}
                  className={`group flex items-center justify-between p-1.5 rounded-lg border transition cursor-pointer ${
                    isDragging
                      ? "opacity-50 border-dashed border-blue-500 bg-blue-100 shadow-inner"
                      : isSelected
                      ? "bg-blue-50/90 border-blue-400 text-blue-950 font-medium shadow-xs"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {/* Drag Handle */}
                    <div
                      className="text-slate-300 group-hover:text-slate-500 cursor-grab active:cursor-grabbing p-0.5 shrink-0 transition"
                      title="Drag to reorder layer"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>

                    {Boolean(layer.linkedFieldId) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapseLayer(layer.id);
                        }}
                        className="p-0.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 rounded transition cursor-pointer shrink-0"
                        title={isLayerCollapsed(layer.id) ? "Expand List Items" : "Collapse List Items"}
                      >
                        {isLayerCollapsed(layer.id) ? (
                          <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    {getLayerIcon(layer.layerType)}

                    {editingLayerId === layer.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleSaveRename(layer.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRename(layer.id);
                          if (e.key === "Escape") setEditingLayerId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-semibold text-slate-900 bg-white border border-blue-500 rounded px-1.5 py-0.5 focus:outline-none w-full shadow-2xs"
                      />
                    ) : (
                      <span
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(layer.id, layer.name);
                        }}
                        className={`text-xs truncate rounded px-1 py-0.5 transition cursor-pointer select-none ${
                          isSelected ? "font-semibold text-blue-950" : "font-normal text-slate-700 hover:bg-slate-200/60"
                        }`}
                        title="Double click to edit layer name"
                      >
                        {layer.name}
                      </span>
                    )}
                    <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1 py-0.2 rounded border border-slate-200 shrink-0">
                      z:{rootDisplayLayers.length - 1 - index}
                    </span>

                    {/* Add Mask Layer Icon Button for Photo Upload */}
                    {layer.layerType === "PHOTO_UPLOAD" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddMaskLayer && onAddMaskLayer(layer.id);
                        }}
                        className={`p-1 rounded transition text-purple-600 hover:bg-purple-100 cursor-pointer ${
                          linkedMask ? "bg-purple-100 font-bold" : "hover:scale-110"
                        }`}
                        title={linkedMask ? "Mask Attached to Photo Upload" : "Add Mask Layer for Photo Upload"}
                      >
                        <Scissors className="w-3.5 h-3.5 text-purple-700" />
                      </button>
                    )}
                  </div>

                  {/* Parent Layer Control Buttons */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {Boolean(layer.linkedFieldId) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const linkedField = fields.find((f) => f.id === layer.linkedFieldId);
                          if (linkedField && onUpdateField) {
                            const config = linkedField.config || {};
                            const options: any[] = config.options || [];
                            if (options.length > 1) {
                              const item1 = options[0];
                              const firstPosX = item1?.posX !== undefined ? item1.posX : layer.posX;
                              const firstPosY = item1?.posY !== undefined ? item1.posY : layer.posY;
                              const firstRotation = item1?.rotation !== undefined ? item1.rotation : layer.rotation || 0;
                              const firstOpacity = item1?.opacity !== undefined ? item1.opacity : layer.properties?.opacity ?? 1;

                              const updatedOpts = options.map((opt: any, idx: number) => {
                                if (idx === 0) return opt;
                                return {
                                  ...opt,
                                  posX: firstPosX,
                                  posY: firstPosY,
                                  rotation: firstRotation,
                                  opacity: firstOpacity,
                                };
                              });

                              onUpdateField(linkedField.id, {
                                config: { ...config, options: updatedOpts },
                              });
                            }
                          }
                        }}
                        className="p-1 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100/70 rounded transition cursor-pointer"
                        title="Reset position of all Items (#2 onwards) to match Item #1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateLayer && onDuplicateLayer(layer.id);
                      }}
                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                      title="Duplicate Layer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateLayer(layer.id, { isVisible: !layer.isVisible });
                      }}
                      className={`p-1 rounded transition ${
                        layer.isVisible
                          ? "text-slate-400 hover:text-slate-700"
                          : "text-amber-500 bg-amber-50"
                      }`}
                      title={layer.isVisible ? "Hide Layer" : "Show Layer"}
                    >
                      {layer.isVisible ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateLayer(layer.id, { isLocked: !layer.isLocked });
                      }}
                      className={`p-1 rounded transition ${
                        layer.isLocked
                          ? "text-red-500 bg-red-50"
                          : "text-slate-400 hover:text-slate-700"
                      }`}
                      title={layer.isLocked ? "Unlock Layer" : "Lock Layer"}
                    >
                      {layer.isLocked ? (
                        <Lock className="w-3.5 h-3.5" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteLayer(layer.id);
                      }}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                      title="Delete Layer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* NESTED DEPENDENT MASK LAYER (No drag & drop, no separate z-index badge) */}
                {linkedMask && (
                  <div
                    onClick={(e) => onSelectLayer(linkedMask.id, e.ctrlKey || e.metaKey)}
                    className={`ml-4 flex items-center justify-between px-2 py-1 rounded-lg border transition cursor-pointer text-xs border-l-4 ${
                      isMaskSelected
                        ? "bg-purple-100/90 border-purple-400 text-purple-950 font-bold border-l-purple-600 shadow-2xs"
                        : "bg-purple-50/70 border-purple-200 text-purple-900 border-l-purple-400 hover:bg-purple-100/70"
                    }`}
                    title="Dependent Mask Layer (Bound to Parent Photo Upload)"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {/* Curved connector icon showing dependency on parent above */}
                      <span className="text-purple-400 text-[11px] font-mono select-none">└─</span>
                      <Scissors className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      {editingLayerId === linkedMask.id ? (
                        <input
                          type="text"
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleSaveRename(linkedMask.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveRename(linkedMask.id);
                            if (e.key === "Escape") setEditingLayerId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs font-semibold text-purple-950 bg-white border border-purple-500 rounded px-1.5 py-0.5 focus:outline-none w-full shadow-2xs"
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(linkedMask.id, linkedMask.name);
                          }}
                          className={`truncate rounded px-1 py-0.5 transition cursor-pointer select-none ${
                            isMaskSelected ? "font-semibold text-purple-950" : "font-normal text-purple-900 hover:bg-purple-200/60"
                          }`}
                          title="Double click to edit mask name"
                        >
                          {linkedMask.name}
                        </span>
                      )}
                      <span className="text-[9px] font-bold text-purple-600 bg-purple-100/80 px-1 py-0.2 rounded border border-purple-200 shrink-0">
                        Mask
                      </span>
                    </div>

                    {/* Mask Controls (Visibility, Lock, Delete) - NO Drag & NO Index */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateLayer(linkedMask.id, { isVisible: !linkedMask.isVisible });
                        }}
                        className={`p-1 rounded transition ${
                          linkedMask.isVisible
                            ? "text-purple-500 hover:text-purple-800"
                            : "text-amber-500 bg-amber-50"
                        }`}
                        title={linkedMask.isVisible ? "Hide Mask" : "Show Mask"}
                      >
                        {linkedMask.isVisible ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateLayer(linkedMask.id, { isLocked: !linkedMask.isLocked });
                        }}
                        className={`p-1 rounded transition ${
                          linkedMask.isLocked
                            ? "text-red-500 bg-red-50"
                            : "text-purple-500 hover:text-purple-800"
                        }`}
                        title={linkedMask.isLocked ? "Unlock Mask" : "Lock Mask"}
                      >
                        {linkedMask.isLocked ? (
                          <Lock className="w-3.5 h-3.5" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLayer(linkedMask.id);
                        }}
                        className="p-1 text-purple-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        title="Delete Mask Layer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* NESTED DEPENDENT LIST / ITEM LAYERS (Bound to Parent List/Item Layer) */}
                {(() => {
                  const linkedField = fields.find((f) => f.id === layer.linkedFieldId);
                  if (!isLayerCollapsed(layer.id) && linkedField && (linkedField.fieldType === "SELECT" || linkedField.fieldType === "DROPDOWN" || linkedField.fieldType === "RADIO")) {
                    const options = linkedField.config?.options || [];
                    return (
                      <div className="ml-3 mt-1 space-y-1 pl-1.5 border-l-2 border-indigo-300/80">
                        {options.map((opt: any, optIdx: number) => {
                          const isSelectedOption = isSelected && (linkedField.activeOptionId === opt.id || (!linkedField.activeOptionId && optIdx === 0));
                          const isItemDragging = draggedItemIdx === optIdx && draggedItemFieldId === linkedField.id;

                          return (
                            <div
                              key={opt.id || optIdx}
                              draggable={true}
                              onDragStart={(e) => handleItemDragStart(e, linkedField.id, optIdx)}
                              onDragOver={(e) => handleItemDragOver(e, linkedField.id, optIdx, linkedField)}
                              onDragEnd={handleItemDragEnd}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectLayer(layer.id);
                                if (onUpdateField) onUpdateField(linkedField.id, { activeOptionId: opt.id });
                                if (onPreviewOptionChoice) onPreviewOptionChoice(linkedField.id, opt);
                              }}
                              className={`flex items-center justify-between px-2 py-1.5 rounded-lg border transition cursor-pointer text-xs ${
                                isItemDragging
                                  ? "opacity-40 border-dashed border-indigo-500 bg-indigo-100"
                                  : isSelectedOption
                                  ? "bg-indigo-100/90 border-indigo-400 text-indigo-950 font-bold shadow-2xs"
                                  : isSelected
                                  ? "bg-indigo-50/50 border-indigo-200/80 text-indigo-900 hover:bg-indigo-100/70"
                                  : "bg-slate-50/70 border-slate-200/80 text-slate-700 hover:bg-slate-100"
                              }`}
                              title="Drag handle to reorder, click to select"
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <GripVertical className="w-3.5 h-3.5 text-indigo-400 hover:text-indigo-700 cursor-grab active:cursor-grabbing shrink-0" title="Drag to reorder Item" />
                                <div className="w-5 h-5 rounded border border-indigo-300 bg-white flex items-center justify-center shrink-0 overflow-hidden">
                                  {opt.swatchImageUrl ? (
                                    <img src={opt.swatchImageUrl} alt="" className="w-full h-full object-cover" />
                                  ) : opt.assetImageUrl ? (
                                    <img src={opt.assetImageUrl} alt="" className="w-full h-full object-contain p-0.5" />
                                  ) : (
                                    <ImageIcon className="w-3 h-3 text-indigo-500" />
                                  )}
                                </div>

                                {editingItemId === opt.id ? (
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingItemLabel}
                                    onChange={(e) => setEditingItemLabel(e.target.value)}
                                    onBlur={() => handleSaveRenameItem(linkedField, optIdx)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleSaveRenameItem(linkedField, optIdx);
                                      if (e.key === "Escape") setEditingItemId(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-xs font-semibold text-indigo-950 bg-white border border-indigo-500 rounded px-1.5 py-0.5 focus:outline-none w-full shadow-2xs min-w-[80px]"
                                  />
                                ) : (
                                  <span
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      handleStartRenameItem(opt.id, opt.label || `Item ${optIdx + 1}`);
                                    }}
                                    className="truncate text-xs select-none hover:text-indigo-700 rounded px-0.5 py-0.2 transition cursor-pointer"
                                    title="Double click to rename Item"
                                  >
                                    {opt.label || `Item ${optIdx + 1}`}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[9px] font-mono font-semibold text-indigo-700 bg-indigo-100/90 px-1 py-0.2 rounded border border-indigo-200" title={`Internal Item Index ${optIdx + 1}`}>
                                  i:{optIdx + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updatedOpts = [...options];
                                    const isVis = opt.isVisible !== false;
                                    updatedOpts[optIdx] = { ...opt, isVisible: !isVis };
                                    if (onUpdateField) {
                                      onUpdateField(linkedField.id, {
                                        config: { ...linkedField.config, options: updatedOpts },
                                      });
                                    }
                                  }}
                                  className="p-1 rounded transition cursor-pointer hover:bg-indigo-200/50"
                                  title={opt.isVisible !== false ? "Hide Item on Studio Canvas" : "Show Item on Studio Canvas"}
                                >
                                  {opt.isVisible !== false ? (
                                    <Eye className="w-3.5 h-3.5 text-indigo-600" />
                                  ) : (
                                    <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const sourceOpt = options[optIdx];
                                    const newOpt = {
                                      ...sourceOpt,
                                      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                                      label: `${sourceOpt.label || `Item ${optIdx + 1}`} (Copy)`,
                                      value: `${sourceOpt.value || `item_${optIdx + 1}`}_copy_${Date.now().toString(36).substring(2, 6)}`,
                                      posX: (sourceOpt.posX !== undefined ? sourceOpt.posX : layer.posX) + 20,
                                      posY: (sourceOpt.posY !== undefined ? sourceOpt.posY : layer.posY) + 20,
                                    };
                                    const updatedOpts = [...options];
                                    updatedOpts.splice(optIdx + 1, 0, newOpt);
                                    onSelectLayer(layer.id);
                                    if (onUpdateField) {
                                      onUpdateField(linkedField.id, {
                                        config: { ...linkedField.config, options: updatedOpts },
                                        activeOptionId: newOpt.id,
                                      });
                                    }
                                  }}
                                  className="p-1 text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 rounded transition cursor-pointer"
                                  title="Duplicate Item"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updatedOpts = options.filter((_: any, i: number) => i !== optIdx);
                                    const nextOpt = updatedOpts[0];
                                    if (onUpdateField) onUpdateField(linkedField.id, {
                                      config: { ...linkedField.config, options: updatedOpts },
                                      activeOptionId: isSelectedOption ? nextOpt?.id : linkedField.activeOptionId,
                                    });
                                  }}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                                  title="Remove Item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        <div className="ml-5 my-1 flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectLayer(layer.id);
                              if (onOpenMediaPickerForBatchOptions) {
                                onOpenMediaPickerForBatchOptions(linkedField.id);
                              }
                            }}
                            className="py-1 px-2 text-[10px] font-bold text-indigo-700 bg-indigo-100/90 hover:bg-indigo-200 border border-indigo-300 rounded-md transition flex items-center gap-1 cursor-pointer shadow-2xs"
                            title="Select multiple images from Media Library to create items automatically"
                          >
                            <Images className="w-3 h-3 text-indigo-600" />
                            <span>+ Add Items by Images</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectLayer(layer.id);
                              const item1 = options[0];
                              const firstPosX = item1?.posX !== undefined ? item1.posX : layer.posX;
                              const firstPosY = item1?.posY !== undefined ? item1.posY : layer.posY;

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
                                rotation: item1?.rotation !== undefined ? item1.rotation : layer.rotation || 0,
                                opacity: item1?.opacity !== undefined ? item1.opacity : layer.properties?.opacity ?? 1,
                                isVisible: true,
                              };
                              if (onUpdateField) onUpdateField(linkedField.id, {
                                config: { ...linkedField.config, options: [...options, newOpt] },
                                activeOptionId: newOpt.id,
                              });
                            }}
                            className="py-1 px-2 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3 text-indigo-600" />
                            <span>Add Item</span>
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
