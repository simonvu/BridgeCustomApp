import React, { useState } from "react";
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
  Maximize2,
  LayoutGrid,
} from "lucide-react";

export interface StudioFieldOptionChoice {
  id: string;
  label: string;
  value: string;
  swatchImageUrl?: string; // Icon image for customer button/swatch
  assetImageUrl?: string;  // Main graphic image displayed on Canvas
  hasCustomPosition?: boolean;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  rotation?: number;
}

export interface StudioFieldItem {
  id: string;
  label: string;
  fieldType: "TEXT" | "CALENDAR" | "RADIO" | "SELECT" | "IMAGE_UPLOAD" | "FIELD_ASSET";
  displayType?: "IMAGE_SWATCH" | "TEXT_BUTTON" | "DROPDOWN"; // View mode on storefront/editor
  sortOrder: number;
  isRequired: boolean;
  activeOptionId?: string; // Currently previewed option choice
  config?: any; // { options: StudioFieldOptionChoice[], maxLength, defaultText... }
}

interface StudioFieldPanelProps {
  fields: StudioFieldItem[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string | null) => void;
  onAddField: (fieldType: StudioFieldItem["fieldType"]) => void;
  onUpdateField: (fieldId: string, updatedProps: Partial<StudioFieldItem>) => void;
  onDeleteField: (fieldId: string) => void;
  onOpenMediaPickerForOption?: (fieldId: string, optionIndex: number, targetType: "SWATCH" | "ASSET") => void;
  onPreviewOptionChoice?: (fieldId: string, option: StudioFieldOptionChoice) => void;
}

