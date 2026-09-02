import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { useState, useMemo, useEffect } from "react";
import {
  Image as ImageIcon,
  Upload,
  Check,
  MoreHorizontal,
  Download,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import prisma from "../db.server";
import { requireTeamUserId } from "../services/auth.server";
import StudioCanvas, { type CanvasLayerItem, getActiveFabricCanvas } from "../components/studio/StudioCanvas";
import StudioTopToolbar from "../components/studio/StudioTopToolbar";
import ClipArtAssetPanel from "../components/studio/ClipArtAssetPanel";
import MediaSelectModal from "../components/MediaSelectModal";
import { injectFontStylesheets, type FontItem } from "../utils/fontLoader";
import { analyzeAndArrangeImages } from "../utils/clipArtImport";
import { dataUrlToFile } from "../utils/clipArtMerge";
import type { StudioFieldItem } from "../utils/fieldHelpers";

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUserId = await requireTeamUserId(request);
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    include: { userRoles: { include: { role: true } } },
  });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const model = (prisma as any).clipArt;
  const clipart = id && model ? await model.findUnique({ where: { id } }) : null;

  const fontModel = (prisma as any).font;
  const fonts: FontItem[] = fontModel
    ? await fontModel.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] })
    : [];

  return json({
    currentUser: {
      email: currentUser?.email || "admin@bridgecustom.com",
      name: currentUser?.name || "Super Admin",
      roleName: currentUser?.userRoles?.[0]?.role?.code?.toUpperCase() || "SUPER_ADMIN",
      avatarUrl: currentUser?.avatarUrl || null,
    },
    clipart,
    fonts,
  });
}

function parseLayers(raw: any): CanvasLayerItem[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr.map((l: any) => ({
      ...l,
      properties: typeof l.properties === "string" ? JSON.parse(l.properties) : l.properties || {},
    }));
  } catch {
    return [];
  }
}

function parseFields(raw: any): any[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr.map((f: any) => ({ ...f, config: typeof f.config === "string" ? JSON.parse(f.config) : f.config || {} }));
  } catch {
    return [];
  }
}

function cleanFileName(name?: string, fallback = "Option"): string {
  if (!name) return fallback;
  const n = name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim();
  return n ? n.replace(/\b\w/g, (c) => c.toUpperCase()) : fallback;
}

