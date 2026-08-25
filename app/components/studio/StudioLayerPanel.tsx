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
  Scissors,
} from "lucide-react";

interface StudioLayerPanelProps {
  layers: CanvasLayerItem[];
  selectedLayerId: string | null;
  selectedLayerIds?: string[];
  onSelectLayer: (layerId: string | null, isMultiKey?: boolean) => void;
  onUpdateLayer: (layerId: string, updatedProps: Partial<CanvasLayerItem>) => void;
  onAddLayer: (layerType: "BACKGROUND" | "ASSET" | "TEXT" | "PHOTO_UPLOAD" | "OVERLAY") => void;
  onAddMaskLayer?: (photoLayerId: string) => void;
  onDuplicateLayer?: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onReorderLayers: (reorderedLayers: CanvasLayerItem[]) => void;
}

export default function StudioLayerPanel({
  layers,
  selectedLayerId,
  selectedLayerIds = [],
  onSelectLayer,
  onUpdateLayer,
  onAddLayer,
  onAddMaskLayer,
  onDuplicateLayer,
  onDeleteLayer,
  onReorderLayers,
}: StudioLayerPanelProps) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

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

  const getLayerIcon = (type: string) => {
    switch (type) {
      case "TEXT":
        return <Type className="w-4 h-4 text-indigo-600 shrink-0" />;
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
                  className="w-full px-3 py-2 text-left hover:bg-purple-50 flex items-center gap-2.5 text-slate-800 transition cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-purple-600 shrink-0" />
                  <div>
                    <p className="font-bold text-xs text-purple-900">Photo Upload</p>
                    <p className="text-[10px] text-purple-600">Customer photo upload box</p>
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
                  onClick={(e) => onSelectLayer(layer.id, e.ctrlKey || e.metaKey)}
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
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
