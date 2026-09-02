import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Type as TypeIcon,
} from "lucide-react";
import type { CanvasLayerItem } from "./StudioCanvas";

type ClipField = {
  id: string;
  label?: string;
  fieldType?: string;
  activeOptionId?: string | null;
  config?: { options?: ClipVariant[] };
};

export type ClipVariant = {
  id: string;
  label?: string;
  value?: string;
  assetImageUrl?: string;
  swatchImageUrl?: string;
  isVisible?: boolean;
};

interface ClipArtAssetPanelProps {
  layers: CanvasLayerItem[];
  fields: ClipField[];
  selectedLayerIds: string[];
  onSelectLayer: (layerId: string) => void;
  onAddGroup: () => void;
  onAddVariants: (layerId: string) => void;
  onSetActiveVariant: (fieldId: string, option: ClipVariant) => void;
  onRename: (layerId: string, name: string) => void;
  onToggleVisible: (layerId: string) => void;
  onDuplicate: (layerId: string) => void;
  onReset: (layerId: string) => void;
  onDelete: (layerId: string) => void;
  onDeleteVariant: (fieldId: string, optId: string) => void;
  onReorder: (reorderedLayers: CanvasLayerItem[]) => void;
}

function thumbUrl(opt: ClipVariant | undefined, layer: CanvasLayerItem) {
  return opt?.swatchImageUrl || opt?.assetImageUrl || layer.properties?.assetUrl || "";
}

