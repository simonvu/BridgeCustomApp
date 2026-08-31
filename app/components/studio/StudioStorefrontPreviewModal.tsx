import React, { useState, useEffect, useRef, useMemo } from "react";
import * as fabric from "fabric";
import {
  X,
  Heart,
  ChevronLeft,
  ChevronRight,
  Upload,
  Check,
  ShoppingBag,
  Zap,
  ShieldCheck,
  Truck,
  SlidersHorizontal,
  Info,
  Sparkles,
  Layers,
  Image as ImageIcon,
} from "lucide-react";
import { CanvasLayerItem } from "./StudioCanvas";
import { StudioFieldItem } from "./StudioFieldPanel";
import { FontItem, ensureFontLoaded } from "../../utils/fontLoader";
import { type StudioConditionRuleItem } from "../../utils/fieldHelpers";
import {
  findOptionByValue,
  formatCalendarDate,
  getMaxCharacters,
  getMinCharacters,
  getOptionAssetUrl,
  getOptionSwatchUrl,
  getOptionValue,
  isFieldVisibleByRules,
  isLayerVisibleByRules,
  isOptionFieldType,
  normalizeDisplayType,
  defaultDisplayType,
  sanitizeTextInput,
} from "../../utils/fieldHelpers";

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
}

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
}: StudioStorefrontPreviewModalProps) {
  const [activeScreenIndex, setActiveScreenIndex] = useState(0);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [quantity, setQuantity] = useState(1);

  // Customer Form State values (Field ID -> Customer input value)
  const [formValues, setFormValues] = useState<{ [fieldId: string]: any }>({});
  // Customer Uploaded Photo Blob URLs (Field ID -> image URL)
  const [customerPhotoUploads, setCustomerPhotoUploads] = useState<{ [fieldId: string]: string }>({});

  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  const activeScreen = screens[activeScreenIndex] || screens[0];
  const activeLayers = activeScreen?.layers || [];
  const activeFields = useMemo(() => {
    const source = activeScreen?.fields && activeScreen.fields.length > 0 ? activeScreen.fields : fields;
    return [...source].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [activeScreen, fields]);

  useEffect(() => {
    if (!isOpen) return;
    setFormValues((prev) => {
      const initialVals: { [id: string]: any } = { ...prev };
      activeFields.forEach((f) => {
        if (initialVals[f.id] !== undefined) return;
        if (f.fieldType === "TEXT") {
          initialVals[f.id] = f.config?.defaultText || "";
        } else if (f.fieldType === "CALENDAR") {
          initialVals[f.id] = f.config?.defaultToToday
            ? new Date().toISOString().slice(0, 10)
            : "";
        } else if (isOptionFieldType(f.fieldType)) {
          const opts = f.config?.options || [];
          const firstVisible = opts.find((o: any) => o.isVisible !== false) || opts[0];
          initialVals[f.id] = getOptionValue(firstVisible);
        }
      });
      return initialVals;
    });
  }, [isOpen, activeScreenIndex, activeFields]);

  // Handle Form Input Value Change
  useEffect(() => {
    if (isOpen) return;
    setCustomerPhotoUploads((prev) => {
      Object.values(prev).forEach((url) => {
        if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
      return {};
    });
  }, [isOpen]);

  const handleValueChange = (fieldId: string, val: any) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: val }));
  };

  const handleCustomerPhotoUpload = (fieldId: string, e: React.ChangeEvent<HTMLInputElement>, maxFileSizeMb = 10) => {
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
      if (previous) URL.revokeObjectURL(previous);
      return { ...prev, [fieldId]: url };
    });
  };

  // Initialize Fabric Canvas for Live Preview Stage
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
      interactive: false,
    });
    fabricCanvasRef.current = fc;

    return () => {
      fc.dispose();
      fabricCanvasRef.current = null;
    };
  }, [isOpen, widthPx, heightPx]);

  // Render Fabric Objects on Live Canvas whenever Form Values or Active Screen changes
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!isOpen || !fc) return;
    let cancelled = false;

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const imgEl = new Image();
        imgEl.crossOrigin = "anonymous";
        imgEl.onload = () => resolve(imgEl);
        imgEl.onerror = () => resolve(null);
        imgEl.src = src;
      });

    const addImageLayer = (
      imgEl: HTMLImageElement,
      left: number,
      top: number,
      width: number,
      height: number,
      rotation: number,
      opacity: number
    ) => {
      if (cancelled || !fc) return;
      const nativeW = imgEl.naturalWidth || imgEl.width || width || 1;
      const nativeH = imgEl.naturalHeight || imgEl.height || height || 1;
      const fabricImg = new fabric.Image(imgEl, {
        left,
        top,
        originX: "center",
        originY: "center",
        angle: rotation || 0,
        scaleX: width / nativeW,
        scaleY: height / nativeH,
        opacity,
        selectable: false,
        evented: false,
      });
      fc.add(fabricImg);
    };

    (async () => {
      fc.clear();
      fc.setDimensions({ width: widthPx, height: heightPx });
      fc.backgroundColor =
        activeScreen?.bgColor && activeScreen.bgColor !== "transparent" ? activeScreen.bgColor : "#ffffff";

      if (activeScreen?.bgUrl) {
        const bgImg = await loadImage(activeScreen.bgUrl);
        if (cancelled || !fc) return;
        if (bgImg) {
          const fabricBg = new fabric.Image(bgImg, {
            left: 0,
            top: 0,
            originX: "left",
            originY: "top",
            scaleX: widthPx / (bgImg.naturalWidth || widthPx),
            scaleY: heightPx / (bgImg.naturalHeight || heightPx),
            selectable: false,
            evented: false,
          });
          fc.add(fabricBg);
        }
      }

      const sortedLayers = [...activeLayers]
        .filter((l) => l.isVisible && isLayerVisibleByRules(l.id, rules, formValues))
        .sort((a, b) => a.zIndex - b.zIndex);

      for (const layer of sortedLayers) {
        if (cancelled) return;
        const props = layer.properties || {};
        const linkedField = layer.linkedFieldId
          ? activeFields.find((f) => f.id === layer.linkedFieldId)
          : undefined;
        const linkedValue = layer.linkedFieldId ? formValues[layer.linkedFieldId] : undefined;
        const linkedOption = linkedField ? findOptionByValue(linkedField, linkedValue) : undefined;

        let drawX = layer.posX + layer.width / 2;
        let drawY = layer.posY + layer.height / 2;
        let drawW = layer.width;
        let drawH = layer.height;
        let drawRot = layer.rotation || 0;
        if (linkedOption?.hasCustomPosition) {
          if (linkedOption.posX !== undefined) drawX = linkedOption.posX + (linkedOption.width ?? drawW) / 2;
          if (linkedOption.posY !== undefined) drawY = linkedOption.posY + (linkedOption.height ?? drawH) / 2;
          if (linkedOption.width !== undefined) drawW = linkedOption.width;
          if (linkedOption.height !== undefined) drawH = linkedOption.height;
          if (linkedOption.rotation !== undefined) drawRot = linkedOption.rotation;
        }

        if (layer.layerType === "TEXT") {
          let textStr = props.text !== undefined ? String(props.text) : layer.name;
          if (linkedField?.fieldType === "CALENDAR" && linkedValue) {
            textStr = formatCalendarDate(String(linkedValue), linkedField.config?.dateFormat);
          } else if (linkedField?.fieldType === "TEXT" && linkedValue !== undefined) {
            textStr = sanitizeTextInput(String(linkedValue), linkedField.config);
          } else if (linkedValue !== undefined && linkedValue !== "") {
            textStr = String(linkedValue);
          }
          const font = props.fontFamily || "Roboto";
          await ensureFontLoaded(font, fonts);
          if (cancelled || !fc) return;
          const textObj = new fabric.Text(textStr || " ", {
            left: drawX,
            top: drawY,
            originX: "center",
            originY: "center",
            fontFamily: font,
            fontSize: Number(props.fontSize) || 36,
            fill: props.color || "#1e293b",
            angle: drawRot,
            opacity: props.opacity !== undefined ? Number(props.opacity) : 1,
            selectable: false,
            evented: false,
          });
          fc.add(textObj);
        } else if (layer.layerType === "ASSET" || layer.layerType === "IMAGE" || layer.layerType === "OVERLAY") {
          const assetUrl = getOptionAssetUrl(linkedOption) || props.assetUrl;
          if (!assetUrl) continue;
          const imgEl = await loadImage(assetUrl);
          if (cancelled || !imgEl) continue;
          addImageLayer(imgEl, drawX, drawY, drawW, drawH, drawRot, props.opacity !== undefined ? Number(props.opacity) : 1);
        } else if (layer.layerType === "PHOTO_UPLOAD") {
          const customerAssetUrl =
            (layer.linkedFieldId && customerPhotoUploads[layer.linkedFieldId]) || props.assetUrl;
          if (!customerAssetUrl) continue;
          const imgEl = await loadImage(customerAssetUrl);
          if (cancelled || !imgEl) continue;
          addImageLayer(imgEl, drawX, drawY, drawW, drawH, drawRot, props.opacity !== undefined ? Number(props.opacity) : 1);
        }
      }

      if (!cancelled) fc.requestRenderAll();
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeScreenIndex, formValues, customerPhotoUploads, activeLayers, activeFields, rules, widthPx, heightPx, fonts, activeScreen]);

  if (!isOpen) return null;

  const screenFieldLabel = screenFieldConfig?.customerLabel || "Select Screen / Option";
  const showScreenSelector = screenFieldConfig?.enableScreenField || screens.length > 1;

  const visibleFields = activeFields.filter((f) => isFieldVisibleByRules(f, rules, formValues));

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* MODAL HEADER */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="bg-blue-600 text-white font-bold text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Storefront Live Customer Preview</span>
            </span>
            <span className="text-slate-400 text-xs font-medium hidden sm:inline">•</span>
            <span className="text-slate-300 font-semibold text-sm truncate max-w-xs sm:max-w-md">{artworkTitle}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY (TWO COLUMNS LAYOUT LIKE SHOPIFY FRONTSTORE) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* LEFT COLUMN: LIVE ARTWORK PREVIEW & GALLERY (7 COLS) */}
          <div className="lg:col-span-7 p-6 bg-slate-50 flex flex-col items-center justify-between gap-6 select-none">
            {/* LIVE PREVIEW CANVAS STAGE CONTAINER */}
            <div className="w-full flex-1 flex items-center justify-center relative min-h-[380px]">
              <div
                className="relative bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden max-w-full"
                style={{
                  aspectRatio: `${widthPx} / ${heightPx}`,
                  width: "100%",
                  maxHeight: "520px",
                }}
              >
                {/* WISHLIST HEART BUTTON */}
                <button
                  type="button"
                  onClick={() => setIsWishlisted(!isWishlisted)}
                  className={`absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/90 shadow-md border border-slate-200 flex items-center justify-center transition cursor-pointer ${
                    isWishlisted ? "text-rose-500 scale-110" : "text-slate-400 hover:text-rose-500"
                  }`}
                  title={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
                >
                  <Heart className={`w-5 h-5 ${isWishlisted ? "fill-rose-500" : ""}`} />
                </button>

                {/* NAVIGATION ARROWS */}
                {screens.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveScreenIndex((prev) => (prev > 0 ? prev - 1 : screens.length - 1))}
                      className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 shadow-md border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-white transition cursor-pointer"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveScreenIndex((prev) => (prev < screens.length - 1 ? prev + 1 : 0))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 shadow-md border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-white transition cursor-pointer"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}

                {/* FABRIC LIVE CANVAS */}
                <canvas ref={canvasElRef} className="w-full h-full object-contain pointer-events-none" />
              </div>
            </div>

            {/* PRODUCT THUMBNAILS GALLERY (RENDER ONLY CONFIGURED SCREENS) */}
            {screens.length > 1 && (
              <div className="w-full pt-2">
                <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {screens.map((scr, idx) => (
                    <button
                      key={scr.id || idx}
                      type="button"
                      onClick={() => setActiveScreenIndex(idx)}
                      className={`relative shrink-0 min-w-[72px] h-16 rounded-xl border-2 overflow-hidden transition cursor-pointer bg-white shadow-xs px-2 flex flex-col items-center justify-center ${
                        activeScreenIndex === idx
                          ? "border-blue-600 ring-2 ring-blue-600/30 scale-105 font-bold"
                          : "border-slate-200 hover:border-slate-300 opacity-75 hover:opacity-100"
                      }`}
                    >
                      {scr.bgUrl ? (
                        <img src={scr.bgUrl} alt={scr.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-[10px] text-slate-700 p-1 text-center">
                          <Layers className="w-3.5 h-3.5 text-blue-600 mb-0.5" />
                          <span className="truncate max-w-full font-bold">{scr.name || `Screen ${idx + 1}`}</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: CUSTOMER CUSTOMIZATION FORM (5 COLS) */}
          <div className="lg:col-span-5 p-6 bg-white flex flex-col justify-between space-y-6">
            <div className="space-y-6">
              {/* TITLE & HEADER */}
              <div className="border-b border-slate-100 pb-4 space-y-1">
                <h2 className="text-xs font-extrabold text-slate-900 tracking-wider uppercase flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                  <span>Personalized Options</span>
                </h2>
                <p className="text-[11px] text-slate-500 font-medium">Customized products are printed on demand for your order.</p>
              </div>

              {/* 1. DYNAMIC SCREEN SELECTOR (DERIVED STRICTLY FROM CONFIGURED SCREENS) */}
              {showScreenSelector && screens.length > 1 && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span>{screenFieldLabel}</span>
                    <span className="text-[11px] text-blue-600 font-semibold">
                      Selected: {screens[activeScreenIndex]?.name || `Screen ${activeScreenIndex + 1}`}
                    </span>
                  </label>

                  {/* GRID OF CONFIGURED SCREENS ONLY */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {screens.map((scr, idx) => {
                      const isSelected = activeScreenIndex === idx;

                      return (
                        <button
                          key={scr.id || idx}
                          type="button"
                          onClick={() => setActiveScreenIndex(idx)}
                          className={`relative h-11 px-2.5 rounded-xl border-2 font-bold text-xs transition flex items-center justify-center text-center cursor-pointer shadow-2xs ${
                            isSelected
                              ? "bg-white border-blue-600 text-blue-900 ring-2 ring-blue-600/30 scale-105"
                              : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <span className="truncate">{scr.name || `Screen ${idx + 1}`}</span>
                          {isSelected && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-xs">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. DYNAMIC CUSTOMER FIELDS (DERIVED STRICTLY FROM CONFIGURED FIELDS) */}
              <div className="space-y-4">
                {visibleFields.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center space-y-1.5">
                    <Info className="w-5 h-5 text-blue-600 mx-auto" />
                    <p className="text-xs font-bold text-slate-700">No Custom Fields Configured</p>
                    <p className="text-[11px] text-slate-500">
                      Add custom fields in the Studio <strong>FIELDS</strong> tab to make personalized customer inputs appear here.
                    </p>
                  </div>
                ) : (
                  visibleFields.map((field) => {
                    const val = formValues[field.id] !== undefined ? formValues[field.id] : "";
                    const viewType = normalizeDisplayType(field.displayType || defaultDisplayType(field.fieldType));
                    const optionList = (field.config?.options || []).filter((o: any) => o.isVisible !== false);
                    const maxChars = getMaxCharacters(field.config);
                    const minChars = getMinCharacters(field.config);
                    const textLen = String(val).length;

                    return (
                      <div key={field.id} className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
                          <span>
                            {field.label} {field.isRequired && <span className="text-rose-500">*</span>}
                          </span>
                          {field.fieldType === "TEXT" && (
                            <span className={`text-[10px] font-medium ${textLen < minChars ? "text-amber-600" : "text-slate-400"}`}>
                              {textLen} / {maxChars}
                            </span>
                          )}
                        </label>

                        {field.fieldType === "TEXT" && (
                          field.config?.allowMultiline ? (
                            <textarea
                              value={val}
                              rows={Math.min(6, Number(field.config?.maxLines) || 2)}
                              maxLength={maxChars}
                              onChange={(e) => handleValueChange(field.id, sanitizeTextInput(e.target.value, field.config))}
                              placeholder={field.config?.placeholder || `Enter ${field.label}...`}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none transition shadow-2xs resize-y min-h-[64px]"
                            />
                          ) : (
                            <input
                              type="text"
                              value={val}
                              maxLength={maxChars}
                              onChange={(e) => handleValueChange(field.id, sanitizeTextInput(e.target.value, field.config))}
                              placeholder={field.config?.placeholder || `Enter ${field.label}...`}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none transition shadow-2xs"
                            />
                          )
                        )}

                        {field.fieldType === "CALENDAR" && (
                          <input
                            type="date"
                            value={val}
                            min={field.config?.minDate || undefined}
                            max={field.config?.maxDate || undefined}
                            onChange={(e) => handleValueChange(field.id, e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:border-rose-500 focus:outline-none transition shadow-2xs"
                          />
                        )}

                        {isOptionFieldType(field.fieldType) && viewType === "DROPDOWN" && (
                            <select
                              value={val}
                              onChange={(e) => handleValueChange(field.id, e.target.value)}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:border-indigo-600 focus:outline-none transition shadow-2xs cursor-pointer"
                            >
                              {optionList.map((opt: any, idx: number) => (
                                  <option key={opt.id || idx} value={getOptionValue(opt)}>
                                    {opt.label || opt.name || `Option ${idx + 1}`}
                                  </option>
                              ))}
                            </select>
                          )}

                        {isOptionFieldType(field.fieldType) && viewType === "RADIO" && (
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
                                        ? "bg-white border-indigo-600 text-indigo-900 ring-2 ring-indigo-600/30 shadow-2xs"
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
                          )}

                        {isOptionFieldType(field.fieldType) && viewType === "THUMBNAIL" && (
                            <div className="grid grid-cols-3 gap-2.5">
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
                                        ? "bg-indigo-50/60 border-indigo-600 ring-2 ring-indigo-600/30 shadow-xs"
                                        : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    <div className="w-full aspect-square rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center p-1 relative">
                                      {displayImage ? (
                                        <img src={displayImage} alt={opt.label || opt.name} className="w-full h-full object-contain" />
                                      ) : (
                                        <ImageIcon className="w-5 h-5 text-slate-300" />
                                      )}
                                      {isSel && (
                                        <span className="absolute top-1 right-1 w-4 h-4 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-xs">
                                          <Check className="w-3 h-3 stroke-[3]" />
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] font-bold text-slate-800 line-clamp-1">{opt.label || opt.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                        {field.fieldType === "IMAGE_UPLOAD" && (
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                            <p className="text-[11px] font-medium text-slate-600">
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
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>Select Photo</span>
                              </label>
                              {customerPhotoUploads[field.id] && (
                                <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200">
                                  <img src={customerPhotoUploads[field.id]} alt="Uploaded" className="w-6 h-6 object-cover rounded" />
                                  <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Photo loaded
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 3. SHOPIFY ACTION BUTTONS */}
            <div className="pt-4 border-t border-slate-200 space-y-3 shrink-0">
              {/* QUANTITY SELECTOR */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">Quantity:</label>
                <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-8 h-8 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-bold text-xs text-slate-900">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="w-8 h-8 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* ADD TO CART BUTTON */}
              <button
                type="button"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>ADD TO CART</span>
              </button>

              {/* BUY IT NOW BUTTON */}
              <button
                type="button"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span>BUY IT NOW</span>
              </button>

              {/* TRUST BADGES */}
              <div className="pt-2 grid grid-cols-2 gap-2 text-[10px] font-semibold text-slate-500">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>100% Satisfaction Guarantee</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Printed & Shipped from USA</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
