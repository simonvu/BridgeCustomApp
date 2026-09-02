import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as fabric from "fabric";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Upload,
  Check,
  Sparkles,
  Info,
  Image as ImageIcon,
  Layers,
  Eye,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import type { CanvasLayerItem } from "./StudioCanvas";
import type { StudioFieldItem } from "./StudioFieldPanel";
import type { FontItem } from "../../utils/fontLoader";
import { type StudioConditionRuleItem } from "../../utils/fieldHelpers";
import {
  getMaxCharacters,
  getMinCharacters,
  getOptionSwatchUrl,
  getOptionValue,
  isFieldVisibleByRules,
  isOptionFieldType,
  normalizeDisplayType,
  defaultDisplayType,
  sanitizeTextInput,
} from "../../utils/fieldHelpers";
import {
  renderStudioScene,
  getPersonalizableDoodleLayers,
} from "../../utils/studioSceneRenderer";

export interface StudioScreenItem {
  id: string;
  name: string;
  bgUrl?: string;
  bgColor?: string;
  iconUrl?: string;
  sortOrder: number;
  layers: CanvasLayerItem[];
  fields?: StudioFieldItem[];
}

interface StudioStorefrontPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  artworkTitle: string;
  screens: StudioScreenItem[];
  screenFieldConfig?: any;
  fields: StudioFieldItem[];
  rules?: StudioConditionRuleItem[];
  widthPx: number;
  heightPx: number;
  fonts?: FontItem[];
  doodlePacks?: any[];
}

/**
 * Live artwork customizer / preview.
 *
 * A product-personalization experience (inspired by Amazon "Customize Now" and
 * trending custom stores): it shows the artwork's screens as selectable "Views",
 * renders a live canvas that reflects the real artwork data, and builds the
 * personalization form strictly from the configured fields + condition rules.
 * It is preview-only — there is intentionally no cart / checkout UI.
 */