export default function ClipArtAssetPanel({
  layers,
  fields,
  selectedLayerIds,
  onSelectLayer,
  onAddGroup,
  onAddVariants,
  onSetActiveVariant,
  onRename,
  onToggleVisible,
  onDuplicate,
  onReset,
  onDelete,
  onDeleteVariant,
  onReorder,
}: ClipArtAssetPanelProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [footerMenuId, setFooterMenuId] = useState<string | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const apartments = useMemo(
    () =>
      [...layers]
        .sort((a, b) => b.zIndex - a.zIndex)
        .map((layer) => {
          const field = layer.linkedFieldId ? fields.find((f) => f.id === layer.linkedFieldId) || null : null;
          const fromField = field?.config?.options || [];
          const options: ClipVariant[] =
            fromField.length > 0
              ? fromField
              : [
                  {
                    id: `solo_${layer.id}`,
                    label: layer.name,
                    assetImageUrl: layer.properties?.assetUrl || "",
                    swatchImageUrl: layer.properties?.assetUrl || "",
                  },
                ];
          return { layer, field, options };
        }),
    [layers, fields]
  );

  useEffect(() => {
    if (editingId) renameRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    if (!menuId && !footerMenuId) return;
    const close = () => {
      setMenuId(null);
      setFooterMenuId(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuId, footerMenuId]);

  const commitRename = (layerId: string) => {
    const next = editingName.trim();
    if (next) onRename(layerId, next);
    setEditingId(null);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    if (draggedIdx === null || draggedIdx === targetIndex) return;
    e.preventDefault();
    const updated = [...apartments];
    const [moved] = updated.splice(draggedIdx, 1);
    updated.splice(targetIndex, 0, moved);
    let z = updated.length;
    onReorder(updated.map(({ layer }) => ({ ...layer, zIndex: z-- })));
    setDraggedIdx(targetIndex);
  };

  return (
    <div className="flex flex-col h-full bg-[#f4f6f8] w-full overflow-hidden">
      <div className="h-9 px-3 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
          Assets <span className="text-slate-500 font-semibold">({apartments.length})</span>
        </h3>
        <button
          type="button"
          onClick={onAddGroup}
          className="flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-blue-600 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-300 px-2 py-1 rounded-md cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-blue-600" />
          Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {apartments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
            <p className="text-[13px] font-semibold text-slate-700">No option groups yet</p>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              Add a group like Shirt or Hairstyle, then drop variant images into its grid.
            </p>
            <button
              type="button"
              onClick={onAddGroup}
              className="mt-4 h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold cursor-pointer"
            >
              Add option group
            </button>
          </div>
        ) : (
          apartments.map(({ layer, field, options }, index) => {
            const isFocused = selectedLayerIds.includes(layer.id);
            const isOpen = collapsed[layer.id] !== true;
            const activeOptId = field?.activeOptionId || options[0]?.id;
            const isDragging = draggedIdx === index;

            return (
              <section
                key={layer.id}
                draggable={editingId !== layer.id}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={() => setDraggedIdx(null)}
                className={`rounded-xl border bg-white overflow-hidden ${
                  isDragging
                    ? "opacity-50 border-dashed border-blue-400"
                    : isFocused
                      ? "border-blue-300 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
                      : "border-slate-200"
                }`}
              >
                <header
                  className="flex items-center gap-0.5 px-2 py-1.5 cursor-pointer"
                  onClick={() => onSelectLayer(layer.id)}
                >
                  <span className="text-slate-300 cursor-grab active:cursor-grabbing p-0.5 shrink-0" title="Drag to reorder">
                    <GripVertical className="w-3.5 h-3.5" />
                  </span>
                  <button
                    type="button"
                    title={isOpen ? "Collapse" : "Expand"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((prev) => ({ ...prev, [layer.id]: isOpen }));
                    }}
                    className="p-0.5 text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
                  >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>

                  <div className="flex-1 min-w-0 flex items-center gap-0.5">
                    {editingId === layer.id ? (
                      <input
                        ref={renameRef}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => commitRename(layer.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(layer.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 w-full min-w-0 px-1.5 rounded border border-blue-400 text-[12px] font-bold text-slate-800 bg-white focus:outline-none"
                      />
                    ) : (
                      <h3 className="text-[12px] font-bold text-slate-800 truncate">
                        {layer.name} <span className="font-semibold text-slate-500">({options.length})</span>
                      </h3>
                    )}
                    <IconBtn
                      title="Rename"
                      onClick={() => {
                        setEditingId(layer.id);
                        setEditingName(layer.name);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </IconBtn>
                  </div>

                  <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                    <IconBtn title="Add variants" onClick={() => onAddVariants(layer.id)}>
                      <Plus className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn title={layer.isVisible ? "Hide" : "Show"} onClick={() => onToggleVisible(layer.id)}>
                      {layer.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                    </IconBtn>
                    <IconBtn title="Duplicate" onClick={() => onDuplicate(layer.id)}>
                      <Copy className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn title="Reset position" onClick={() => onReset(layer.id)}>
                      <RotateCcw className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn title="Delete" danger onClick={() => onDelete(layer.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconBtn>
                    <div className="relative">
                      <IconBtn title="More" onClick={() => setMenuId((id) => (id === layer.id ? null : layer.id))}>
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </IconBtn>
                      {menuId === layer.id && (
                        <div
                          className="absolute right-0 top-7 z-20 w-44 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-[12px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MenuItem
                            label="Add variants"
                            onClick={() => {
                              onAddVariants(layer.id);
                              setMenuId(null);
                            }}
                          />
                          <MenuItem
                            label="Reset transform"
                            onClick={() => {
                              onReset(layer.id);
                              setMenuId(null);
                            }}
                          />
                          <MenuItem
                            label="Duplicate group"
                            onClick={() => {
                              onDuplicate(layer.id);
                              setMenuId(null);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </header>

                {isOpen && (
                  <div className="px-2.5 pb-2.5">
                    <div className="grid grid-cols-5 gap-1.5">
                      {options.map((opt) => {
                        const isActive = opt.id === activeOptId && isFocused;
                        const isCurrent = opt.id === activeOptId;
                        const url = thumbUrl(opt, layer);
                        const isSolo = opt.id.startsWith("solo_");
                        return (
                          <div key={opt.id} className="relative group/thumb">
                            <button
                              type="button"
                              title={opt.label || layer.name}
                              onClick={() => {
                                onSelectLayer(layer.id);
                                if (!isSolo && field) onSetActiveVariant(field.id, opt);
                              }}
                              className={`w-full aspect-square rounded-md overflow-hidden bg-white flex items-center justify-center cursor-pointer ${
                                isActive
                                  ? "border-2 border-blue-500"
                                  : isCurrent
                                    ? "border border-blue-300"
                                    : "border border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              {url ? (
                                <img src={url} alt="" className="w-full h-full object-contain p-0.5" />
                              ) : layer.layerType === "TEXT" ? (
                                <TypeIcon className="w-4 h-4 text-slate-400" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-slate-300" />
                              )}
                            </button>
                            {!isSolo && field && options.length > 1 && (
                              <button
                                type="button"
                                title="Remove variant"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteVariant(field.id, opt.id);
                                }}
                                className="absolute -top-1 -right-1 hidden group-hover/thumb:flex w-4 h-4 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-300 cursor-pointer shadow-sm"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onAddVariants(layer.id)}
                        className="h-8 px-3 rounded-md border border-slate-300 bg-white text-[12px] font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add more
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          title="More"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFooterMenuId((id) => (id === layer.id ? null : layer.id));
                          }}
                          className="h-8 w-8 rounded-md border border-slate-300 bg-white text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {footerMenuId === layer.id && field && (
                          <div
                            className="absolute left-0 top-9 z-20 w-44 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-[12px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {activeOptId && options.length > 1 && (
                              <MenuItem
                                label="Delete selected variant"
                                onClick={() => {
                                  onDeleteVariant(field.id, activeOptId);
                                  setFooterMenuId(null);
                                }}
                              />
                            )}
                            <MenuItem
                              label="Add variants"
                              onClick={() => {
                                onAddVariants(layer.id);
                                setFooterMenuId(null);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
  danger,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-1 rounded hover:bg-slate-100 cursor-pointer ${
        danger ? "text-slate-400 hover:text-red-600" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 cursor-pointer"
    >
      {label}
    </button>
  );
}