export default function StudioFieldPanel({
  fields,
  selectedFieldId,
  onSelectField,
  onAddField,
  onUpdateField,
  onDeleteField,
  onOpenMediaPickerForOption,
  onPreviewOptionChoice,
}: StudioFieldPanelProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedOptIndex, setExpandedOptIndex] = useState<number | null>(null);

  const getFieldTypeIcon = (type: string) => {
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
  };

  const getFieldTypeLabel = (type: string) => {
    switch (type) {
      case "TEXT":
        return "Text Field";
      case "CALENDAR":
        return "Calendar Date";
      case "RADIO":
        return "Radio / Swatches";
      case "SELECT":
        return "Dropdown Select";
      case "IMAGE_UPLOAD":
        return "Photo Upload";
      case "FIELD_ASSET":
        return "Clipart Asset";
      default:
        return type;
    }
  };

  const fieldTypesList: Array<{ type: StudioFieldItem["fieldType"]; label: string; desc: string; icon: any }> = [
    { type: "TEXT", label: "Text Field", desc: "Customer enters custom text or name", icon: Type },
    { type: "CALENDAR", label: "Calendar Date", desc: "Date picker for anniversaries & birthdays", icon: Calendar },
    { type: "RADIO", label: "Radio / Swatches", desc: "Key option choice with image/position settings", icon: Radio },
    { type: "SELECT", label: "Dropdown Select", desc: "Select options from dropdown list", icon: ListFilter },
    { type: "IMAGE_UPLOAD", label: "Customer Photo Upload", desc: "Customer uploads photo/logo", icon: Upload },
    { type: "FIELD_ASSET", label: "Clipart Asset Field", desc: "Select graphics from R2 asset library", icon: Sparkles },
  ];

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-80 shrink-0 select-none">
      {/* Panel Header */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2 uppercase tracking-wider">
          <Sliders className="w-4 h-4 text-blue-600" />
          Custom Fields ({fields.length})
        </h3>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add Field
        </button>
      </div>

      {/* Inline Add Field Selection Drawer */}
      {showAddModal && (
        <div className="p-3 bg-blue-50/80 border-b border-blue-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-blue-900">Select Field Type to Add:</span>
            <button
              onClick={() => setShowAddModal(false)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {fieldTypesList.map((item) => {
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

      {/* Field List & Rich Options Editor */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {fields.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <Sliders className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">No fields added yet</p>
            <p className="text-[11px] text-slate-400">Click "+ Add Field" to create customization inputs</p>
          </div>
        ) : (
          fields.map((field) => {
            const isSelected = field.id === selectedFieldId;
            const config = field.config || {};
            const options: StudioFieldOptionChoice[] = config.options || [];

            return (
              <div
                key={field.id}
                onClick={() => onSelectField(field.id)}
                className={`p-3 rounded-xl border transition cursor-pointer space-y-2.5 ${
                  isSelected
                    ? "bg-blue-50/60 border-blue-400 shadow-xs"
                    : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {getFieldTypeIcon(field.fieldType)}
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => onUpdateField(field.id, { label: e.target.value })}
                      className="text-xs font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none truncate w-full px-0.5"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteField(field.id);
                    }}
                    className="text-slate-400 hover:text-red-600 p-1 transition shrink-0 cursor-pointer"
                    title="Delete Field"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-medium border border-slate-200">
                    {getFieldTypeLabel(field.fieldType)}
                  </span>
                  <div className="flex items-center gap-3">
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={field.isRequired}
                        onChange={(e) => onUpdateField(field.id, { isRequired: e.target.checked })}
                        className="rounded text-blue-600 text-xs"
                      />
                      <span>Required</span>
                    </label>

                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[11px] cursor-pointer"
                      title="Allow customer to personalize this field on storefront order"
                    >
                      <input
                        type="checkbox"
                        checked={field.allowPersonalized !== false}
                        onChange={(e) => onUpdateField(field.id, { allowPersonalized: e.target.checked })}
                        className="rounded text-emerald-600 text-xs"
                      />
                      <span className="font-semibold text-slate-700">Allow Personalized</span>
                    </label>
                  </div>
                </div>

                {/* OPTION VIEW TYPE SELECTOR (Dropdown / Text Button / Image Icon) */}
                {(field.fieldType === "RADIO" || field.fieldType === "SELECT" || field.fieldType === "FIELD_ASSET") && (
                  <div onClick={(e) => e.stopPropagation()} className="space-y-1.5 pt-1">
                    <label className="block text-[10px] font-semibold text-slate-600">Option View Type:</label>
                    <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-[10px]">
                      <button
                        type="button"
                        onClick={() => onUpdateField(field.id, { displayType: "IMAGE_SWATCH" })}
                        className={`py-1 rounded font-semibold transition cursor-pointer ${
                          !field.displayType || field.displayType === "IMAGE_SWATCH"
                            ? "bg-white text-blue-600 shadow-2xs font-bold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        🖼️ Image Icon
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateField(field.id, { displayType: "TEXT_BUTTON" })}
                        className={`py-1 rounded font-semibold transition cursor-pointer ${
                          field.displayType === "TEXT_BUTTON"
                            ? "bg-white text-blue-600 shadow-2xs font-bold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        🔘 Button
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateField(field.id, { displayType: "DROPDOWN" })}
                        className={`py-1 rounded font-semibold transition cursor-pointer ${
                          field.displayType === "DROPDOWN"
                            ? "bg-white text-blue-600 shadow-2xs font-bold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        🔽 Dropdown
                      </button>
                    </div>
                {/* TEXT Field Specific Config (Min/Max Chars, Disallow Special Characters) */}
                {field.fieldType === "TEXT" && (
                  <div onClick={(e) => e.stopPropagation()} className="pt-2 border-t border-slate-200/60 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Min Chars</label>
                        <input
                          type="number"
                          min={0}
                          max={500}
                          value={config.minCharacters !== undefined ? config.minCharacters : 3}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            onUpdateField(field.id, {
                              config: { ...config, minCharacters: val },
                            });
                          }}
                          className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Max Chars</label>
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={config.maxCharacters !== undefined ? config.maxCharacters : 50}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            onUpdateField(field.id, {
                              config: { ...config, maxCharacters: val },
                            });
                          }}
                          className="w-full border border-slate-300 rounded px-2 py-1 bg-white text-xs font-mono"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer pt-1" title="Prevent customer from typing special/invalid symbols">
                      <input
                        type="checkbox"
                        checked={config.disallowSpecialChars === true}
                        onChange={(e) => {
                          onUpdateField(field.id, {
                            config: { ...config, disallowSpecialChars: e.target.checked },
                          });
                        }}
                        className="rounded text-amber-600 text-xs"
                      />
                      <span className="text-amber-950 font-semibold">Disallow Special Characters</span>
                    </label>

                    <div className="space-y-1 pt-1">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer" title="Allow text to wrap onto multiple lines when typing">
                        <input
                          type="checkbox"
                          checked={config.allowMultiline === true}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            onUpdateField(field.id, {
                              config: {
                                ...config,
                                allowMultiline: isChecked,
                                maxLines: config.maxLines || 2,
                              },
                            });
                          }}
                          className="rounded text-indigo-600 text-xs"
                        />
                        <span className="text-indigo-950 font-semibold">Allow Multi-line Text (Auto Wrap)</span>
                      </label>

                      {config.allowMultiline && (
                        <div className="flex items-center gap-2 pt-1 pl-5">
                          <label className="text-[10px] font-semibold text-slate-600 shrink-0">Max Lines Limit:</label>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={config.maxLines !== undefined ? config.maxLines : 2}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              onUpdateField(field.id, {
                                config: { ...config, maxLines: val },
                              });
                            }}
                            className="w-14 border border-slate-300 rounded px-1.5 py-0.5 bg-white text-xs font-mono font-bold text-indigo-950"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sub-options List with Per-Option Image & Position Settings */}
                {(field.fieldType === "RADIO" || field.fieldType === "SELECT" || field.fieldType === "FIELD_ASSET") && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="pt-2 border-t border-blue-200/60 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 text-[11px]">Options List ({options.length})</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newOpt: StudioFieldOptionChoice = {
                            id: `opt_${Date.now()}`,
                            label: `Option ${options.length + 1}`,
                            value: `option_${options.length + 1}`,
                            swatchImageUrl: "",
                            assetImageUrl: "",
                            hasCustomPosition: false,
                            posX: 300,
                            posY: 200,
                            width: 300,
                            height: 300,
                            rotation: 0,
                          };
                          const newOpts = [...options, newOpt];
                          onUpdateField(field.id, { config: { ...config, options: newOpts } });
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add Option
                      </button>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {options.map((opt, optIdx) => {
                        const isExpanded = expandedOptIndex === optIdx;
                        const isPreviewing = field.activeOptionId === opt.id;

                        return (
                          <div
                            key={opt.id || optIdx}
                            className={`p-2 rounded-lg border transition space-y-2 ${
                              isPreviewing
                                ? "bg-amber-50/80 border-amber-400 shadow-2xs"
                                : "bg-white border-slate-200"
                            }`}
                          >
                            {/* Option Item Header Row */}
                            <div className="flex items-center gap-1.5">
                              {/* Swatch Thumbnail Preview */}
                              <div
                                onClick={() =>
                                  onOpenMediaPickerForOption && onOpenMediaPickerForOption(field.id, optIdx, "SWATCH")
                                }
                                className="w-8 h-8 rounded border border-slate-300 bg-slate-50 flex items-center justify-center shrink-0 hover:bg-slate-100 transition cursor-pointer overflow-hidden"
                                title="Click to set Swatch Icon Image"
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
                                onChange={(e) => {
                                  const updatedOpts = [...options];
                                  updatedOpts[optIdx] = {
                                    ...opt,
                                    label: e.target.value,
                                    value: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                                  };
                                  onUpdateField(field.id, { config: { ...config, options: updatedOpts } });
                                }}
                                placeholder="Option Label"
                                className="flex-1 text-xs font-bold px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              />

                              {/* Preview Button (Clicks option to test on Canvas) */}
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateField(field.id, { activeOptionId: opt.id });
                                  if (onPreviewOptionChoice) onPreviewOptionChoice(field.id, opt);
                                }}
                                className={`p-1 rounded transition cursor-pointer ${
                                  isPreviewing ? "bg-amber-500 text-white font-bold" : "text-slate-400 hover:text-slate-700"
                                }`}
                                title="Click to Preview Option Image & Position on Canvas"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Expand/Collapse Position Settings */}
                              <button
                                type="button"
                                onClick={() => setExpandedOptIndex(isExpanded ? null : optIdx)}
                                className="p-1 text-slate-400 hover:text-blue-600 rounded transition cursor-pointer"
                                title="Position & Image Settings"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
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

                            {/* Canvas Graphic Image Selector for this Option */}
                            <div className="bg-slate-50 p-1.5 rounded border border-slate-200 flex items-center justify-between text-[11px]">
                              <span className="text-slate-600 font-medium truncate">Canvas Image:</span>
                              {opt.assetImageUrl ? (
                                <div className="flex items-center gap-1.5">
                                  <img src={opt.assetImageUrl} alt="" className="w-6 h-6 object-cover rounded border" />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenMediaPickerForOption && onOpenMediaPickerForOption(field.id, optIdx, "ASSET")
                                    }
                                    className="text-blue-600 hover:underline font-bold text-[10px] cursor-pointer"
                                  >
                                    Change Image
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenMediaPickerForOption && onOpenMediaPickerForOption(field.id, optIdx, "ASSET")
                                  }
                                  className="text-emerald-700 font-bold bg-white px-2 py-0.5 border border-emerald-300 rounded text-[10px] hover:bg-emerald-50 transition cursor-pointer flex items-center gap-1"
                                >
                                  <Sparkles className="w-3 h-3 text-emerald-600" /> Select Canvas Image
                                </button>
                              )}
                            </div>

                            {/* EXPANDABLE PER-OPTION POSITION & SIZE SETTINGS */}
                            {isExpanded && (
                              <div className="pt-2 border-t border-slate-200 space-y-2 bg-slate-50 p-2 rounded-lg text-[11px]">
                                <label className="flex items-center gap-1.5 font-bold text-slate-800 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={opt.hasCustomPosition || false}
                                    onChange={(e) => {
                                      const updatedOpts = [...options];
                                      updatedOpts[optIdx] = { ...opt, hasCustomPosition: e.target.checked };
                                      onUpdateField(field.id, { config: { ...config, options: updatedOpts } });
                                    }}
                                    className="rounded text-blue-600"
                                  />
                                  <span>Custom Position & Size for THIS Option</span>
                                </label>

                                {opt.hasCustomPosition && (
                                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                                    <div>
                                      <label className="text-[10px] text-slate-500 font-mono">X Pos (px)</label>
                                      <input
                                        type="number"
                                        value={opt.posX !== undefined ? opt.posX : 300}
                                        onChange={(e) => {
                                          const updatedOpts = [...options];
                                          updatedOpts[optIdx] = { ...opt, posX: Number(e.target.value) };
                                          onUpdateField(field.id, { config: { ...config, options: updatedOpts } });
                                        }}
                                        className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-500 font-mono">Y Pos (px)</label>
                                      <input
                                        type="number"
                                        value={opt.posY !== undefined ? opt.posY : 200}
                                        onChange={(e) => {
                                          const updatedOpts = [...options];
                                          updatedOpts[optIdx] = { ...opt, posY: Number(e.target.value) };
                                          onUpdateField(field.id, { config: { ...config, options: updatedOpts } });
                                        }}
                                        className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-500 font-mono">Width (px)</label>
                                      <input
                                        type="number"
                                        value={opt.width !== undefined ? opt.width : 300}
                                        onChange={(e) => {
                                          const updatedOpts = [...options];
                                          updatedOpts[optIdx] = { ...opt, width: Number(e.target.value) };
                                          onUpdateField(field.id, { config: { ...config, options: updatedOpts } });
                                        }}
                                        className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-500 font-mono">Height (px)</label>
                                      <input
                                        type="number"
                                        value={opt.height !== undefined ? opt.height : 300}
                                        onChange={(e) => {
                                          const updatedOpts = [...options];
                                          updatedOpts[optIdx] = { ...opt, height: Number(e.target.value) };
                                          onUpdateField(field.id, { config: { ...config, options: updatedOpts } });
                                        }}
                                        className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white"
                                      />
                                    </div>
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
