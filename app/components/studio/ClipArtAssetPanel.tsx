import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  Trash2,
  Type as TypeIcon,
  GitBranch,
  Link2,
  Layers,
} from "lucide-react";
import type { CanvasLayerItem } from "./StudioCanvas";
import {
  sequentialRenameOptions,
  smartRenameOptions,
  type BulkRenameMode,
} from "../../utils/optionRename";
import { isEmptyOption } from "../../utils/fieldHelpers";
import { clauseValues, type ClipArtConditionClause } from "../../utils/clipArtInstance";
import { trimToSquareDataUrl } from "../../utils/thumbnailGenerator";
import { CLIP_ART_TIPS } from "../../utils/clipArtTips";
import FeatureTip, { FEATURE_TIP_ATTR } from "./FeatureTip";

type ClipField = {
  id: string;
  label?: string;
  fieldType?: string;
  activeOptionId?: string | null;
  hiddenFromCustomer?: boolean;
  allowPersonalized?: boolean;
  config?: { options?: ClipVariant[]; freeTransform?: boolean };
};

export type ClipVariant = {
  id: string;
  label?: string;
  value?: string;
  assetImageUrl?: string;
  swatchImageUrl?: string;
  isVisible?: boolean;
  isEmpty?: boolean;
  showWhen?: ClipArtConditionClause[];
};

interface ClipArtAssetPanelProps {
  layers: CanvasLayerItem[];
  fields: ClipField[];
  selectedLayerIds: string[];
  onSelectLayer: (layerId: string, mode?: { multi?: boolean; range?: boolean }) => void;
  onAddGroup: () => void;
  onAddVariants: (layerId: string) => void;
  onAddEmptyOption: (layerId: string) => void;
  onSetActiveVariant: (fieldId: string, option: ClipVariant) => void;
  onRename: (layerId: string, name: string) => void;
  onRenameOption: (fieldId: string, optId: string, name: string) => void;
  onBulkRenameOptions: (fieldId: string, updates: { id: string; label: string }[]) => void;
  onRegenerateThumbs: (fieldId: string) => void;
  onToggleVisible: (layerId: string) => void;
  onDuplicate: (layerId: string) => void;
  onDelete: (layerId: string) => void;
  onDeleteVariant: (fieldId: string, optId: string) => void;
  onReorder: (reorderedLayers: CanvasLayerItem[]) => void;
  onReorderOptions: (fieldId: string, options: ClipVariant[]) => void;
  onToggleHiddenField?: (fieldId: string, hidden: boolean) => void;
  onToggleFreeTransform?: (fieldId: string, enabled: boolean) => void;
  onUpdateOption?: (fieldId: string, optId: string, patch: Partial<ClipVariant>) => void;
  onAddSandwichFront?: (layerId: string) => void;
  onSetKnockoutGroupIds?: (layerId: string, ids: string[]) => void;
  onOpenConditions?: () => void;
  conditionCount?: number;
  hiddenGroupIds?: Set<string>;
}

function thumbSource(opt: ClipVariant | undefined, layer: CanvasLayerItem) {
  if (!opt || isEmptyOption(opt)) return "";
  return opt.swatchImageUrl || opt.assetImageUrl || layer.properties?.assetUrl || "";
}

function TrimmedThumb({ src, alreadySquare }: { src: string; alreadySquare?: boolean }) {
  const [url, setUrl] = useState(alreadySquare ? src : "");

  useEffect(() => {
    if (!src) {
      setUrl("");
      return;
    }
    if (alreadySquare) {
      setUrl(src);
      return;
    }
    let live = true;
    trimToSquareDataUrl(src, 128).then((next) => {
      if (live) setUrl(next || src);
    });
    return () => {
      live = false;
    };
  }, [src, alreadySquare]);

  if (!src) return null;
  return <img src={url || src} alt="" className="w-full h-full object-contain" draggable={false} />;
}