export default function ClipArtStudioRoute() {
  const { currentUser, clipart, fonts } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (fonts) injectFontStylesheets(fonts);
  }, [fonts]);

  const [clipArtId, setClipArtId] = useState<string | null>(clipart?.id || searchParams.get("id") || null);
  const [name, setName] = useState(clipart?.name || "New Clip Art");
  const [category, setCategory] = useState(clipart?.category || "General");
  const [saveStatus, setSaveStatus] = useState<"DRAFT" | "PUBLISHED">(
    clipart?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT"
  );
  const [widthPx, setWidthPx] = useState(clipart?.widthPx || 1000);
  const [heightPx, setHeightPx] = useState(clipart?.heightPx || 1000);
  const [layers, setLayers] = useState<CanvasLayerItem[]>(() => parseLayers(clipart?.layers));
  const [fields, setFields] = useState<any[]>(() => parseFields(clipart?.fields));
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [rightSidebarWidthPx, setRightSidebarWidthPx] = useState(420);

  const selectedLayerId = selectedLayerIds.length === 1 ? selectedLayerIds[0] : null;
  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId) || null,
    [layers, selectedLayerId]
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMultiSelect, setPickerMultiSelect] = useState(true);
  const [pickerTarget, setPickerTarget] = useState<{
    type: "LAYER" | "OPTION" | "BATCH_OPTIONS" | "IMPORT" | "OPTGROUP";
    layerId?: string;
    fieldId?: string;
    optionIndex?: number;
    optionTargetType?: "SWATCH" | "ASSET";
  } | null>(null);

  const handleStartResizingRightSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightSidebarWidthPx;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      setRightSidebarWidthPx(Math.max(280, Math.min(650, startWidth + (startX - moveEvent.clientX))));
    };
    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const nextZ = () => (layers.length > 0 ? Math.max(...layers.map((l) => l.zIndex)) + 1 : 0);

  const handleSelectLayer = (layerId: string | null, isMultiKey = false) => {
    if (!layerId) return setSelectedLayerIds([]);
    if (isMultiKey) {
      setSelectedLayerIds((prev) =>
        prev.includes(layerId) ? prev.filter((id) => id !== layerId) : [...prev, layerId]
      );
    } else {
      setSelectedLayerIds([layerId]);
    }
  };

  const handleUpdateLayer = (layerId: string, patch: Partial<CanvasLayerItem>) => {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, ...patch } : l)));
  };

  const handleUpdateProps = (layerId: string, propsPatch: Record<string, any>) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, properties: { ...(l.properties || {}), ...propsPatch } } : l))
    );
  };

  const handleDeleteLayer = (layerId: string) => {
    const target = layers.find((l) => l.id === layerId);
    setLayers((prev) => prev.filter((l) => l.id !== layerId));
    if (target?.linkedFieldId) {
      setFields((prev) => prev.filter((f) => f.id !== target.linkedFieldId));
    }
    setSelectedLayerIds((prev) => prev.filter((id) => id !== layerId));
  };

  const handleDuplicateLayer = (layerId: string) => {
    const src = layers.find((l) => l.id === layerId);
    if (!src) return;
    const stamp = Date.now();
    const rnd = Math.random().toString(36).slice(2, 6);
    let newLinkedFieldId = src.linkedFieldId;
    if (src.linkedFieldId) {
      const srcField = fields.find((f) => f.id === src.linkedFieldId);
      if (srcField) {
        const newFieldId = `field_${stamp}_${rnd}`;
        const srcOpts = srcField.config?.options || [];
        const options = srcOpts.map((o: any, i: number) => ({
          ...o,
          id: `opt_${stamp}_${i}_${rnd}`,
          value: `${o.value || "v"}_copy_${rnd}`,
        }));
        const srcActiveIdx = srcOpts.findIndex((o: any) => o.id === srcField.activeOptionId);
        const activeOptionId = (srcActiveIdx >= 0 ? options[srcActiveIdx]?.id : options[0]?.id) as string | undefined;
        setFields((prev) => [
          ...prev,
          {
            ...srcField,
            id: newFieldId,
            label: `${srcField.label || src.name} (Copy)`,
            sortOrder: prev.length,
            activeOptionId,
            config: { ...(srcField.config || {}), options },
          },
        ]);
        newLinkedFieldId = newFieldId;
      }
    }
    const copy: CanvasLayerItem = {
      ...src,
      id: `layer_${stamp}_${rnd}`,
      name: `${src.name} (Copy)`,
      posX: src.posX + 20,
      posY: src.posY + 20,
      zIndex: nextZ(),
      linkedFieldId: newLinkedFieldId,
      properties: JSON.parse(JSON.stringify(src.properties || {})),
    };
    setLayers((prev) => [...prev, copy]);
    setSelectedLayerIds([copy.id]);
  };

  const openPicker = (target: NonNullable<typeof pickerTarget>, multi = true) => {
    setPickerTarget(target);
    setPickerMultiSelect(multi);
    setPickerOpen(true);
  };

  const handleOpenMediaPickerForLayer = (layerId: string) => {
    openPicker({ type: "LAYER", layerId }, false);
  };

  const handleOpenMediaPickerForBatchOptions = (fieldId: string) => {
    openPicker({ type: "BATCH_OPTIONS", fieldId }, true);
  };

  const handleUpdateField = (fieldId: string, updatedProps: Partial<StudioFieldItem>) => {
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, ...updatedProps } : f)));
    if (updatedProps.label) {
      setLayers((prev) =>
        prev.map((l) => (l.linkedFieldId === fieldId ? { ...l, name: updatedProps.label! } : l))
      );
    }
  };

  const handlePreviewOptionChoice = (fieldId: string, option: any) => {
    const linkedLayer = layers.find((l) => l.linkedFieldId === fieldId);
    if (!linkedLayer) return;
    const updatedProps: Partial<CanvasLayerItem> = {
      properties: {
        ...(linkedLayer.properties || {}),
        assetUrl: option.assetImageUrl || linkedLayer.properties?.assetUrl,
      },
    };
    if (option.posX !== undefined) updatedProps.posX = option.posX;
    if (option.posY !== undefined) updatedProps.posY = option.posY;
    if (option.width !== undefined) updatedProps.width = option.width;
    if (option.height !== undefined) updatedProps.height = option.height;
    if (option.rotation !== undefined) updatedProps.rotation = option.rotation;
    if (option.opacity !== undefined) {
      updatedProps.properties = { ...updatedProps.properties, opacity: Number(option.opacity) };
    }
    handleUpdateLayer(linkedLayer.id, updatedProps);
    setSelectedLayerIds([linkedLayer.id]);
  };

  const renameApartment = (layerId: string, label: string) => {
    handleUpdateLayer(layerId, { name: label });
    const layer = layers.find((l) => l.id === layerId);
    if (layer?.linkedFieldId) handleUpdateField(layer.linkedFieldId, { label });
  };

  const ensureOptionGroup = (layerId: string): string | null => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return null;
    if (layer.linkedFieldId) return layer.linkedFieldId;
    const fieldId = `field_${Date.now()}`;
    const url = layer.properties?.assetUrl || "";
    const opt = {
      id: `opt_${Date.now()}`,
      label: layer.name || "Option 1",
      value: `variant_${Math.random().toString(36).slice(2, 6)}`,
      assetImageUrl: url,
      swatchImageUrl: url,
      isVisible: true,
    };
    setFields((prev) => [
      ...prev,
      {
        id: fieldId,
        label: layer.name || "Option Group",
        fieldType: "FIELD_ASSET",
        displayType: "THUMBNAIL",
        sortOrder: prev.length,
        isRequired: false,
        allowPersonalized: true,
        activeOptionId: opt.id,
        config: { options: [opt] },
      },
    ]);
    handleUpdateLayer(layerId, { linkedFieldId: fieldId });
    return fieldId;
  };

  const handleAddVariants = (layerId: string) => {
    const fieldId = ensureOptionGroup(layerId);
    if (fieldId) handleOpenMediaPickerForBatchOptions(fieldId);
  };

  const handleDeleteVariant = (fieldId: string, optId: string) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f;
        const options = (f.config?.options || []).filter((o: any) => o.id !== optId);
        const nextActive = f.activeOptionId === optId ? options[0]?.id : f.activeOptionId;
        if (options[0] && f.activeOptionId === optId) {
          handlePreviewOptionChoice(fieldId, options[0]);
        }
        return { ...f, activeOptionId: nextActive, config: { ...(f.config || {}), options } };
      })
    );
  };

  const handleResetGroup = (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return;
    const w = layer.properties?.naturalWidth || layer.width;
    const h = layer.properties?.naturalHeight || layer.height;
    const maxDim = Math.min(widthPx, heightPx) * 0.6;
    const scale = Math.min(maxDim / Math.max(1, w), maxDim / Math.max(1, h), 1);
    const nw = Math.max(20, Math.round(w * scale));
    const nh = Math.max(20, Math.round(h * scale));
    handleUpdateLayer(layerId, {
      posX: Math.round((widthPx - nw) / 2),
      posY: Math.round((heightPx - nh) / 2),
      width: nw,
      height: nh,
      rotation: 0,
      properties: { ...(layer.properties || {}), flipH: false, flipV: false, opacity: 1 },
    });
    if (layer.linkedFieldId) {
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== layer.linkedFieldId) return f;
          const options = (f.config?.options || []).map((o: any) => {
            const { posX, posY, width, height, rotation, flipH, flipV, ...rest } = o;
            return rest;
          });
          return { ...f, config: { ...(f.config || {}), options } };
        })
      );
    }
  };

  const measureImage = (url: string): Promise<{ natW: number; natH: number }> =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve({ natW: img.naturalWidth || 300, natH: img.naturalHeight || 300 });
      img.onerror = () => resolve({ natW: 300, natH: 300 });
      img.src = url;
    });

  const filesToVariants = (files: any[]) =>
    files.map((f, i) => {
      const url = f.url || f.thumbnailUrl;
      return {
        id: `opt_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        label: cleanFileName(f.fileName, `Option ${i + 1}`),
        value: `variant_${i}_${Math.random().toString(36).slice(2, 5)}`,
        assetImageUrl: url,
        swatchImageUrl: f.thumbnailUrl || url,
        isVisible: true,
      };
    });

  // Create an Option Group: a FIELD_ASSET field (variants) + one linked slot layer.
  const createOptionGroup = async (files: any[]) => {
    if (!files || files.length === 0) return;
    // Default name; the designer renames it in the inspector (Group name field).
    const groupCount = fields.filter((f) => f.fieldType === "FIELD_ASSET").length;
    const label = `Option Group ${groupCount + 1}`;
    const options = filesToVariants(files);
    const fieldId = `field_${Date.now()}`;

    const first = files[0];
    const { natW, natH } = await measureImage(first.url || first.thumbnailUrl);
    const maxDim = Math.min(widthPx, heightPx) * 0.6;
    const scale = Math.min(maxDim / natW, maxDim / natH, 1);
    const w = Math.max(20, Math.round(natW * scale));
    const h = Math.max(20, Math.round(natH * scale));

    const layer: CanvasLayerItem = {
      id: `layer_${Date.now()}_grp`,
      name: label,
      layerType: "ASSET",
      zIndex: nextZ(),
      posX: Math.round((widthPx - w) / 2),
      posY: Math.round((heightPx - h) / 2),
      width: w,
      height: h,
      rotation: 0,
      isVisible: true,
      isLocked: false,
      linkedFieldId: fieldId,
      properties: { assetUrl: options[0].assetImageUrl, opacity: 1 },
    };

    setFields((prev) => [
      ...prev,
      {
        id: fieldId,
        label: label || "Option Group",
        fieldType: "FIELD_ASSET",
        displayType: "THUMBNAIL",
        sortOrder: fields.length,
        isRequired: false,
        allowPersonalized: true,
        activeOptionId: options[0].id,
        config: { options },
      },
    ]);
    setLayers((prev) => [...prev, layer]);
    setSelectedLayerIds([layer.id]);
    setStatusMsg(`Added option group "${label}" with ${options.length} variants.`);
    setTimeout(() => setStatusMsg(""), 3000);
  };

  const addVariantsToGroup = (fieldId: string, files: any[]) => {
    const newOpts = filesToVariants(files);
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId ? { ...f, config: { ...(f.config || {}), options: [...(f.config?.options || []), ...newOpts] } } : f
      )
    );
    setStatusMsg(`Added ${newOpts.length} variant(s).`);
    setTimeout(() => setStatusMsg(""), 2500);
  };

  const handlePickerSelect = async (files: any[]) => {
    const target = pickerTarget;
    setPickerOpen(false);
    setPickerTarget(null);
    if (!files || files.length === 0 || !target) return;

    if (target.type === "LAYER" && target.layerId) {
      const url = files[0].url || files[0].thumbnailUrl;
      const layer = layers.find((l) => l.id === target.layerId);
      handleUpdateProps(target.layerId, { assetUrl: url });
      if (layer?.linkedFieldId) {
        setFields((prev) =>
          prev.map((f) => {
            if (f.id !== layer.linkedFieldId) return f;
            const options = (f.config?.options || []).map((o: any) =>
              o.id === f.activeOptionId ? { ...o, assetImageUrl: url, swatchImageUrl: url } : o
            );
            return { ...f, config: { ...(f.config || {}), options } };
          })
        );
      }
      return;
    }

    if (target.type === "OPTION" && target.fieldId != null && target.optionIndex != null) {
      const url = files[0].url || files[0].thumbnailUrl;
      const thumb = files[0].thumbnailUrl || url;
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== target.fieldId) return f;
          const options = [...(f.config?.options || [])];
          if (!options[target.optionIndex!]) return f;
          options[target.optionIndex!] = {
            ...options[target.optionIndex!],
            ...(target.optionTargetType === "SWATCH"
              ? { swatchImageUrl: thumb }
              : { assetImageUrl: url, swatchImageUrl: thumb }),
          };
          return { ...f, config: { ...(f.config || {}), options } };
        })
      );
      const field = fields.find((f) => f.id === target.fieldId);
      const opt = field?.config?.options?.[target.optionIndex];
      if (opt && target.optionTargetType !== "SWATCH") {
        handlePreviewOptionChoice(target.fieldId, { ...opt, assetImageUrl: url });
      }
      return;
    }

    if (target.type === "BATCH_OPTIONS" && target.fieldId) {
      addVariantsToGroup(target.fieldId, files);
      return;
    }

    if (target.type === "OPTGROUP") {
      await createOptionGroup(files);
      return;
    }

    if (target.type === "IMPORT") {
      setStatusMsg("Importing & auto-arranging…");
      const sources = files.map((f) => ({ url: f.url || f.thumbnailUrl, name: f.fileName }));
      const result = await analyzeAndArrangeImages(sources, widthPx, heightPx);
      if (result.mode === "FULL") {
        setWidthPx(result.canvasWidth);
        setHeightPx(result.canvasHeight);
        setLayers(result.layers);
      } else {
        const offset = nextZ();
        const shifted = result.layers.map((l, i) => ({ ...l, zIndex: offset + i }));
        setLayers((prev) => [...prev, ...shifted]);
      }
      setStatusMsg(
        result.mode === "FULL"
          ? `Imported ${result.layers.length} full-canvas layers (composition reconstructed).`
          : `Imported ${result.layers.length} parts arranged on a grid.`
      );
      setTimeout(() => setStatusMsg(""), 3500);
      return;
    }
  };

  // ---- Flatten selected layers into one image (rasterize + upload) ----
  const uploadDataUrl = async (dataUrl: string, fileName: string): Promise<{ url: string; key: string } | null> => {
    try {
      const file = dataUrlToFile(dataUrl, fileName);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "cliparts");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success && data.url) return { url: data.url, key: data.key || fileName };
    } catch (e) {
      console.error("Upload failed", e);
    }
    return null;
  };

  const handleFlatten = async (ids?: string[]) => {
    const targetIds = ids && ids.length >= 2 ? ids : selectedLayerIds;
    if (targetIds.length < 2) {
      setStatusMsg("Select 2+ layers to merge.");
      setTimeout(() => setStatusMsg(""), 2500);
      return;
    }
    const fc = getActiveFabricCanvas();
    if (!fc) return;
    setStatusMsg("Merging…");

    const sel = layers.filter((l) => targetIds.includes(l.id));
    const minX = Math.min(...sel.map((l) => l.posX));
    const minY = Math.min(...sel.map((l) => l.posY));
    const maxX = Math.max(...sel.map((l) => l.posX + l.width));
    const maxY = Math.max(...sel.map((l) => l.posY + l.height));
    const bboxW = Math.max(1, Math.round(maxX - minX));
    const bboxH = Math.max(1, Math.round(maxY - minY));

    const objs = fc.getObjects();
    const hidden: any[] = [];
    fc.discardActiveObject();
    objs.forEach((o: any) => {
      if (o.layerId && !targetIds.includes(o.layerId)) {
        if (o.visible !== false) {
          hidden.push(o);
          o.visible = false;
        }
      }
      if (o.layerId && o.type === "group" && typeof o.getObjects === "function") {
        const frame = o.getObjects()[0];
        if (frame) frame.set({ stroke: "transparent" });
      }
    });
    const origBg = fc.backgroundColor;
    fc.backgroundColor = "transparent";
    fc.renderAll();

    let dataUrl = "";
    try {
      dataUrl = fc.toDataURL({ format: "png", left: minX, top: minY, width: bboxW, height: bboxH, multiplier: 1 });
    } catch (e) {
      console.error("Flatten export failed", e);
    }

    hidden.forEach((o) => (o.visible = true));
    fc.backgroundColor = origBg;
    fc.renderAll();

    if (!dataUrl) {
      setStatusMsg("Merge failed.");
      setTimeout(() => setStatusMsg(""), 2500);
      return;
    }

    const uploaded = await uploadDataUrl(dataUrl, `clipart_flat_${Date.now()}.png`);
    const finalUrl = uploaded?.url || dataUrl;
    const stamp = Date.now();
    const fieldId = `field_${stamp}_merged`;
    const opt = {
      id: `opt_${stamp}`,
      label: "Merged",
      value: "merged",
      assetImageUrl: finalUrl,
      swatchImageUrl: finalUrl,
      isVisible: true,
    };
    const removedFieldIds = sel.map((l) => l.linkedFieldId).filter(Boolean) as string[];

    const flatLayer: CanvasLayerItem = {
      id: `layer_${stamp}_flat`,
      name: "Merged",
      layerType: "ASSET",
      zIndex: Math.max(...sel.map((l) => l.zIndex)),
      posX: Math.round(minX),
      posY: Math.round(minY),
      width: bboxW,
      height: bboxH,
      rotation: 0,
      isVisible: true,
      isLocked: false,
      linkedFieldId: fieldId,
      properties: { assetUrl: finalUrl, opacity: 1, naturalWidth: bboxW, naturalHeight: bboxH, aspectRatio: bboxW / bboxH },
    };
    setFields((prev) => [
      ...prev.filter((f) => !removedFieldIds.includes(f.id)),
      {
        id: fieldId,
        label: "Merged",
        fieldType: "FIELD_ASSET",
        displayType: "THUMBNAIL",
        sortOrder: prev.length,
        isRequired: false,
        allowPersonalized: true,
        activeOptionId: opt.id,
        config: { options: [opt] },
      },
    ]);
    setLayers((prev) => [...prev.filter((l) => !targetIds.includes(l.id)), flatLayer]);
    setSelectedLayerIds([flatLayer.id]);
    setStatusMsg("Merged into one layer.");
    setTimeout(() => setStatusMsg(""), 2500);
  };

  // ---- Save (export transparent composite + thumbnail) ----
  const exportComposite = (multiplier: number): string => {
    const fc = getActiveFabricCanvas();
    if (!fc) return "";
    fc.discardActiveObject();
    fc.getObjects().forEach((o: any) => {
      if (o.type === "group" && typeof o.getObjects === "function") {
        const frame = o.getObjects()[0];
        if (frame) frame.set({ stroke: "transparent" });
      }
    });
    const origBg = fc.backgroundColor;
    fc.backgroundColor = "transparent";
    fc.renderAll();
    let dataUrl = "";
    try {
      dataUrl = fc.toDataURL({ format: "png", multiplier });
    } catch (e) {
      console.error("composite export error", e);
    }
    fc.backgroundColor = origBg;
    fc.renderAll();
    return dataUrl;
  };

  const handleSave = async (nextStatus: "DRAFT" | "PUBLISHED" = saveStatus) => {
    if (layers.length === 0) {
      setStatusMsg("Add or import layers before saving.");
      setTimeout(() => setStatusMsg(""), 2500);
      return;
    }
    setIsSaving(true);
    try {
      const compositeDataUrl = exportComposite(1);
      const thumbDataUrl = exportComposite(Math.min(1, 400 / Math.max(widthPx, heightPx)));

      let compositeUrl = "";
      let compositeKey = "";
      let thumbnailUrl = "";
      if (compositeDataUrl) {
        const up = await uploadDataUrl(compositeDataUrl, `clipart_${Date.now()}.png`);
        if (up) {
          compositeUrl = up.url;
          compositeKey = up.key;
        }
      }
      if (thumbDataUrl) {
        const upt = await uploadDataUrl(thumbDataUrl, `clipart_thumb_${Date.now()}.png`);
        if (upt) thumbnailUrl = upt.url;
      }

      const res = await fetch("/api/cliparts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "SAVE",
          id: clipArtId,
          name,
          category,
          widthPx,
          heightPx,
          layers,
          fields,
          compositeUrl,
          compositeKey,
          thumbnailUrl: thumbnailUrl || compositeUrl,
          status: nextStatus,
        }),
      });
      const data = await res.json();
      if (data.success && data.clipart) {
        setClipArtId(data.clipart.id);
        setSaveStatus(nextStatus);
        window.history.replaceState(null, "", `/app/cliparts/studio?id=${data.clipart.id}`);
        setSavedToast(true);
        setTimeout(() => setSavedToast(false), 2500);
      } else {
        setStatusMsg("Save failed: " + (data.error || "unknown"));
        setTimeout(() => setStatusMsg(""), 3000);
      }
    } catch (e: any) {
      setStatusMsg("Save error: " + e.message);
      setTimeout(() => setStatusMsg(""), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    const dataUrl = exportComposite(1);
    if (!dataUrl) {
      setStatusMsg("Nothing to download yet.");
      setTimeout(() => setStatusMsg(""), 2000);
      return;
    }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${name || "clipart"}.png`;
    a.click();
  };

  const pickerTitle =
    pickerTarget?.type === "IMPORT"
      ? "Import clip art set"
      : pickerTarget?.type === "LAYER"
        ? "Replace image"
        : pickerTarget?.type === "OPTGROUP"
          ? "Pick variant images for the option group"
          : pickerTarget?.type === "BATCH_OPTIONS"
            ? "Add more variants"
            : pickerTarget?.type === "OPTION"
              ? pickerTarget.optionTargetType === "SWATCH"
                ? "Pick swatch image"
                : "Pick variant image"
              : "Select image";

  return (
    <DashboardLayout currentUser={currentUser} contentPaddingClassName="p-4">
      <div className="flex flex-col h-[calc(100vh-80px)] min-h-[640px] overflow-hidden bg-slate-100 rounded-xl border border-slate-200">
        <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-[14px] font-bold text-slate-900 shrink-0">Edit Asset</h1>
            <button
              type="button"
              onClick={() => setSaveStatus("DRAFT")}
              className={`h-6 px-2 rounded text-[11px] font-bold cursor-pointer ${
                saveStatus === "DRAFT" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500 hover:bg-amber-50"
              }`}
            >
              Draft
            </button>
            <button
              type="button"
              onClick={() => setSaveStatus("PUBLISHED")}
              className={`h-6 px-2 rounded text-[11px] font-bold cursor-pointer ${
                saveStatus === "PUBLISHED" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500 hover:bg-emerald-50"
              }`}
            >
              Published
            </button>
            {statusMsg && <span className="text-[11px] font-semibold text-blue-600 truncate max-w-[240px]">{statusMsg}</span>}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-0.5 bg-slate-100 border border-slate-300 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.1, Math.round((z - 0.1) * 100) / 100))}
                className="h-6 w-6 flex items-center justify-center hover:bg-slate-200 rounded cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="min-w-[36px] h-6 text-[11px] font-bold hover:bg-slate-200 rounded cursor-pointer"
                title="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 100) / 100))}
                className="h-6 w-6 flex items-center justify-center hover:bg-slate-200 rounded cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate("/app/cliparts")}
              className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSave("DRAFT")}
              disabled={isSaving}
              className="h-8 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {isSaving ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : savedToast ? (
                <Check className="w-3.5 h-3.5" />
              ) : null}
              {savedToast ? "Saved!" : "Save Draft"}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setHeaderMenuOpen((v) => !v)}
                className="h-8 w-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center cursor-pointer"
                title="More"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {headerMenuOpen && (
                <div className="absolute right-0 top-9 z-30 w-52 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-[12px]">
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      handleSave("PUBLISHED");
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-slate-50 cursor-pointer font-semibold text-slate-700"
                  >
                    Save & Publish
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      openPicker({ type: "IMPORT" }, true);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-slate-50 cursor-pointer text-slate-700 flex items-center gap-2"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-400" /> Import & auto-arrange
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      openPicker({ type: "OPTGROUP" }, true);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-slate-50 cursor-pointer text-slate-700 flex items-center gap-2"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-slate-400" /> Option group from images
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      handleFlatten();
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-slate-50 cursor-pointer text-slate-700"
                  >
                    Merge selected layers
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      handleDownload();
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-slate-50 cursor-pointer text-slate-700 flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" /> Download image
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 h-full flex flex-col overflow-hidden bg-slate-200/60 relative">
            <StudioTopToolbar
              selectedLayer={selectedLayer}
              fields={fields}
              fonts={fonts}
              onUpdateLayer={handleUpdateLayer}
              onUpdateField={handleUpdateField}
              onOpenMediaPickerForLayer={handleOpenMediaPickerForLayer}
            />
            <div className="flex-1 relative overflow-auto">
              <StudioCanvas
                widthPx={widthPx}
                heightPx={heightPx}
                layers={layers}
                fields={fields}
                selectedLayerId={selectedLayerId}
                selectedLayerIds={selectedLayerIds}
                onSelectLayer={handleSelectLayer}
                onUpdateLayer={handleUpdateLayer}
                onUpdateField={handleUpdateField}
                zoom={zoom}
                showGrid={true}
                workspaceBgColor="#ffffff"
                fonts={fonts}
                doodlePacks={[]}
              />
            </div>
          </div>

          <div
            onMouseDown={handleStartResizingRightSidebar}
            className="w-2 bg-slate-200/80 hover:bg-blue-300 border-x border-slate-300/60 cursor-ew-resize flex items-center justify-center group transition select-none shrink-0 z-20"
            title="Drag left/right to adjust sidebar width"
          >
            <div className="h-8 w-1 rounded-full bg-slate-400 group-hover:bg-blue-600 transition" />
          </div>

          <div style={{ width: `${rightSidebarWidthPx}px` }} className="flex flex-col bg-white shrink-0">
            <div className="h-9 px-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {isEditingTitle ? (
                  <input
                    type="text"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => setIsEditingTitle(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") setIsEditingTitle(false);
                    }}
                    className="font-bold text-slate-900 text-xs bg-white border border-blue-500 rounded px-2 py-1 focus:outline-none w-full shadow-2xs"
                    placeholder="Clip art name"
                  />
                ) : (
                  <span
                    onDoubleClick={() => setIsEditingTitle(true)}
                    className="font-bold text-slate-900 text-xs hover:bg-slate-200/60 rounded px-2 py-1 transition cursor-pointer truncate max-w-[220px] select-none"
                    title="Double click to edit name"
                  >
                    {name || "Untitled Clip Art"}
                  </span>
                )}
                <span className="text-[11px] text-slate-400 font-mono shrink-0">
                  ({widthPx}×{heightPx})
                </span>
              </div>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-7 w-24 px-2 rounded-md border border-slate-200 text-[11px] font-medium text-slate-600 focus:outline-none focus:border-blue-500"
                placeholder="Category"
                title="Category"
              />
            </div>

            <div className="flex-1 overflow-hidden">
              <ClipArtAssetPanel
                layers={layers}
                fields={fields}
                selectedLayerIds={selectedLayerIds}
                onSelectLayer={(id) => handleSelectLayer(id)}
                onAddGroup={() => openPicker({ type: "OPTGROUP" }, true)}
                onAddVariants={handleAddVariants}
                onSetActiveVariant={(fieldId, option) => {
                  handleUpdateField(fieldId, { activeOptionId: option.id });
                  handlePreviewOptionChoice(fieldId, option);
                }}
                onRename={renameApartment}
                onToggleVisible={(id) => {
                  const layer = layers.find((l) => l.id === id);
                  if (layer) handleUpdateLayer(id, { isVisible: !layer.isVisible });
                }}
                onDuplicate={handleDuplicateLayer}
                onReset={handleResetGroup}
                onDelete={handleDeleteLayer}
                onDeleteVariant={handleDeleteVariant}
                onReorder={(newLayers) => setLayers(newLayers)}
              />
            </div>
          </div>
        </div>
      </div>

      <MediaSelectModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiSelect={pickerMultiSelect}
        allowedCategory="IMAGE"
        title={pickerTitle}
        onSelect={handlePickerSelect}
      />
    </DashboardLayout>
  );
}
