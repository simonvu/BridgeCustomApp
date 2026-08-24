import React, { useState, useEffect, useRef } from "react";
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
  RotateCw,
  SlidersHorizontal,
  Info,
  Sparkles,
  Layers,
} from "lucide-react";
import { CanvasLayerItem, renderClippedPhotoCanvas } from "./StudioCanvas";
import { StudioFieldItem } from "./StudioFieldPanel";
import { FontItem, ensureFontLoaded } from "../../utils/fontLoader";
import { StudioConditionRuleItem } from "../../routes/app.artworks_.studio";

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
  // Use fields configured on the active screen, OR fallback to global fields
  const activeFields = (activeScreen?.fields && activeScreen.fields.length > 0) ? activeScreen.fields : fields;

  // Initialize Default Form Values when Modal Opens or Active Screen Changes
  useEffect(() => {
    if (!isOpen) return;
    const initialVals: { [id: string]: any } = { ...formValues };

    activeFields.forEach((f) => {
      if (initialVals[f.id] === undefined) {
        if (f.fieldType === "TEXT") {
          initialVals[f.id] = f.config?.defaultText || "";
        } else if (
          f.fieldType === "SELECT" ||
          f.fieldType === "RADIO" ||
          f.fieldType === "BUTTON_GROUP" ||
          f.fieldType === "COLOR_SWATCH" ||
          f.fieldType === "IMAGE_SWATCH"
        ) {
          const opts = f.config?.options || [];
          initialVals[f.id] = opts[0]?.value || opts[0]?.label || opts[0]?.assetUrl || "";
        }
      }
    });

    setFormValues(initialVals);
  }, [isOpen, activeScreenIndex, activeFields]);

  // Handle Form Input Value Change
  const handleValueChange = (fieldId: string, val: any) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: val }));
  };

  // Handle Customer Photo Upload
  const handleCustomerPhotoUpload = (fieldId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomerPhotoUploads((prev) => ({ ...prev, [fieldId]: url }));
    }
  };

  // Evaluate Rules to determine if a Field should be visible
  const isFieldVisibleByRules = (field: StudioFieldItem) => {
    if (!rules || rules.length === 0) return true;

    // Check rules where this field is a target
    const targetingRules = rules.filter((r) => r.targetFieldId === field.id && r.isActive !== false);
    if (targetingRules.length === 0) return true;

    // Evaluate each targeting rule
    for (const rule of targetingRules) {
      const parentVal = formValues[rule.parentFieldId];
      let conditionMet = false;

      if (rule.conditionType === "EQUALS") {
        conditionMet = String(parentVal) === String(rule.value);
      } else if (rule.conditionType === "NOT_EQUALS") {
        conditionMet = String(parentVal) !== String(rule.value);
      } else if (rule.conditionType === "CONTAINS") {
        conditionMet = String(parentVal || "").includes(String(rule.value));
      } else if (rule.conditionType === "NOT_EMPTY") {
        conditionMet = Boolean(parentVal);
      }

      if (rule.action === "SHOW") {
        if (!conditionMet) return false;
      } else if (rule.action === "HIDE") {
        if (conditionMet) return false;
      }
    }

    return true;
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

    fc.clear();
    fc.setDimensions({ width: widthPx, height: heightPx });

    // Background Color
    if (activeScreen?.bgColor && activeScreen.bgColor !== "transparent") {
      fc.backgroundColor = activeScreen.bgColor;
    } else {
      fc.backgroundColor = "#ffffff";
    }

    const sortedLayers = [...activeLayers]
      .filter((l) => l.isVisible)
      .sort((a, b) => a.zIndex - b.zIndex);

    sortedLayers.forEach((layer) => {
      const props = layer.properties || {};
      const centerX = layer.posX + layer.width / 2;
      const centerY = layer.posY + layer.height / 2;

      // Determine display value from form input OR layer default
      let displayValue = props.text !== undefined ? props.text : layer.name;
      if (layer.linkedFieldId && formValues[layer.linkedFieldId] !== undefined) {
        displayValue = formValues[layer.linkedFieldId];
      }

      if (layer.layerType === "TEXT") {
        const textStr = String(displayValue || "");
        const font = props.fontFamily || "Roboto";
        const fontSize = Number(props.fontSize) || 36;
        const fill = props.color || "#1e293b";

        ensureFontLoaded(font, fonts).then(() => {
          if (!fc) return;

          const textObj = new fabric.Text(textStr, {
            left: centerX,
            top: centerY,
            originX: "center",
            originY: "center",
            fontFamily: font,
            fontSize: fontSize,
            fill: fill,
            angle: layer.rotation || 0,
            opacity: props.opacity !== undefined ? Number(props.opacity) : 1,
            selectable: false,
            evented: false,
          });

          fc.add(textObj);
          fc.requestRenderAll();
        });
      } else if (layer.layerType === "ASSET" || layer.layerType === "IMAGE" || layer.layerType === "OVERLAY") {
        let assetUrl = props.assetUrl;

        // Check if customer selected an option for linked field
        if (layer.linkedFieldId && formValues[layer.linkedFieldId]) {
          const fieldVal = formValues[layer.linkedFieldId];
          assetUrl = fieldVal;
        }

        if (assetUrl) {
          const imgEl = new Image();
          imgEl.crossOrigin = "anonymous";
          imgEl.src = assetUrl;
          imgEl.onload = () => {
            if (!fc) return;

            const nativeW = imgEl.naturalWidth || imgEl.width || layer.width;
            const nativeH = imgEl.naturalHeight || imgEl.height || layer.height;

            const fabricImg = new fabric.Image(imgEl, {
              left: centerX,
              top: centerY,
              originX: "center",
              originY: "center",
              angle: layer.rotation || 0,
              scaleX: layer.width / nativeW,
              scaleY: layer.height / nativeH,
              opacity: props.opacity !== undefined ? Number(props.opacity) : 1,
              selectable: false,
              evented: false,
            });

            fc.add(fabricImg);
            fc.requestRenderAll();
          };
        }
      } else if (layer.layerType === "PHOTO_UPLOAD") {
        let customerAssetUrl = props.assetUrl;
        if (layer.linkedFieldId && customerPhotoUploads[layer.linkedFieldId]) {
          customerAssetUrl = customerPhotoUploads[layer.linkedFieldId];
        }

        if (customerAssetUrl) {
          const imgEl = new Image();
          imgEl.crossOrigin = "anonymous";
          imgEl.src = customerAssetUrl;
          imgEl.onload = () => {
            if (!fc) return;

            const nativeW = imgEl.naturalWidth || imgEl.width || layer.width;
            const nativeH = imgEl.naturalHeight || imgEl.height || layer.height;

            const fabricImg = new fabric.Image(imgEl, {
              left: centerX,
              top: centerY,
              originX: "center",
              originY: "center",
              angle: layer.rotation || 0,
              scaleX: layer.width / nativeW,
              scaleY: layer.height / nativeH,
              opacity: props.opacity !== undefined ? Number(props.opacity) : 1,
              selectable: false,
              evented: false,
            });

            fc.add(fabricImg);
            fc.requestRenderAll();
          };
        }
      }
    });

    fc.requestRenderAll();
  }, [isOpen, activeScreenIndex, formValues, customerPhotoUploads]);

  if (!isOpen) return null;

  const screenFieldLabel = screenFieldConfig?.customerLabel || "Select Screen / Option";
  const showScreenSelector = screenFieldConfig?.enableScreenField || screens.length > 1;

  const visibleFields = activeFields.filter((f) => isFieldVisibleByRules(f));

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

                    return (
                      <div key={field.id} className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
                          <span>
                            {field.label} {field.isRequired && <span className="text-rose-500">*</span>}
                          </span>
                          {field.fieldType === "TEXT" && field.config?.maxLength && (
                            <span className="text-[10px] font-medium text-slate-400">
                              {String(val).length} / {field.config.maxLength}
                            </span>
                          )}
                        </label>

                        {/* TEXT FIELD */}
                        {field.fieldType === "TEXT" && (
                          <input
                            type="text"
                            value={val}
                            maxLength={field.config?.maxLength || 50}
                            onChange={(e) => handleValueChange(field.id, e.target.value)}
                            placeholder={field.config?.placeholder || `Enter ${field.label}...`}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none transition shadow-2xs"
                          />
                        )}

                        {/* SELECT DROPDOWN */}
                        {field.fieldType === "SELECT" && (
                          <select
                            value={val}
                            onChange={(e) => handleValueChange(field.id, e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none transition shadow-2xs cursor-pointer"
                          >
                            {(field.config?.options || []).map((opt: any, idx: number) => (
                              <option key={idx} value={opt.value || opt.assetUrl || opt.label}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}

                        {/* RADIO / BUTTON GROUP */}
                        {(field.fieldType === "RADIO" || field.fieldType === "BUTTON_GROUP") && (
                          <div className="flex flex-wrap gap-2">
                            {(field.config?.options || []).map((opt: any, idx: number) => {
                              const optVal = opt.value || opt.assetUrl || opt.label;
                              const isSel = val === optVal;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleValueChange(field.id, optVal)}
                                  className={`px-3.5 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                    isSel
                                      ? "bg-white border-blue-600 text-blue-900 ring-2 ring-blue-600/30 shadow-2xs"
                                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {isSel && (
                                    <span className="w-3.5 h-3.5 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* COLOR SWATCH */}
                        {field.fieldType === "COLOR_SWATCH" && (
                          <div className="flex flex-wrap gap-2">
                            {(field.config?.options || []).map((opt: any, idx: number) => {
                              const optVal = opt.value || opt.label;
                              const isSel = val === optVal;
                              const colorHex = opt.colorHex || opt.value || "#3b82f6";
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleValueChange(field.id, optVal)}
                                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                                    isSel
                                      ? "bg-white border-blue-600 text-blue-900 ring-2 ring-blue-600/30 shadow-2xs"
                                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                                  }`}
                                >
                                  <span
                                    className="w-4 h-4 rounded-full border border-slate-300 shadow-2xs"
                                    style={{ backgroundColor: colorHex }}
                                  />
                                  <span>{opt.label}</span>
                                  {isSel && (
                                    <span className="w-3.5 h-3.5 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* IMAGE SWATCH */}
                        {field.fieldType === "IMAGE_SWATCH" && (
                          <div className="grid grid-cols-4 gap-2">
                            {(field.config?.options || []).map((opt: any, idx: number) => {
                              const optVal = opt.assetUrl || opt.value || opt.label;
                              const isSel = val === optVal;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleValueChange(field.id, optVal)}
                                  className={`relative p-1 rounded-xl border-2 flex flex-col items-center gap-1 transition cursor-pointer ${
                                    isSel
                                      ? "bg-white border-blue-600 ring-2 ring-blue-600/30 shadow-2xs"
                                      : "bg-slate-50 border-slate-200 hover:border-slate-300"
                                  }`}
                                >
                                  {opt.assetUrl ? (
                                    <img src={opt.assetUrl} alt={opt.label} className="w-10 h-10 object-contain rounded-lg" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                      {opt.label?.substring(0, 3)}
                                    </div>
                                  )}
                                  <span className="text-[10px] font-semibold text-slate-700 truncate max-w-full">{opt.label}</span>
                                  {isSel && (
                                    <span className="absolute top-1 right-1 w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center">
                                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* PHOTO UPLOAD FIELD */}
                        {field.fieldType === "PHOTO_UPLOAD" && (
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                            <label className="block text-[11px] font-medium text-slate-600">Upload Your Photo (JPG / PNG):</label>
                            <div className="flex items-center gap-3">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleCustomerPhotoUpload(field.id, e)}
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
                                    <Check className="w-3 h-3" /> Photo Loaded
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