export default function ClipArtAssetPanel({
  layers,
  fields,
  selectedLayerIds,
  onSelectLayer,
  onAddGroup,
  onAddVariants,
  onAddEmptyOption,
  onSetActiveVariant,
  onRename,
  onRenameOption,
  onBulkRenameOptions,
  onRegenerateThumbs,
  onToggleVisible,
  onDuplicate,
  onDelete,
  onDeleteVariant,
  onReorder,
  onReorderOptions,
  onToggleHiddenField,
  onToggleFreeTransform,
  onUpdateOption,
  onAddSandwichFront,
  onSetKnockoutGroupIds,
  onOpenConditions,
  conditionCount = 0,
  hiddenGroupIds,
}: ClipArtAssetPanelProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOptId, setEditingOptId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [footerMenuId, setFooterMenuId] = useState<string | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [draggedOpt, setDraggedOpt] = useState<{ fieldId: string; from: number } | null>(null);
  const [driveOptId, setDriveOptId] = useState<string | null>(null);
  const [driveSourceId, setDriveSourceId] = useState("");
  const [bulkFieldId, setBulkFieldId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState<BulkRenameMode>("smart");
  const [seqPrefix, setSeqPrefix] = useState("");
  const [seqStart, setSeqStart] = useState(1);
  const [seqPad, setSeqPad] = useState(0);
  const renameRef = useRef<HTMLInputElement>(null);
  const optRenameRef = useRef<HTMLInputElement>(null);
  const headerMenuAnchors = useRef<Record<string, HTMLElement | null>>({});
  const footerMenuAnchors = useRef<Record<string, HTMLElement | null>>({});

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

  const bulkTarget = useMemo(() => {
    if (!bulkFieldId) return null;
    return apartments.find((a) => a.field?.id === bulkFieldId) || null;
  }, [apartments, bulkFieldId]);

  const bulkPreview = useMemo(() => {
    if (!bulkTarget?.field) return [];
    const nonempty = bulkTarget.options.filter((o) => !isEmptyOption(o));
    const labels = nonempty.map((o) => o.label || "");
    const names =
      bulkMode === "sequential"
        ? sequentialRenameOptions(labels.length, { prefix: seqPrefix, start: seqStart, pad: seqPad })
        : smartRenameOptions(bulkTarget.layer.name, labels);
    let i = 0;
    return bulkTarget.options.map((opt) => {
      if (isEmptyOption(opt)) {
        return { id: opt.id, from: opt.label || "None", to: opt.label || "None" };
      }
      return { id: opt.id, from: opt.label || "", to: names[i++] || opt.label || "" };
    });
  }, [bulkTarget, bulkMode, seqPrefix, seqStart, seqPad]);

  useEffect(() => {
    if (editingId) renameRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    if (editingOptId) optRenameRef.current?.focus();
  }, [editingOptId]);

  useEffect(() => {
    if (!menuId && !footerMenuId) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(`[${FEATURE_TIP_ATTR}]`)) return;
      setMenuId(null);
      setFooterMenuId(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuId, footerMenuId]);

  const commitGroupRename = (layerId: string) => {
    const next = editingName.trim();
    if (next) onRename(layerId, next);
    setEditingId(null);
  };

  const commitOptionRename = (fieldId: string, optId: string) => {
    const next = editingName.trim();
    if (next) onRenameOption(fieldId, optId, next);
    setEditingOptId(null);
  };

  const openBulkRename = (fieldId: string, groupName: string, optionCount: number) => {
    setBulkFieldId(fieldId);
    setBulkMode("smart");
    setSeqPrefix(groupName);
    setSeqStart(1);
    setSeqPad(optionCount >= 10 ? 2 : 0);
    setMenuId(null);
    setFooterMenuId(null);
  };

  const applyBulkRename = () => {
    if (!bulkTarget?.field || bulkPreview.length === 0) return;
    onBulkRenameOptions(
      bulkTarget.field.id,
      bulkPreview.map((row) => ({ id: row.id, label: row.to }))
    );
    setBulkFieldId(null);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
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
        <div className="flex items-center gap-1">
          {onOpenConditions && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={onOpenConditions}
                className="flex items-center gap-1 text-xs font-semibold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-md cursor-pointer"
                title="Show or hide groups based on other option groups"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Conditions
                {conditionCount > 0 && (
                  <span className="text-[10px] font-extrabold leading-none">{conditionCount}</span>
                )}
              </button>
              <FeatureTip title={CLIP_ART_TIPS.conditions.title}>{CLIP_ART_TIPS.conditions.body}</FeatureTip>
            </div>
          )}
          <button
            type="button"
            onClick={onAddGroup}
            className="flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-blue-600 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-300 px-2 py-1 rounded-md cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            Add
          </button>
        </div>
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
            const isOpen = collapsed[layer.id] === false;
            const activeOptId = field?.activeOptionId || options[0]?.id;
            const isDragging = draggedIdx === index;
            const hasEmpty = options.some((o) => isEmptyOption(o));
            const groupId = field?.id || layer.id;
            const hiddenByCondition = Boolean(hiddenGroupIds?.has(groupId));
            const isHiddenField = Boolean(field?.hiddenFromCustomer || field?.allowPersonalized === false);
            const isFreeTransform = Boolean(field?.config?.freeTransform);
            const isSandwichFront = layer.properties?.sandwichRole === "front";
            const knockoutIds: string[] = Array.isArray(layer.properties?.knockoutGroupIds)
              ? layer.properties.knockoutGroupIds
              : [];

            return (
              <section
                key={layer.id}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={() => setDraggedIdx(null)}
                className={`rounded-xl border bg-white ${
                  isDragging
                    ? "opacity-50 border-dashed border-blue-400"
                    : isFocused
                      ? "border-blue-300 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
                      : hiddenByCondition
                        ? "border-amber-200 opacity-70"
                        : "border-slate-200"
                }`}
              >
                <header
                  className="flex items-center gap-0.5 px-2 py-1.5 cursor-pointer"
                  onClick={(e) =>
                    onSelectLayer(layer.id, {
                      multi: e.metaKey || e.ctrlKey,
                      range: e.shiftKey,
                    })
                  }
                >
                  <label
                    className="shrink-0 p-0.5 cursor-pointer"
                    title="Add to selection"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isFocused}
                      onChange={() => onSelectLayer(layer.id, { multi: true })}
                      onClick={(e) => (e.currentTarget as HTMLInputElement).blur()}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 cursor-pointer accent-blue-600"
                    />
                  </label>
                  <span
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    className="text-slate-300 cursor-grab active:cursor-grabbing p-0.5 shrink-0"
                    title="Drag to reorder"
                  >
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
                        onBlur={() => commitGroupRename(layer.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitGroupRename(layer.id);
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
                    {isSandwichFront && (
                      <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-wide text-violet-800 bg-violet-50 border border-violet-200 px-1 py-0.5 rounded">
                        Front
                        <FeatureTip compact title={CLIP_ART_TIPS.sandwichFront.title}>
                          {CLIP_ART_TIPS.sandwichFront.body}
                        </FeatureTip>
                      </span>
                    )}
                    {isHiddenField && !isSandwichFront && (
                      <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-wide text-slate-700 bg-slate-100 border border-slate-300 px-1 py-0.5 rounded">
                        Hidden field
                        <FeatureTip compact title={CLIP_ART_TIPS.hiddenField.title}>
                          {CLIP_ART_TIPS.hiddenField.body}
                        </FeatureTip>
                      </span>
                    )}
                    {isFreeTransform && !isSandwichFront && (
                      <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-wide text-sky-800 bg-sky-50 border border-sky-200 px-1 py-0.5 rounded">
                        Free size
                        <FeatureTip compact title={CLIP_ART_TIPS.freeSize.title}>
                          {CLIP_ART_TIPS.freeSize.body}
                        </FeatureTip>
                      </span>
                    )}
                    {hiddenByCondition && (
                      <span
                        className="shrink-0 text-[9px] font-extrabold uppercase tracking-wide text-amber-800 bg-amber-100 border border-amber-200 px-1 py-0.5 rounded"
                        title="Hidden by a clip art condition"
                      >
                        Hidden
                      </span>
                    )}
                    <IconBtn
                      title="Rename group"
                      onClick={() => {
                        setEditingOptId(null);
                        setEditingId(layer.id);
                        setEditingName(layer.name);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </IconBtn>
                  </div>

                  <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                    {!isSandwichFront && (
                      <IconBtn title="Add variants" onClick={() => onAddVariants(layer.id)}>
                        <Plus className="w-3.5 h-3.5" />
                      </IconBtn>
                    )}
                    <IconBtn title={layer.isVisible ? "Hide" : "Show"} onClick={() => onToggleVisible(layer.id)}>
                      {layer.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                    </IconBtn>
                    {!isSandwichFront && (
                      <IconBtn title="Duplicate" onClick={() => onDuplicate(layer.id)}>
                        <Copy className="w-3.5 h-3.5" />
                      </IconBtn>
                    )}
                    <IconBtn title="Delete" danger onClick={() => onDelete(layer.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconBtn>
                    <div
                      ref={(el) => {
                        headerMenuAnchors.current[layer.id] = el;
                      }}
                    >
                      <IconBtn title="More" onClick={() => setMenuId((id) => (id === layer.id ? null : layer.id))}>
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </IconBtn>
                    </div>
                  </div>
                </header>

                {isOpen && (
                  <div className="px-2.5 pb-2.5">
                    {isSandwichFront ? (
                      <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2 space-y-2">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[10px] font-bold text-violet-900">Stay behind (punch holes)</p>
                          <FeatureTip title={CLIP_ART_TIPS.sandwichKnockout.title}>
                            {CLIP_ART_TIPS.sandwichKnockout.body}
                          </FeatureTip>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {apartments
                            .filter(
                              (a) =>
                                a.layer.id !== layer.id &&
                                a.layer.id !== layer.properties?.sandwichSourceLayerId &&
                                a.layer.properties?.sandwichRole !== "front"
                            )
                            .map((a) => {
                              const gid = a.field?.id || a.layer.id;
                              const checked = knockoutIds.includes(gid);
                              return (
                                <label
                                  key={gid}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold cursor-pointer ${
                                    checked
                                      ? "bg-violet-100 border-violet-400 text-violet-950"
                                      : "bg-white border-slate-200 text-slate-600"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const next = checked
                                        ? knockoutIds.filter((id) => id !== gid)
                                        : [...knockoutIds, gid];
                                      onSetKnockoutGroupIds?.(layer.id, next);
                                    }}
                                    className="w-3 h-3 accent-violet-600"
                                  />
                                  {a.layer.name.replace(/\s*\(front\)\s*$/i, "")}
                                </label>
                              );
                            })}
                        </div>
                      </div>
                    ) : (
                    <>
                    <div className="flex flex-wrap gap-2">
                      {options.map((opt, optIndex) => {
                        const isActive = opt.id === activeOptId && isFocused;
                        const isCurrent = opt.id === activeOptId;
                        const source = thumbSource(opt, layer);
                        const isSolo = opt.id.startsWith("solo_");
                        const isEmpty = isEmptyOption(opt);
                        const isEditingOpt = editingOptId === opt.id;
                        const tooltip = opt.label || (isEmpty ? "None" : layer.name);
                        const isOptDragging =
                          draggedOpt?.fieldId === field?.id && draggedOpt.from === optIndex;
                        return (
                          <div
                            key={opt.id}
                            draggable={!isSolo && !!field && editingOptId !== opt.id}
                            onDragStart={(e) => {
                              if (!field) return;
                              e.stopPropagation();
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", opt.id);
                              setDraggedOpt({ fieldId: field.id, from: optIndex });
                            }}
                            onDragOver={(e) => {
                              if (!field || !draggedOpt || draggedOpt.fieldId !== field.id) return;
                              e.preventDefault();
                              e.stopPropagation();
                              if (draggedOpt.from === optIndex) return;
                              const next = [...options];
                              const [moved] = next.splice(draggedOpt.from, 1);
                              next.splice(optIndex, 0, moved);
                              onReorderOptions(field.id, next);
                              setDraggedOpt({ fieldId: field.id, from: optIndex });
                            }}
                            onDragEnd={() => setDraggedOpt(null)}
                            className={`relative group/thumb shrink-0 ${
                              isOptDragging ? "opacity-40" : ""
                            } ${!isSolo && field ? "cursor-grab active:cursor-grabbing" : ""}`}
                          >
                            <button
                              type="button"
                              title={tooltip}
                              onClick={() => {
                                onSelectLayer(layer.id);
                                if (!isSolo && field) onSetActiveVariant(field.id, opt);
                              }}
                              className={`w-16 h-16 rounded-md overflow-hidden flex items-center justify-center ${
                                !isSolo && field ? "cursor-grab" : "cursor-pointer"
                              } ${
                                isActive
                                  ? "border-2 border-blue-500"
                                  : isCurrent
                                    ? "border border-blue-300"
                                    : "border border-slate-200 hover:border-slate-300"
                              }`}
                              style={
                                isEmpty
                                  ? { backgroundColor: "#f8fafc" }
                                  : {
                                      backgroundImage:
                                        "linear-gradient(45deg,#e8edf2 25%,transparent 25%),linear-gradient(-45deg,#e8edf2 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e8edf2 75%),linear-gradient(-45deg,transparent 75%,#e8edf2 75%)",
                                      backgroundSize: "8px 8px",
                                      backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
                                      backgroundColor: "#fff",
                                    }
                              }
                            >
                              {isEmpty ? (
                                <span className="text-[10px] font-bold text-slate-400 leading-none">None</span>
                              ) : source ? (
                                <TrimmedThumb src={source} alreadySquare={Boolean(opt.swatchImageUrl)} />
                              ) : layer.layerType === "TEXT" ? (
                                <TypeIcon className="w-5 h-5 text-slate-400" />
                              ) : (
                                <ImageIcon className="w-5 h-5 text-slate-300" />
                              )}
                            </button>
                            {!isSolo && field && (
                              <button
                                type="button"
                                title={`Rename ${tooltip}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingId(null);
                                  setEditingOptId(opt.id);
                                  setEditingName(opt.label || (isEmpty ? "None" : ""));
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="absolute -bottom-1 -right-1 hidden group-hover/thumb:flex w-4 h-4 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 cursor-pointer shadow-sm"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                            )}
                            {isEditingOpt && field && (
                              <input
                                ref={optRenameRef}
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={() => commitOptionRename(field.id, opt.id)}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === "Enter") commitOptionRename(field.id, opt.id);
                                  if (e.key === "Escape") setEditingOptId(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute left-0 top-full mt-1 z-30 h-6 w-28 px-1.5 rounded border border-blue-400 text-[11px] font-semibold text-slate-800 bg-white shadow-md focus:outline-none"
                              />
                            )}
                            {!isSolo && field && options.length > 1 && (
                              <button
                                type="button"
                                title="Remove variant"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteVariant(field.id, opt.id);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="absolute -top-1 -left-1 hidden group-hover/thumb:flex w-4 h-4 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-300 cursor-pointer shadow-sm"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            )}
                            {isHiddenField && field && onUpdateOption && !isEmpty && (
                              <button
                                type="button"
                                title="Show this option when another group is selected"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const existing = (opt.showWhen || [])[0];
                                  const fallback =
                                    apartments.find((a) => a.field && a.field.id !== field.id)?.field?.id || "";
                                  setDriveSourceId(existing?.sourceGroupId || fallback);
                                  setDriveOptId((id) => (id === opt.id ? null : opt.id));
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className={`absolute -bottom-1 -left-1 w-4 h-4 flex items-center justify-center rounded-full border cursor-pointer shadow-sm ${
                                  (opt.showWhen || []).length
                                    ? "bg-amber-50 border-amber-300 text-amber-700"
                                    : "bg-white border-slate-200 text-slate-500 hover:text-amber-700 hover:border-amber-300"
                                }`}
                              >
                                <GitBranch className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {isHiddenField && field && onUpdateOption && driveOptId && options.some((o) => o.id === driveOptId) && (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2 space-y-2">
                        {(() => {
                          const driveOpt = options.find((o) => o.id === driveOptId);
                          if (!driveOpt) return null;
                          const srcGroups = apartments.filter((a) => a.field && a.field.id !== field.id);
                          const src =
                            srcGroups.find((a) => a.field?.id === driveSourceId) || srcGroups[0];
                          const srcOpts = (src?.options || []).filter((o) => !isEmptyOption(o));
                          const selected = clauseValues((driveOpt.showWhen || [])[0] || {
                            sourceGroupId: "",
                            operator: "EQUALS",
                            targetValue: "",
                          });
                          return (
                            <>
                              <p className="text-[10px] font-bold text-amber-900 flex items-center gap-1">
                                Show “{driveOpt.label || "option"}” when
                                <FeatureTip compact title={CLIP_ART_TIPS.drivenOption.title}>
                                  {CLIP_ART_TIPS.drivenOption.body}
                                </FeatureTip>
                              </p>
                              <select
                                value={src?.field?.id || ""}
                                onChange={(e) => setDriveSourceId(e.target.value)}
                                className="w-full h-7 px-2 rounded-md border border-amber-200 bg-white text-[11px] font-semibold text-slate-800"
                              >
                                {srcGroups.map((a) => (
                                  <option key={a.field!.id} value={a.field!.id}>
                                    {a.layer.name}
                                  </option>
                                ))}
                              </select>
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {srcOpts.map((srcOpt) => {
                                  const val = srcOpt.id;
                                  const checked = selected.includes(val);
                                  return (
                                    <label
                                      key={srcOpt.id}
                                      title={srcOpt.label || srcOpt.value || "Option"}
                                      className={`inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded border text-[10px] font-semibold cursor-pointer ${
                                        checked
                                          ? "bg-amber-100 border-amber-400 text-amber-950"
                                          : "bg-white border-slate-200 text-slate-600"
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const sourceGroupId = src?.field?.id || "";
                                          const nextVals = checked
                                            ? selected.filter((v) => v !== val)
                                            : [...selected, val];
                                          onUpdateOption(field.id, driveOpt.id, {
                                            showWhen:
                                              nextVals.length && sourceGroupId
                                                ? [
                                                    {
                                                      sourceGroupId,
                                                      operator: "EQUALS",
                                                      targetValue: nextVals[0],
                                                      targetValues: nextVals,
                                                    },
                                                  ]
                                                : [],
                                          });
                                        }}
                                        className="w-3 h-3 accent-amber-600"
                                      />
                                      <span className="w-5 h-5 rounded overflow-hidden bg-white border border-slate-200 shrink-0">
                                        <TrimmedThumb
                                          src={srcOpt.swatchImageUrl || srcOpt.assetImageUrl || ""}
                                        />
                                      </span>
                                      {srcOpt.label || srcOpt.value || "Option"}
                                    </label>
                                  );
                                })}
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const sourceGroupId = src?.field?.id;
                                    if (!field || !sourceGroupId) return;
                                    const srcList = srcOpts;
                                    let i = 0;
                                    options.forEach((opt) => {
                                      if (isEmptyOption(opt)) return;
                                      const mapped = srcList[i++];
                                      onUpdateOption(field.id, opt.id, {
                                        showWhen: mapped
                                          ? [
                                              {
                                                sourceGroupId,
                                                operator: "EQUALS",
                                                targetValue: mapped.id,
                                                targetValues: [mapped.id],
                                              },
                                            ]
                                          : [],
                                      });
                                    });
                                  }}
                                  className="text-[10px] font-bold text-amber-800 hover:text-amber-950 cursor-pointer flex items-center gap-1"
                                >
                                  <Link2 className="w-3 h-3" /> Match all by order
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDriveOptId(null)}
                                  className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                                >
                                  Done
                                </button>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onAddVariants(layer.id)}
                        className="h-8 px-3 rounded-md border border-slate-300 bg-white text-[12px] font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add more
                      </button>
                      {field && !hasEmpty && (
                        <button
                          type="button"
                          title="Add an empty option that hides this layer"
                          onClick={() => onAddEmptyOption(layer.id)}
                          className="h-8 px-3 rounded-md border border-slate-300 bg-white text-[12px] font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600 cursor-pointer"
                        >
                          Add empty
                        </button>
                      )}
                      <div
                        ref={(el) => {
                          footerMenuAnchors.current[layer.id] = el;
                        }}
                      >
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
                      </div>
                    </div>
                    </>
                    )}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      {apartments.map(({ layer, field, options }) => {
        const hasEmpty = options.some((o) => isEmptyOption(o));
        const activeOptId = field?.activeOptionId || options[0]?.id;
        const isHiddenField = Boolean(field?.hiddenFromCustomer || field?.allowPersonalized === false);
        const isSandwichFront = layer.properties?.sandwichRole === "front";
        const hasSandwichFront = apartments.some(
          (a) => a.layer.properties?.sandwichSourceLayerId === layer.id
        );
        return (
          <span key={`menus-${layer.id}`}>
            <AnchoredMenu
              open={menuId === layer.id}
              anchor={headerMenuAnchors.current[layer.id]}
              align="right"
              placement="down"
            >
              {isSandwichFront ? (
                <MenuItem
                  label="Remove sandwich front"
                  tip={CLIP_ART_TIPS.removeSandwichFront}
                  onClick={() => {
                    onDelete(layer.id);
                    setMenuId(null);
                  }}
                />
              ) : (
                <>
              {onAddSandwichFront && !hasSandwichFront && (
                <MenuItem
                  label="Add sandwich front"
                  tip={CLIP_ART_TIPS.sandwichFront}
                  onClick={() => {
                    onAddSandwichFront(layer.id);
                    setMenuId(null);
                  }}
                />
              )}
              {field && (
                <MenuItem
                  label={isHiddenField ? "Show as customer field" : "Set as hidden field"}
                  tip={CLIP_ART_TIPS.hiddenField}
                  onClick={() => {
                    onToggleHiddenField?.(field.id, !isHiddenField);
                    setMenuId(null);
                  }}
                />
              )}
              {field && !isSandwichFront && (
                <MenuItem
                  label={
                    field.config?.freeTransform ? "Lock size & position" : "Free size & position"
                  }
                  tip={CLIP_ART_TIPS.freeSize}
                  onClick={() => {
                    onToggleFreeTransform?.(field.id, !field.config?.freeTransform);
                    setMenuId(null);
                  }}
                />
              )}
              {field && (
                <MenuItem
                  label="Bulk rename options"
                  tip={CLIP_ART_TIPS.bulkRename}
                  onClick={() => openBulkRename(field.id, layer.name, options.filter((o) => !isEmptyOption(o)).length)}
                />
              )}
              {field && (
                <MenuItem
                  label="Regenerate thumbnails"
                  tip={CLIP_ART_TIPS.regenerateThumbs}
                  onClick={() => {
                    onRegenerateThumbs(field.id);
                    setMenuId(null);
                  }}
                />
              )}
              {field && !hasEmpty && (
                <MenuItem
                  label="Add empty (None)"
                  tip={CLIP_ART_TIPS.addEmpty}
                  onClick={() => {
                    onAddEmptyOption(layer.id);
                    setMenuId(null);
                  }}
                />
              )}
              <MenuItem
                label="Add variants"
                tip={CLIP_ART_TIPS.addVariants}
                onClick={() => {
                  onAddVariants(layer.id);
                  setMenuId(null);
                }}
              />
              <MenuItem
                label="Duplicate group"
                tip={CLIP_ART_TIPS.duplicateGroup}
                onClick={() => {
                  onDuplicate(layer.id);
                  setMenuId(null);
                }}
              />
                </>
              )}
            </AnchoredMenu>
            {field && (
              <AnchoredMenu
                open={footerMenuId === layer.id}
                anchor={footerMenuAnchors.current[layer.id]}
                align="left"
                placement="up"
              >
                <MenuItem
                  label="Bulk rename options"
                  tip={CLIP_ART_TIPS.bulkRename}
                  onClick={() => openBulkRename(field.id, layer.name, options.filter((o) => !isEmptyOption(o)).length)}
                />
                <MenuItem
                  label="Regenerate thumbnails"
                  tip={CLIP_ART_TIPS.regenerateThumbs}
                  onClick={() => {
                    onRegenerateThumbs(field.id);
                    setFooterMenuId(null);
                  }}
                />
                {!hasEmpty && (
                  <MenuItem
                    label="Add empty (None)"
                    tip={CLIP_ART_TIPS.addEmpty}
                    onClick={() => {
                      onAddEmptyOption(layer.id);
                      setFooterMenuId(null);
                    }}
                  />
                )}
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
                  tip={CLIP_ART_TIPS.addVariants}
                  onClick={() => {
                    onAddVariants(layer.id);
                    setFooterMenuId(null);
                  }}
                />
              </AnchoredMenu>
            )}
          </span>
        );
      })}

      {bulkTarget?.field && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">Bulk rename options</h3>
              <p className="text-[12px] text-slate-500 mt-0.5">
                {bulkTarget.layer.name} · {bulkTarget.options.length} options
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBulkMode("smart")}
                className={`flex-1 h-8 rounded-md text-[12px] font-semibold border cursor-pointer ${
                  bulkMode === "smart"
                    ? "bg-blue-50 border-blue-400 text-blue-700"
                    : "bg-white border-slate-200 text-slate-600"
                }`}
              >
                Smart
              </button>
              <button
                type="button"
                onClick={() => setBulkMode("sequential")}
                className={`flex-1 h-8 rounded-md text-[12px] font-semibold border cursor-pointer ${
                  bulkMode === "sequential"
                    ? "bg-blue-50 border-blue-400 text-blue-700"
                    : "bg-white border-slate-200 text-slate-600"
                }`}
              >
                Sequential
              </button>
            </div>

            {bulkMode === "smart" ? (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Drops tokens shared by every file and the group name, then keeps the distinctive part
                (color, number, pose). Example: <span className="font-semibold text-slate-700">Shirt Red</span>,{" "}
                <span className="font-semibold text-slate-700">Shirt Blue</span>.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <label className="col-span-1 text-[11px] font-semibold text-slate-600">
                  Prefix
                  <input
                    value={seqPrefix}
                    onChange={(e) => setSeqPrefix(e.target.value)}
                    className="mt-1 h-8 w-full px-2 rounded-md border border-slate-200 text-[12px] font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </label>
                <label className="text-[11px] font-semibold text-slate-600">
                  Start
                  <input
                    type="number"
                    value={seqStart}
                    onChange={(e) => setSeqStart(Number(e.target.value) || 1)}
                    className="mt-1 h-8 w-full px-2 rounded-md border border-slate-200 text-[12px] font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </label>
                <label className="text-[11px] font-semibold text-slate-600">
                  Pad
                  <input
                    type="number"
                    min={0}
                    max={4}
                    value={seqPad}
                    onChange={(e) => setSeqPad(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1 h-8 w-full px-2 rounded-md border border-slate-200 text-[12px] font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </label>
              </div>
            )}

            <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {bulkPreview.map((row) => (
                <div key={row.id} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                  <span className="flex-1 min-w-0 truncate text-slate-400">{row.from || "Untitled"}</span>
                  <span className="text-slate-300">→</span>
                  <span className="flex-1 min-w-0 truncate font-semibold text-slate-800">{row.to}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkFieldId(null)}
                className="h-8 px-3 rounded-md border border-slate-200 text-[12px] font-semibold text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyBulkRename}
                className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnchoredMenu({
  open,
  anchor,
  align,
  placement,
  children,
}: {
  open: boolean;
  anchor: HTMLElement | null | undefined;
  align: "left" | "right";
  placement: "up" | "down";
  children: ReactNode;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setRect(null);
      return;
    }
    const update = () => setRect(anchor.getBoundingClientRect());
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchor]);

  if (!open || !rect || typeof document === "undefined") return null;

  const width = 228;
  const left = align === "right" ? Math.max(8, rect.right - width) : rect.left;
  const style: React.CSSProperties =
    placement === "up"
      ? { position: "fixed", zIndex: 80, width, left, top: rect.top - 6, transform: "translateY(-100%)" }
      : { position: "fixed", zIndex: 80, width, left, top: rect.bottom + 6 };

  return createPortal(
    <div
      className="rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-[12px]"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
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

function MenuItem({
  label,
  onClick,
  tip,
}: {
  label: string;
  onClick: () => void;
  tip?: { title: string; body: string };
}) {
  return (
    <div className="flex items-stretch">
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 cursor-pointer"
      >
        {label}
      </button>
      {tip && (
        <div className="flex items-center pr-1.5">
          <FeatureTip title={tip.title}>{tip.body}</FeatureTip>
        </div>
      )}
    </div>
  );
}
