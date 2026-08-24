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
  onSelectLayer: (layerId: string | null) => void;
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

  // Sort layers by zIndex descending for display in stack panel (top layer first)
  const displayLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);

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

  // Drag & Drop Handlers for Layer Reordering
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    if (draggedIdx === null || draggedIdx === targetIndex) return;
    e.preventDefault();

    const updated = [...displayLayers];
    const [draggedItem] = updated.splice(draggedIdx, 1);
    updated.splice(targetIndex, 0, draggedItem);

    // Reassign zIndex values (top of array = highest zIndex)
    const finalLayers = updated.map((layer, idx) => ({
      ...layer,
      zIndex: updated.length - 1 - idx,
    }));

    onReorderLayers(finalLayers);
    setDraggedIdx(targetIndex);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 w-80 shrink-0 select-none overflow-visible">
      {/* Header Actions */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between relative overflow-visible z-20">
        <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2 uppercase tracking-wider">
          <Layers className="w-4 h-4 text-blue-600" />
          Layer Stack ({layers.length})
        </h3>

        {/* Add Layer Context Dropdown Menu Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAddMenu((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-lg transition shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Layer</span>
            <ChevronDown className="w-3 h-3 opacity-80" />
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
        {displayLayers.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <Layers className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">No layers created yet</p>
            <p className="text-[11px] text-slate-400">Click "+ Text" or "+ Image" to start</p>
          </div>
        ) : (
          displayLayers.map((layer, index) => {
            const isSelected = layer.id === selectedLayerId;
            const isDragging = draggedIdx === index;

            return (
              <div
                key={layer.id}
                draggable={!layer.isLocked}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelectLayer(layer.id)}
                className={`group flex items-center justify-between p-2 rounded-lg border transition cursor-pointer ${
                  layer.layerType === "MASK"
                    ? isSelected
                      ? "ml-3 bg-purple-100/90 border-purple-400 text-purple-950 font-bold shadow-xs border-l-4 border-l-purple-600"
                      : "ml-3 bg-purple-50/60 border-purple-200 text-purple-900 border-l-4 border-l-purple-400 hover:bg-purple-100/60"
                    : isDragging
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
                    title="Drag to reorder layer z-index"
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>

                  {getLayerIcon(layer.layerType)}

                  <span className="text-xs truncate font-medium">{layer.name}</span>
                  <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1 py-0.2 rounded border border-slate-200 shrink-0">
                    z:{layer.zIndex}
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
                        layer.maskLayerId ? "bg-purple-100 font-bold" : "hover:scale-110"
                      }`}
                      title={layer.maskLayerId ? "Edit Linked Mask Layer" : "Add Mask Layer for Photo Upload"}
                    >
                      <Scissors className="w-3.5 h-3.5 text-purple-700" />
                    </button>
                  )}
                </div>

                {/* Layer Control Buttons */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {/* Duplicate Layer Button */}
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

                  {/* Visibility Button */}
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

                  {/* Lock Button */}
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

                  {/* Delete Button */}
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
            );
          })
        )}
      </div>
    </div>
  );
}
