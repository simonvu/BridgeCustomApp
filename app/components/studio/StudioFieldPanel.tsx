import React, { useMemo, useState } from "react";
import {
  Type,
  Calendar,
  Radio,
  ListFilter,
  Upload,
  Sparkles,
  Plus,
  Trash2,
  Sliders,
  X,
  Image as ImageIcon,
  Eye,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Images,
  LayoutGrid,
} from "lucide-react";
import {
  type StudioFieldItem,
  type StudioFieldOptionChoice,
  type StudioFieldType,
  defaultDisplayType,
  getMaxCharacters,
  getMinCharacters,
  isOptionFieldType,
  normalizeDisplayType,
} from "../../utils/fieldHelpers";

export type { StudioFieldItem, StudioFieldOptionChoice, StudioFieldType };

interface StudioFieldPanelProps {
  fields: StudioFieldItem[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string | null) => void;
  onAddField: (fieldType: StudioFieldType) => void;
  onUpdateField: (fieldId: string, updatedProps: Partial<StudioFieldItem>) => void;
  onDeleteField: (fieldId: string) => void;
  onReorderFields?: (reordered: StudioFieldItem[]) => void;
  onOpenMediaPickerForOption?: (fieldId: string, optionIndex: number, targetType: "SWATCH" | "ASSET") => void;
  onOpenMediaPickerForBatchOptions?: (fieldId: string) => void;
  onPreviewOptionChoice?: (fieldId: string, option: StudioFieldOptionChoice) => void;
}

const FIELD_TYPES: Array<{ type: StudioFieldType; label: string; desc: string; icon: typeof Type }> = [
  { type: "TEXT", label: "Text Field", desc: "Customer enters a name or custom line", icon: Type },
  { type: "CALENDAR", label: "Calendar Date", desc: "Date picker for birthdays & anniversaries", icon: Calendar },
  { type: "RADIO", label: "Radio / Swatches", desc: "Choice with image, position, and layout", icon: Radio },
  { type: "SELECT", label: "List / Item", desc: "Dropdown or button list of items", icon: ListFilter },
  { type: "IMAGE_UPLOAD", label: "Customer Photo", desc: "Customer uploads a photo or logo", icon: Upload },
  { type: "FIELD_ASSET", label: "Clipart Asset", desc: "Pick a graphic from the asset library", icon: Sparkles },
];

function fieldTypeIcon(type: string) {
  switch (type) {
    case "TEXT":
      return <Type className="w-4 h-4 text-indigo-600 shrink-0" />;
    case "CALENDAR":
      return <Calendar className="w-4 h-4 text-rose-600 shrink-0" />;
    case "RADIO":
      return <Radio className="w-4 h-4 text-amber-600 shrink-0" />;
    case "SELECT":
      return <ListFilter className="w-4 h-4 text-blue-600 shrink-0" />;
    case "IMAGE_UPLOAD":
      return <Upload className="w-4 h-4 text-purple-600 shrink-0" />;
    case "FIELD_ASSET":
      return <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />;
    default:
      return <Sliders className="w-4 h-4 text-slate-500 shrink-0" />;
  }
}

function fieldTypeLabel(type: string) {
  return FIELD_TYPES.find((item) => item.type === type)?.label || type;
}

function patchConfig(field: StudioFieldItem, patch: Record<string, unknown>): Partial<StudioFieldItem> {
  return { config: { ...(field.config || {}), ...patch } };
}

function patchOption(
  field: StudioFieldItem,
  optIdx: number,
  patch: Partial<StudioFieldOptionChoice>
): Partial<StudioFieldItem> {
  const options: StudioFieldOptionChoice[] = [...(field.config?.options || [])];
  options[optIdx] = { ...options[optIdx], ...patch };
  return { config: { ...(field.config || {}), options } };
}