export default function StudioStorefrontPreviewModal({
  isOpen,
  onClose,
  artworkTitle,
  screens = [],
  screenFieldConfig = {},
  fields = [],
  rules = [],
  widthPx = 1000,
  heightPx = 1000,
  fonts = [],
  doodlePacks = [],
}: StudioStorefrontPreviewModalProps) {
  const [activeScreenIndex, setActiveScreenIndex] = useState(0);

  // Customer personalization state
  const [formValues, setFormValues] = useState<{ [fieldId: string]: any }>({});
  const [customerPhotoUploads, setCustomerPhotoUploads] = useState<{ [fieldId: string]: string }>({});
  const [doodleTextValues, setDoodleTextValues] = useState<{ [layerId: string]: string }>({});

  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);

  const activeScreen = screens[activeScreenIndex] || screens[0];
  const activeLayers = useMemo(() => activeScreen?.layers || [], [activeScreen]);
  const activeFields = useMemo(() => {
    const source = activeScreen?.fields && activeScreen.fields.length > 0 ? activeScreen.fields : fields;
    return [...source].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [activeScreen, fields]);

  // Doodle Alphabet layers the customer may personalize with their own text
  const personalizableDoodleLayers = useMemo(
    () => getPersonalizableDoodleLayers(activeLayers),
    [activeLayers]
  );

  const computeFieldDefault = useCallback((f: StudioFieldItem) => {
    if (f.fieldType === "TEXT") return f.config?.defaultText || "";
    if (f.fieldType === "CALENDAR") {
      return f.config?.defaultToToday ? new Date().toISOString().slice(0, 10) : "";
    }
    if (isOptionFieldType(f.fieldType)) {
      const opts = f.config?.options || [];
      const firstVisible = opts.find((o: any) => o.isVisible !== false) || opts[0];
      return getOptionValue(firstVisible);
    }
    return "";
  }, []);

  // Seed default values for fields as the customer opens the modal / switches views
  useEffect(() => {
    if (!isOpen) return;
    setFormValues((prev) => {
      const next: { [id: string]: any } = { ...prev };
      activeFields.forEach((f) => {
        if (next[f.id] === undefined) next[f.id] = computeFieldDefault(f);
      });
      return next;
    });
  }, [isOpen, activeScreenIndex, activeFields, computeFieldDefault]);

  // Seed default doodle text for personalizable Doodle Alphabet layers
  useEffect(() => {
    if (!isOpen) return;
    setDoodleTextValues((prev) => {
      const next = { ...prev };
      personalizableDoodleLayers.forEach((l) => {
        if (next[l.id] === undefined) next[l.id] = l.properties?.text || "";
      });
      return next;
    });
  }, [isOpen, activeScreenIndex, personalizableDoodleLayers]);

  // Revoke uploaded object URLs when the modal closes
  useEffect(() => {
    if (isOpen) return;
    setCustomerPhotoUploads((prev) => {
      Object.values(prev).forEach((url) => {
        if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
      return {};
    });
    setActiveScreenIndex(0);
  }, [isOpen]);

  const handleValueChange = (fieldId: string, val: any) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: val }));
  };

  const handleCustomerPhotoUpload = (
    fieldId: string,
    e: React.ChangeEvent<HTMLInputElement>,
    maxFileSizeMb = 10
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxBytes = Math.max(1, maxFileSizeMb) * 1024 * 1024;
    if (file.size > maxBytes) {
      window.alert(`Photo must be ${maxFileSizeMb}MB or smaller.`);
      e.target.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    setCustomerPhotoUploads((prev) => {
      const previous = prev[fieldId];
      if (previous && previous.startsWith("blob:")) URL.revokeObjectURL(previous);
      return { ...prev, [fieldId]: url };
    });
  };

  const handleResetPersonalization = () => {
    setFormValues((prev) => {
      const next = { ...prev };
      activeFields.forEach((f) => {
        next[f.id] = computeFieldDefault(f);
      });
      return next;
    });
    setDoodleTextValues((prev) => {
      const next = { ...prev };
      personalizableDoodleLayers.forEach((l) => {
        next[l.id] = l.properties?.text || "";
      });
      return next;
    });
    setCustomerPhotoUploads((prev) => {
      Object.values(prev).forEach((url) => {
        if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
      return {};
    });
  };

  // Initialize the Fabric canvas for the live preview stage
  useEffect(() => {
    if (!isOpen || !canvasElRef.current) return;

    if (fabricCanvasRef.current) {
      try {
        fabricCanvasRef.current.dispose();
      } catch (e) {
        // ignore
      }
      fabricCanvasRef.current = null;
    }

    const fc = new fabric.Canvas(canvasElRef.current, {
      width: widthPx,
      height: heightPx,
      selection: false,
      preserveObjectStacking: true,
      renderOnAddRemove: false,
      skipTargetFind: true,
    });
    fabricCanvasRef.current = fc;

    // Keep the Fabric canvas at its natural pixel size and scale the wrapper
    // with a contain-and-center CSS transform. Stretching the canvas element
    // directly breaks Fabric's offscreen render pipeline for clipPath masks and
    // groups, so mirror the editor approach.
    const wrapper = (fc as any).wrapperEl as HTMLElement | undefined;
    const applyStageScale = () => {
      const box = stageBoxRef.current;
      if (!box || !wrapper) return;
      const boxW = box.clientWidth;
      const boxH = box.clientHeight;
      if (boxW <= 0 || boxH <= 0) return;
      const scale = Math.min(boxW / widthPx, boxH / heightPx);
      const offsetX = (boxW - widthPx * scale) / 2;
      const offsetY = (boxH - heightPx * scale) / 2;
      wrapper.style.position = "absolute";
      wrapper.style.top = "0";
      wrapper.style.left = "0";
      wrapper.style.transformOrigin = "top left";
      wrapper.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    };
    applyStageScale();

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined" && stageBoxRef.current) {
      ro = new ResizeObserver(applyStageScale);
      ro.observe(stageBoxRef.current);
    }

    return () => {
      ro?.disconnect();
      fc.dispose();
      fabricCanvasRef.current = null;
    };
  }, [isOpen, widthPx, heightPx]);

  // Render the scene whenever inputs or the active screen change. Delegates to
  // the shared read-only renderer so the preview matches the Studio editor for
  // every layer type (text w/ gradients & curves, option-driven assets,
  // photo-upload masks, doodle alphabet, word-search) and honors condition rules.
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!isOpen || !fc) return;
    const token = { cancelled: false };

    renderStudioScene({
      canvas: fc,
      widthPx,
      heightPx,
      bgUrl: activeScreen?.bgUrl,
      bgColor: activeScreen?.bgColor,
      layers: activeLayers,
      fields: activeFields,
      rules,
      formValues,
      customerPhotoUploads,
      doodleTextValues,
      fonts,
      doodlePacks,
      token,
    });

    return () => {
      token.cancelled = true;
    };
  }, [
    isOpen,
    activeScreenIndex,
    formValues,
    customerPhotoUploads,
    doodleTextValues,
    activeLayers,
    activeFields,
    rules,
    widthPx,
    heightPx,
    fonts,
    doodlePacks,
    activeScreen,
  ]);

  if (!isOpen) return null;

  const viewLabel = screenFieldConfig?.customerLabel || "Choose a view";
  const viewMode = String(screenFieldConfig?.displayViewMode || "BUTTON").toUpperCase();
  const hasMultipleScreens = screens.length > 1;
  const showViewSelector = Boolean(screenFieldConfig?.enableScreenField) || hasMultipleScreens;

  const visibleFields = activeFields.filter((f) => isFieldVisibleByRules(f, rules, formValues));

  const goPrevScreen = () => setActiveScreenIndex((p) => (p > 0 ? p - 1 : screens.length - 1));
  const goNextScreen = () => setActiveScreenIndex((p) => (p < screens.length - 1 ? p + 1 : 0));

  const screenInitial = (name?: string) => (name || "V").trim().charAt(0).toUpperCase() || "V";

  // ----- View selector (honors screenFieldConfig.displayViewMode) -----
  const renderViewSelector = () => {
    if (!showViewSelector || !hasMultipleScreens) return null;

    const header = (
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-800">{viewLabel}</span>
        <span className="text-[11px] font-semibold text-indigo-600 truncate max-w-[55%] text-right">
          {activeScreen?.name || `View ${activeScreenIndex + 1}`}
        </span>
      </div>
    );

    if (viewMode === "DROPDOWN") {
      return (
        <div className="rounded-xl border border-slate-200 p-3.5 bg-white space-y-2">
          {header}
          <select
            value={activeScreenIndex}
            onChange={(e) => setActiveScreenIndex(Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:border-indigo-600 focus:outline-none transition cursor-pointer"
          >
            {screens.map((scr, idx) => (
              <option key={scr.id || idx} value={idx}>
                {scr.name || `View ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (viewMode === "ICON") {
      return (
        <div className="rounded-xl border border-slate-200 p-3.5 bg-white space-y-2.5">
          {header}
          <div className="flex flex-wrap gap-3">
            {screens.map((scr, idx) => {
              const isSel = activeScreenIndex === idx;
              return (
                <button
                  key={scr.id || idx}
                  type="button"
                  onClick={() => setActiveScreenIndex(idx)}
                  title={scr.name || `View ${idx + 1}`}
                  className="flex flex-col items-center gap-1 cursor-pointer group"
                >
                  <span
                    className={`w-11 h-11 rounded-full overflow-hidden border-2 flex items-center justify-center transition ${
                      isSel
                        ? "border-indigo-600 ring-2 ring-indigo-600/25"
                        : "border-slate-200 group-hover:border-slate-300"
                    }`}
                    style={!scr.iconUrl ? { backgroundColor: scr.bgColor || "#eef2ff" } : undefined}
                  >
                    {scr.iconUrl ? (
                      <img src={scr.iconUrl} alt={scr.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-extrabold text-indigo-700">{screenInitial(scr.name)}</span>
                    )}
                  </span>
                  <span className={`text-[10px] font-semibold max-w-[64px] truncate ${isSel ? "text-indigo-700" : "text-slate-500"}`}>
                    {scr.name || `View ${idx + 1}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (viewMode === "THUMBNAIL") {
      return (
        <div className="rounded-xl border border-slate-200 p-3.5 bg-white space-y-2.5">
          {header}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {screens.map((scr, idx) => {
              const isSel = activeScreenIndex === idx;
              return (
                <button
                  key={scr.id || idx}
                  type="button"
                  onClick={() => setActiveScreenIndex(idx)}
                  className={`relative rounded-xl border-2 overflow-hidden transition cursor-pointer ${
                    isSel ? "border-indigo-600 ring-2 ring-indigo-600/25" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span
                    className="block w-full aspect-square bg-slate-100 flex items-center justify-center"
                    style={!scr.bgUrl ? { backgroundColor: scr.bgColor || "#eef2ff" } : undefined}
                  >
                    {scr.bgUrl ? (
                      <img src={scr.bgUrl} alt={scr.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-extrabold text-indigo-700">{screenInitial(scr.name)}</span>
                    )}
                  </span>
                  <span className="block px-1 py-1 text-[10px] font-bold text-slate-700 truncate text-center bg-white">
                    {scr.name || `View ${idx + 1}`}
                  </span>
                  {isSel && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // BUTTON (default): pills
    return (
      <div className="rounded-xl border border-slate-200 p-3.5 bg-white space-y-2.5">
        {header}
        <div className="flex flex-wrap gap-2">
          {screens.map((scr, idx) => {
            const isSel = activeScreenIndex === idx;
            return (
              <button
                key={scr.id || idx}
                type="button"
                onClick={() => setActiveScreenIndex(idx)}
                className={`px-3.5 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isSel
                    ? "bg-white border-indigo-600 text-indigo-900 ring-2 ring-indigo-600/25"
                    : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="truncate max-w-[140px]">{scr.name || `View ${idx + 1}`}</span>
                {isSel && (
                  <span className="w-3.5 h-3.5 bg-indigo-600 text-white rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ----- Field control per field type -----
  const renderFieldControl = (field: StudioFieldItem) => {
    const val = formValues[field.id] !== undefined ? formValues[field.id] : "";
    const viewType = normalizeDisplayType(field.displayType || defaultDisplayType(field.fieldType));
    const optionList = (field.config?.options || []).filter((o: any) => o.isVisible !== false);
    const maxChars = getMaxCharacters(field.config);

    if (field.fieldType === "TEXT") {
      return field.config?.allowMultiline ? (
        <textarea
          value={val}
          rows={Math.min(6, Number(field.config?.maxLines) || 2)}
          maxLength={maxChars}
          onChange={(e) => handleValueChange(field.id, sanitizeTextInput(e.target.value, field.config))}
          placeholder={field.config?.placeholder || `Enter ${field.label}...`}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:border-indigo-600 focus:outline-none transition resize-y min-h-[64px]"
        />
      ) : (
        <input
          type="text"
          value={val}
          maxLength={maxChars}
          onChange={(e) => handleValueChange(field.id, sanitizeTextInput(e.target.value, field.config))}
          placeholder={field.config?.placeholder || `Enter ${field.label}...`}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:border-indigo-600 focus:outline-none transition"
        />
      );
    }

    if (field.fieldType === "CALENDAR") {
      return (
        <input
          type="date"
          value={val}
          min={field.config?.minDate || undefined}
          max={field.config?.maxDate || undefined}
          onChange={(e) => handleValueChange(field.id, e.target.value)}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:border-indigo-600 focus:outline-none transition"
        />
      );
    }

    if (isOptionFieldType(field.fieldType) && viewType === "DROPDOWN") {
      return (
        <select
          value={val}
          onChange={(e) => handleValueChange(field.id, e.target.value)}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:border-indigo-600 focus:outline-none transition cursor-pointer"
        >
          {optionList.map((opt: any, idx: number) => (
            <option key={opt.id || idx} value={getOptionValue(opt)}>
              {opt.label || opt.name || `Option ${idx + 1}`}
            </option>
          ))}
        </select>
      );
    }

    if (isOptionFieldType(field.fieldType) && viewType === "RADIO") {
      return (
        <div className="flex flex-wrap gap-2">
          {optionList.map((opt: any, idx: number) => {
            const optVal = getOptionValue(opt);
            const isSel = val === optVal;
            return (
              <button
                key={opt.id || idx}
                type="button"
                onClick={() => handleValueChange(field.id, optVal)}
                className={`px-3.5 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isSel
                    ? "bg-white border-indigo-600 text-indigo-900 ring-2 ring-indigo-600/25"
                    : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span>{opt.label || opt.name}</span>
                {isSel && (
                  <span className="w-3.5 h-3.5 bg-indigo-600 text-white rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      );
    }

    if (isOptionFieldType(field.fieldType) && viewType === "THUMBNAIL") {
      return (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {optionList.map((opt: any, idx: number) => {
            const optVal = getOptionValue(opt);
            const isSel = val === optVal;
            const displayImage = getOptionSwatchUrl(opt);
            return (
              <button
                key={opt.id || idx}
                type="button"
                onClick={() => handleValueChange(field.id, optVal)}
                className={`p-1.5 rounded-xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer relative ${
                  isSel
                    ? "bg-indigo-50/60 border-indigo-600 ring-2 ring-indigo-600/25"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                }`}
              >
                <span className="w-full aspect-square rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center p-1 relative">
                  {displayImage ? (
                    <img src={displayImage} alt={opt.label || opt.name} className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-slate-300" />
                  )}
                  {isSel && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-bold text-slate-800 line-clamp-1">{opt.label || opt.name}</span>
              </button>
            );
          })}
        </div>
      );
    }

    if (field.fieldType === "IMAGE_UPLOAD") {
      const uploaded = customerPhotoUploads[field.id];
      return (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <p className="text-[11px] font-medium text-slate-500">
            {field.config?.helpText || "Upload your photo (JPG / PNG)"}
          </p>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleCustomerPhotoUpload(field.id, e, field.config?.maxFileSizeMb || 10)}
              className="hidden"
              id={`upload_${field.id}`}
            />
            <label
              htmlFor={`upload_${field.id}`}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{uploaded ? "Change Photo" : "Select Photo"}</span>
            </label>
            {uploaded && (
              <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200">
                <img src={uploaded} alt="Uploaded" className="w-6 h-6 object-cover rounded" />
                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Loaded
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  // Combined, sequentially-numbered personalization steps: fields then doodles
  const totalSteps = visibleFields.length + personalizableDoodleLayers.length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-6xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        {/* HEADER */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center gap-1.5 bg-indigo-600 text-white font-bold text-[11px] px-2.5 py-1 rounded-full shrink-0">
              <Eye className="w-3.5 h-3.5" />
              <span>Live Preview</span>
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 truncate">{artworkTitle || "Custom Design"}</h2>
              <p className="text-[11px] text-slate-400 font-medium -mt-0.5 truncate">
                Preview &amp; personalize — changes update instantly
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer shrink-0"
            title="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* LEFT: LIVE STAGE + VIEWS */}
          <div className="lg:col-span-7 bg-[#f5f6f8] border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col p-5 sm:p-6 gap-4 min-h-[360px] select-none">
            <div className="flex-1 flex items-center justify-center relative min-h-[300px]">
              <div
                ref={stageBoxRef}
                className="relative bg-white rounded-2xl shadow-[0_16px_44px_-16px_rgba(15,23,42,0.35)] border border-slate-200 overflow-hidden w-full"
                style={{
                  aspectRatio: `${widthPx} / ${heightPx}`,
                  maxHeight: "62vh",
                }}
              >
                {hasMultipleScreens && (
                  <>
                    <button
                      type="button"
                      onClick={goPrevScreen}
                      className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/95 shadow-md border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-white transition cursor-pointer"
                      title="Previous view"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={goNextScreen}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/95 shadow-md border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-white transition cursor-pointer"
                      title="Next view"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}

                {/* Natural-size Fabric canvas; wrapper is CSS-scaled to fit */}
                <canvas ref={canvasElRef} className="pointer-events-none" />
              </div>
            </div>

            {/* Current view caption */}
            <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-500">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span className="truncate max-w-[220px]">{activeScreen?.name || `View ${activeScreenIndex + 1}`}</span>
              {hasMultipleScreens && (
                <span className="text-slate-400">
                  • {activeScreenIndex + 1}/{screens.length}
                </span>
              )}
            </div>

            {/* VIEWS thumbnail strip (reflects the artwork's configured screens) */}
            {hasMultipleScreens && (
              <div className="w-full">
                <div className="flex items-center gap-3 overflow-x-auto pb-1.5">
                  {screens.map((scr, idx) => {
                    const isSel = activeScreenIndex === idx;
                    return (
                      <button
                        key={scr.id || idx}
                        type="button"
                        onClick={() => setActiveScreenIndex(idx)}
                        title={scr.name || `View ${idx + 1}`}
                        className={`relative shrink-0 w-16 h-16 rounded-xl border-2 overflow-hidden transition cursor-pointer bg-white ${
                          isSel
                            ? "border-indigo-600 ring-2 ring-indigo-600/25"
                            : "border-slate-200 hover:border-slate-300 opacity-80 hover:opacity-100"
                        }`}
                        style={!scr.bgUrl ? { backgroundColor: scr.bgColor || "#ffffff" } : undefined}
                      >
                        {scr.bgUrl ? (
                          <img src={scr.bgUrl} alt={scr.name} className="w-full h-full object-cover" />
                        ) : scr.iconUrl ? (
                          <img src={scr.iconUrl} alt={scr.name} className="w-full h-full object-contain p-1.5" />
                        ) : (
                          <span className="w-full h-full flex flex-col items-center justify-center text-[10px] text-slate-600 p-1 text-center">
                            <Layers className="w-3.5 h-3.5 text-indigo-500 mb-0.5" />
                            <span className="truncate max-w-full font-bold">{scr.name || `View ${idx + 1}`}</span>
                          </span>
                        )}
                        {isSel && (
                          <span className="absolute top-1 right-1 w-4 h-4 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: PERSONALIZATION PANEL */}
          <div className="lg:col-span-5 bg-white flex flex-col min-h-0">
            <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 shrink-0">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                <span>Personalize your design</span>
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {totalSteps > 0
                  ? "Fill in the options below to customize this artwork."
                  : "This view has no customer options to personalize."}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
              {renderViewSelector()}

              {totalSteps === 0 && (
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl text-center space-y-1.5">
                  <Info className="w-5 h-5 text-indigo-500 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">No personalization options</p>
                  <p className="text-[11px] text-slate-500">
                    Add custom fields in the Studio <strong>FIELDS</strong> tab to let customers personalize this design.
                  </p>
                </div>
              )}

              {/* Configured fields */}
              {visibleFields.map((field, i) => {
                const val = formValues[field.id] !== undefined ? formValues[field.id] : "";
                const maxChars = getMaxCharacters(field.config);
                const minChars = getMinCharacters(field.config);
                const textLen = String(val).length;
                return (
                  <div key={field.id} className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <span className="truncate">
                          {field.label} {field.isRequired && <span className="text-rose-500">*</span>}
                        </span>
                      </label>
                      {field.fieldType === "TEXT" && (
                        <span
                          className={`text-[10px] font-medium shrink-0 ${
                            textLen < minChars ? "text-amber-600" : "text-slate-400"
                          }`}
                        >
                          {textLen} / {maxChars}
                        </span>
                      )}
                    </div>
                    {renderFieldControl(field)}
                  </div>
                );
              })}

              {/* Doodle Alphabet personalization */}
              {personalizableDoodleLayers.map((layer, di) => (
                <div key={layer.id} className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">
                      {visibleFields.length + di + 1}
                    </span>
                    <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    <span className="truncate">{layer.properties?.fieldLabel || "Custom Doodle Text"}</span>
                  </label>
                  {layer.properties?.helpText && (
                    <p className="text-[11px] text-slate-500 font-medium -mt-1">{layer.properties.helpText}</p>
                  )}
                  <input
                    type="text"
                    value={doodleTextValues[layer.id] ?? ""}
                    onChange={(e) =>
                      setDoodleTextValues((prev) => ({ ...prev, [layer.id]: e.target.value }))
                    }
                    placeholder="Type your text..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold tracking-wide text-slate-800 focus:bg-white focus:border-purple-600 focus:outline-none transition"
                  />
                </div>
              ))}
            </div>

            {/* FOOTER (no cart / checkout — preview only) */}
            <div className="px-5 sm:px-6 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Live preview</span>
              </span>
              {totalSteps > 0 && (
                <button
                  type="button"
                  onClick={handleResetPersonalization}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                  title="Reset personalization to defaults"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
