import React from "react";
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
} from "lucide-react";

interface StudioLayerPanelProps {
  layers: CanvasLayerItem[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onUpdateLayer: (layerId: string, updatedProps: Partial<CanvasLayerItem>) => void;
  onAddLayer: (layerType: "BACKGROUND" | "ASSET" | "TEXT" | "PHOTO_UPLOAD" | "OVERLAY") => void;
  onDeleteLayer: (layerId: string) => void;
  onReorderLayers: (reorderedLayers: CanvasLayerItem[]) => void;
}

export default function StudioLayerPanel({
  layers,
  selectedLayerId,
  onSelectLayer,
  onUpdateLayer,
  onAddLayer,
  onDeleteLayer,
  onReorderLayers,
}: StudioLayerPanelProps) {
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
      case "OVERLAY":
        return <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />;
      default:
        return <Layers className="w-4 h-4 text-slate-500 shrink-0" />;
    }
  };

  const moveLayer = (currentIndex: number, direction: "UP" | "DOWN") => {
    const targetIndex = direction === "UP" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= displayLayers.length) return;

    const updated = [...displayLayers];
    const temp = updated[currentIndex];
    updated[currentIndex] = updated[targetIndex];
    updated[targetIndex] = temp;

    // Reassign zIndex values
    const finalLayers = updated.map((layer, idx) => ({
      ...layer,
      zIndex: updated.length - 1 - idx,
    }));

    onReorderLayers(finalLayers);
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 w-80 shrink-0 select-none">
      {/* Header Actions */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2 uppercase tracking-wider">
          <Layers className="w-4 h-4 text-blue-600" />
          Layer Stack ({layers.length})
        </h3>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onAddLayer("TEXT")}
            className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-1 rounded transition cursor-pointer"
            title="Add Text Layer"
          >
            <Plus className="w-3 h-3" /> Text
          </button>
          <button
            onClick={() => onAddLayer("ASSET")}
            className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded transition cursor-pointer"
            title="Add Graphic Asset Layer"
          >
            <Plus className="w-3 h-3" /> Asset
          </button>
        </div>
      </div>

      {/* Layer List Items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {displayLayers.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <Layers className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">No layers created yet</p>
            <p className="text-[11px] text-slate-400">Click "+ Text" or "+ Asset" to start</p>
          </div>
        ) : (
          displayLayers.map((layer, index) => {
            const isSelected = layer.id === selectedLayerId;
            return (
              <div
                key={layer.id}
                onClick={() => onSelectLayer(layer.id)}
                className={`group flex items-center justify-between p-2 rounded-lg border transition cursor-pointer ${
                  isSelected
                    ? "bg-blue-50/90 border-blue-400 text-blue-950 font-medium shadow-xs"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Move Up / Move Down Buttons */}
                  <div className="flex flex-col gap-0.5 opacity-40 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayer(index, "UP");
                      }}
                      disabled={index === 0}
                      className="text-[9px] text-slate-500 hover:text-blue-600 leading-none disabled:opacity-20"
                    >
                      ▲
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayer(index, "DOWN");
                      }}
                      disabled={index === displayLayers.length - 1}
                      className="text-[9px] text-slate-500 hover:text-blue-600 leading-none disabled:opacity-20"
                    >
                      ▼
                    </button>
                  </div>

                  {getLayerIcon(layer.layerType)}

                  <span className="text-xs truncate font-medium">{layer.name}</span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                    z:{layer.zIndex}
                  </span>
                </div>

                {/* Layer Control Buttons */}
                <div className="flex items-center gap-1 shrink-0">
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
                    className="p-1 text-slate-400 hover:text-red-600 rounded transition"
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