export default function StudioFieldPanel({
  fields,
  selectedFieldId,
  onSelectField,
  onAddField,
  onUpdateField,
  onDeleteField,
  onReorderFields,
  onOpenMediaPickerForOption,
  onOpenMediaPickerForBatchOptions,
  onPreviewOptionChoice,
}: StudioFieldPanelProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedOptKey, setExpandedOptKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [fields]
  );

  const moveOption = (field: StudioFieldItem, from: number, to: number) => {
    const options: StudioFieldOptionChoice[] = [...(field.config?.options || [])];
    if (to < 0 || to >= options.length) return;
    const [moved] = options.splice(from, 1);
    options.splice(to, 0, moved);
    onUpdateField(field.id, { config: { ...(field.config || {}), options } });
  };

  return (
    <div className="flex flex-col h-full bg-white w-full min-w-0 select-none">
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
        <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2 uppercase tracking-wider">
          <Sliders className="w-4 h-4 text-blue-600" />
          Custom Fields ({fields.length})
        </h3>
        <button
          type="button"
          onClick={() => setShowAddModal((open) => !open)}
          className="flex items-center gap-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add Field
        </button>
      </div>

      {showAddModal && (
        <div className="p-3 bg-blue-50/80 border-b border-blue-200 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-blue-900">Select field type</span>
            <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {FIELD_TYPES.map((item) => {
              const IconComp = item.icon;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => {
                    onAddField(item.type);
                    setShowAddModal(false);
                  }}
                  className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-blue-200 hover:border-blue-500 hover:bg-blue-50 transition text-left cursor-pointer shadow-2xs"
                >
                  <IconComp className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">{item.label}</p>
                    <p className="text-[10px] text-slate-500">{item.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {sortedFields.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <Sliders className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">No fields yet</p>
            <p className="text-[11px] text-slate-400">Add a field — a linked canvas layer is created automatically</p>
          </div>
        ) : (
          sortedFields.map((field, fieldIdx) => {
            const isSelected = field.id === selectedFieldId;
            const config = field.config || {};
            const options: StudioFieldOptionChoice[] = config.options || [];
            const viewType = normalizeDisplayType(field.displayType || defaultDisplayType(field.fieldType));

            return (
              <div
                key={field.id}
                draggable={Boolean(onReorderFields)}
                onDragStart={() => setDraggedIdx(fieldIdx)}
                onDragOver={(e) => {
                  if (!onReorderFields || draggedIdx === null) return;
                  e.preventDefault();
                }}
                onDrop={() => {
                  if (!onReorderFields || draggedIdx === null || draggedIdx === fieldIdx) {
                    setDraggedIdx(null);
                    return;
                  }
                  const next = [...sortedFields];
                  const [moved] = next.splice(draggedIdx, 1);
                  next.splice(fieldIdx, 0, moved);
                  onReorderFields(next.map((f, i) => ({ ...f, sortOrder: i })));
                  setDraggedIdx(null);
                }}
                onDragEnd={() => setDraggedIdx(null)}
                onClick={() => onSelectField(field.id)}
                className={`p-3 rounded-xl border transition cursor-pointer space-y-2.5 ${
                  isSelected ? "bg-blue-50/60 border-blue-400 shadow-xs" : "bg-white border-slate-200 hover:border-slate-300"
                } ${draggedIdx === fieldIdx ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {onReorderFields && (
                      <span title="Drag to reorder storefront fields">
                        <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      </span>
                    )}
                    {fieldTypeIcon(field.fieldType)}
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => onUpdateField(field.id, { label: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none truncate w-full px-0.5"
                    />
                  </div>
                  {confirmDeleteId === field.id ? (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteField(field.id);
                          setConfirmDeleteId(null);
                        }}
                        className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(field.id);
                      }}
                      className="text-slate-400 hover:text-red-600 p-1 transition shrink-0 cursor-pointer"
                      title="Delete field"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-medium border border-slate-200">
                    {fieldTypeLabel(field.fieldType)}
                  </span>
                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={field.isRequired !== false}
                        onChange={(e) => onUpdateField(field.id, { isRequired: e.target.checked })}
                        className="rounded text-blue-600 text-xs"
                      />
                      <span>Required</span>
                    </label>
                    <label className="flex items-center gap-1 text-[11px] cursor-pointer" title="Show this field on the storefront form">
                      <input
                        type="checkbox"
                        checked={field.allowPersonalized !== false}
                        onChange={(e) => onUpdateField(field.id, { allowPersonalized: e.target.checked })}
                        className="rounded text-emerald-600 text-xs"
                      />
                      <span className="font-semibold text-slate-700">Storefront</span>
                    </label>
                  </div>
                </div>

                {!isSelected ? (
                  isOptionFieldType(field.fieldType) ? (
                    <p className="text-[10px] text-slate-400">{options.length} option{options.length === 1 ? "" : "s"}</p>
                  ) : null
                ) : (
                  <>
                    {isOptionFieldType(field.fieldType) && (
                      <div onClick={(e) => e.stopPropagation()} className="space-y-1.5 pt-1">
                        <label className="block text-[11px] font-bold text-slate-700">Storefront layout</label>
                        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-[10px]">
                          {(
                            [
                              { id: "DROPDOWN" as const, label: "Dropdown", icon: ListFilter },
                              { id: "RADIO" as const, label: "Radio", icon: Radio },
                              { id: "THUMBNAIL" as const, label: "Thumbnail", icon: LayoutGrid },
                            ]
                          ).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => onUpdateField(field.id, { displayType: item.id })}
                              className={`py-1 rounded font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                                viewType === item.id ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              <item.icon className="w-3 h-3" />
                              <span>{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {field.fieldType === "TEXT" && (
                      <div onClick={(e) => e.stopPropagation()} className="pt-2 border-t border-slate-200/60 space-y-2 text-xs">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Placeholder</label>
                          <input
                            type="text"
                            value={config.placeholder || ""}
                            onChange={(e) => onUpdateField(field.id, patchConfig(field, { placeholder: e.target.value }))}
                            placeholder={`Enter ${field.label}...`}
                            className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Default text (canvas preview)</label>
                          <input
                            type="text"
                            value={config.defaultText || ""}
                            onChange={(e) => onUpdateField(field.id, patchConfig(field, { defaultText: e.target.value }))}
                            className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Min chars</label>
                            <input
                              type="number"
                              min={0}
                              max={500}
                              value={getMinCharacters(config)}
                              onChange={(e) =>
                                onUpdateField(field.id, patchConfig(field, { minCharacters: Number(e.target.value) }))
                              }
                              className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Max chars</label>
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={getMaxCharacters(config)}
                              onChange={(e) =>
                                onUpdateField(field.id, {
                                  config: {
                                    ...config,
                                    maxCharacters: Number(e.target.value),
                                    maxLength: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs font-mono"
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.disallowSpecialChars === true}
                            onChange={(e) =>
                              onUpdateField(field.id, patchConfig(field, { disallowSpecialChars: e.target.checked }))
                            }
                            className="rounded text-amber-600 text-xs"
                          />
                          <span>Disallow special characters</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.allowMultiline === true}
                            onChange={(e) =>
                              onUpdateField(field.id, {
                                config: {
                                  ...config,
                                  allowMultiline: e.target.checked,
                                  maxLines: config.maxLines || 2,
                                },
                              })
                            }
                            className="rounded text-indigo-600 text-xs"
                          />
                          <span>Allow multi-line wrap</span>
                        </label>
                        {config.allowMultiline && (
                          <div className="flex items-center gap-2 pl-5">
                            <label className="text-[10px] font-semibold text-slate-600 shrink-0">Max lines</label>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={config.maxLines !== undefined ? config.maxLines : 2}
                              onChange={(e) => onUpdateField(field.id, patchConfig(field, { maxLines: Number(e.target.value) }))}
                              className="w-14 border border-slate-300 rounded px-1.5 py-0.5 bg-white text-xs font-mono font-bold"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {field.fieldType === "CALENDAR" && (
                      <div onClick={(e) => e.stopPropagation()} className="pt-2 border-t border-slate-200/60 space-y-2 text-xs">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Date format on canvas</label>
                          <select
                            value={config.dateFormat || "MM/DD/YYYY"}
                            onChange={(e) => onUpdateField(field.id, patchConfig(field, { dateFormat: e.target.value }))}
                            className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs font-medium cursor-pointer"
                          >
                            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                            <option value="MONTH_D_YYYY">January 15, 2026</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Min date</label>
                            <input
                              type="date"
                              value={config.minDate || ""}
                              onChange={(e) => onUpdateField(field.id, patchConfig(field, { minDate: e.target.value }))}
                              className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Max date</label>
                            <input
                              type="date"
                              value={config.maxDate || ""}
                              onChange={(e) => onUpdateField(field.id, patchConfig(field, { maxDate: e.target.value }))}
                              className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs"
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.defaultToToday === true}
                            onChange={(e) => onUpdateField(field.id, patchConfig(field, { defaultToToday: e.target.checked }))}
                            className="rounded text-rose-600 text-xs"
                          />
                          <span>Default to today</span>
                        </label>
                      </div>
                    )}

                    {field.fieldType === "IMAGE_UPLOAD" && (
                      <div onClick={(e) => e.stopPropagation()} className="pt-2 border-t border-slate-200/60 space-y-2 text-xs">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Help text</label>
                          <input
                            type="text"
                            value={config.helpText || ""}
                            onChange={(e) => onUpdateField(field.id, patchConfig(field, { helpText: e.target.value }))}
                            placeholder="High resolution JPG or PNG recommended"
                            className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Max file size (MB)</label>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={config.maxFileSizeMb !== undefined ? config.maxFileSizeMb : 10}
                            onChange={(e) => onUpdateField(field.id, patchConfig(field, { maxFileSizeMb: Number(e.target.value) }))}
                            className="w-24 border border-slate-300 rounded px-2 py-1 bg-white text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {isOptionFieldType(field.fieldType) && (
                      <div onClick={(e) => e.stopPropagation()} className="pt-2 border-t border-blue-200/60 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-slate-700 text-[11px]">Options ({options.length})</span>
                          <div className="flex items-center gap-1">
                            {onOpenMediaPickerForBatchOptions && (
                              <button
                                type="button"
                                onClick={() => onOpenMediaPickerForBatchOptions(field.id)}
                                className="text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded flex items-center gap-0.5 cursor-pointer"
                                title="Add many options from Media Library"
                              >
                                <Images className="w-3 h-3" /> Batch
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const newOpt: StudioFieldOptionChoice = {
                                  id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                  label: `Option ${options.length + 1}`,
                                  value: `option_${Date.now().toString(36)}`,
                                  swatchImageUrl: "",
                                  assetImageUrl: "",
                                  hasCustomPosition: false,
                                  posX: options[0]?.posX ?? 300,
                                  posY: options[0]?.posY ?? 200,
                                  width: options[0]?.width ?? 300,
                                  height: options[0]?.height ?? 300,
                                  rotation: options[0]?.rotation ?? 0,
                                };
                                onUpdateField(field.id, {
                                  config: { ...config, options: [...options, newOpt] },
                                  activeOptionId: newOpt.id,
                                });
                              }}
                              className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" /> Add
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {options.map((opt, optIdx) => {
                            const optKey = `${field.id}:${opt.id || optIdx}`;
                            const isExpanded = expandedOptKey === optKey;
                            const isPreviewing = field.activeOptionId === opt.id;

                            return (
                              <div
                                key={opt.id || optIdx}
                                className={`p-2 rounded-lg border transition space-y-2 ${
                                  isPreviewing ? "bg-amber-50/80 border-amber-400 shadow-2xs" : "bg-white border-slate-200"
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <div className="flex flex-col shrink-0">
                                    <button
                                      type="button"
                                      disabled={optIdx === 0}
                                      onClick={() => moveOption(field, optIdx, optIdx - 1)}
                                      className="p-0 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                    >
                                      <ChevronUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={optIdx === options.length - 1}
                                      onClick={() => moveOption(field, optIdx, optIdx + 1)}
                                      className="p-0 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                    >
                                      <ChevronDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div
                                    onClick={() => onOpenMediaPickerForOption?.(field.id, optIdx, "SWATCH")}
                                    className="w-8 h-8 rounded border border-slate-300 bg-slate-50 flex items-center justify-center shrink-0 hover:bg-slate-100 transition cursor-pointer overflow-hidden"
                                    title="Set swatch icon"
                                  >
                                    {opt.swatchImageUrl ? (
                                      <img src={opt.swatchImageUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                                    )}
                                  </div>
                                  <input
                                    type="text"
                                    value={opt.label}
                                    onChange={(e) =>
                                      onUpdateField(field.id, patchOption(field, optIdx, { label: e.target.value }))
                                    }
                                    placeholder="Option label"
                                    className="flex-1 text-xs font-bold px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onUpdateField(field.id, { activeOptionId: opt.id });
                                      onPreviewOptionChoice?.(field.id, opt);
                                    }}
                                    className={`p-1 rounded transition cursor-pointer ${
                                      isPreviewing ? "bg-amber-500 text-white" : "text-slate-400 hover:text-slate-700"
                                    }`}
                                    title="Preview on canvas"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedOptKey(isExpanded ? null : optKey)}
                                    className="p-1 text-slate-400 hover:text-blue-600 rounded transition cursor-pointer"
                                    title="Position & image"
                                  >
                                    <ChevronDown className={`w-3.5 h-3.5 transition ${isExpanded ? "rotate-180" : ""}`} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updatedOpts = options.filter((_, i) => i !== optIdx);
                                      onUpdateField(field.id, { config: { ...config, options: updatedOpts } });
                                    }}
                                    className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>

                                {isExpanded && (
                                  <div className="space-y-2">
                                    <div className="bg-slate-50 p-1.5 rounded border border-slate-200 flex items-center justify-between text-[11px]">
                                      <span className="text-slate-600 font-medium truncate">Canvas image</span>
                                      {opt.assetImageUrl ? (
                                        <div className="flex items-center gap-1.5">
                                          <img src={opt.assetImageUrl} alt="" className="w-6 h-6 object-cover rounded border" />
                                          <button
                                            type="button"
                                            onClick={() => onOpenMediaPickerForOption?.(field.id, optIdx, "ASSET")}
                                            className="text-blue-600 hover:underline font-bold text-[10px] cursor-pointer"
                                          >
                                            Change
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => onOpenMediaPickerForOption?.(field.id, optIdx, "ASSET")}
                                          className="text-emerald-700 font-bold bg-white px-2 py-0.5 border border-emerald-300 rounded text-[10px] hover:bg-emerald-50 transition cursor-pointer flex items-center gap-1"
                                        >
                                          <Sparkles className="w-3 h-3 text-emerald-600" /> Select image
                                        </button>
                                      )}
                                    </div>
                                    <label className="flex items-center gap-1.5 font-bold text-slate-800 cursor-pointer text-[11px]">
                                      <input
                                        type="checkbox"
                                        checked={opt.hasCustomPosition || false}
                                        onChange={(e) =>
                                          onUpdateField(field.id, patchOption(field, optIdx, { hasCustomPosition: e.target.checked }))
                                        }
                                        className="rounded text-blue-600"
                                      />
                                      <span>Custom position & size for this option</span>
                                    </label>
                                    {opt.hasCustomPosition && (
                                      <div className="grid grid-cols-2 gap-1.5">
                                        {[
                                          ["posX", "X", opt.posX ?? 300],
                                          ["posY", "Y", opt.posY ?? 200],
                                          ["width", "W", opt.width ?? 300],
                                          ["height", "H", opt.height ?? 300],
                                        ].map(([key, label, value]) => (
                                          <div key={String(key)}>
                                            <label className="text-[10px] text-slate-500 font-mono">{label} (px)</label>
                                            <input
                                              type="number"
                                              value={Number(value)}
                                              onChange={(e) =>
                                                onUpdateField(
                                                  field.id,
                                                  patchOption(field, optIdx, { [key]: Number(e.target.value) } as any)
                                                )
                                              }
                                              className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
