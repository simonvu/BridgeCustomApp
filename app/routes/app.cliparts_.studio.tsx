import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { useState, useMemo, useEffect } from "react";
import {
  ArrowLeft,
  Save,
  Image as ImageIcon,
  Type as TypeIcon,
  Upload,
  Layers as LayersIcon,
  Trash2,
  Copy,
  Check,
  Combine,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import prisma from "../db.server";
import { requireTeamUserId } from "../services/auth.server";
import StudioCanvas, { type CanvasLayerItem, getActiveFabricCanvas } from "../components/studio/StudioCanvas";
import MediaSelectModal from "../components/MediaSelectModal";
import { injectFontStylesheets, type FontItem } from "../utils/fontLoader";
import {
  analyzeAndArrangeImages,
  computeAlign,
  computeDistribute,
  type AlignMode,
} from "../utils/clipArtImport";
import { computeConcat, dataUrlToFile } from "../utils/clipArtMerge";

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
  const [widthPx, setWidthPx] = useState(clipart?.widthPx || 1000);
  const [heightPx, setHeightPx] = useState(clipart?.heightPx || 1000);
  const [layers, setLayers] = useState<CanvasLayerItem[]>(() => parseLayers(clipart?.layers));
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const selectedLayerId = selectedLayerIds.length === 1 ? selectedLayerIds[0] : null;
  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId) || null,
    [layers, selectedLayerId]
  );

  // Media picker: purpose distinguishes single add / replace vs multi import
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"ADD" | "IMPORT" | "REPLACE">("ADD");
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

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

  const applyPatches = (patches: Record<string, Partial<CanvasLayerItem>>) => {
    setLayers((prev) => prev.map((l) => (patches[l.id] ? { ...l, ...patches[l.id] } : l)));
  };

  const handleUpdateProps = (layerId: string, propsPatch: Record<string, any>) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, properties: { ...(l.properties || {}), ...propsPatch } } : l))
    );
  };

  const handleDeleteLayer = (layerId: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== layerId));
    setSelectedLayerIds((prev) => prev.filter((id) => id !== layerId));
  };

  const handleDuplicateLayer = (layerId: string) => {
    const src = layers.find((l) => l.id === layerId);
    if (!src) return;
    const copy: CanvasLayerItem = {
      ...src,
      id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${src.name} (Copy)`,
      posX: src.posX + 20,
      posY: src.posY + 20,
      zIndex: nextZ(),
      properties: JSON.parse(JSON.stringify(src.properties || {})),
    };
    setLayers((prev) => [...prev, copy]);
    setSelectedLayerIds([copy.id]);
  };

  const handleAddText = () => {
    const layer: CanvasLayerItem = {
      id: `layer_${Date.now()}`,
      name: "Text",
      layerType: "TEXT",
      zIndex: nextZ(),
      posX: Math.round(widthPx / 4),
      posY: Math.round(heightPx / 4),
      width: 400,
      height: 120,
      rotation: 0,
      isVisible: true,
      isLocked: false,
      properties: {
        text: "Sample Text",
        fontFamily: "Roboto",
        fontSize: 64,
        color: "#111827",
        align: "center",
        verticalAlign: "middle",
        autoFit: true,
      },
    };
    setLayers((prev) => [...prev, layer]);
    setSelectedLayerIds([layer.id]);
  };

  const openPicker = (mode: "ADD" | "IMPORT" | "REPLACE", targetId?: string) => {
    setPickerMode(mode);
    setReplaceTargetId(targetId || null);
    setPickerOpen(true);
  };

  const addImageLayer = (fileUrl: string, fileName?: string) =>
    new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const natW = img.naturalWidth || 300;
        const natH = img.naturalHeight || 300;
        const maxDim = Math.min(widthPx, heightPx) * 0.6;
        const scale = Math.min(maxDim / natW, maxDim / natH, 1);
        const w = Math.max(20, Math.round(natW * scale));
        const h = Math.max(20, Math.round(natH * scale));
        const layer: CanvasLayerItem = {
          id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: (fileName || "Image").replace(/\.[^/.]+$/, ""),
          layerType: "ASSET",
          zIndex: nextZ(),
          posX: Math.round((widthPx - w) / 2),
          posY: Math.round((heightPx - h) / 2),
          width: w,
          height: h,
          rotation: 0,
          isVisible: true,
          isLocked: false,
          properties: { assetUrl: fileUrl, opacity: 1, naturalWidth: natW, naturalHeight: natH, aspectRatio: natW / natH },
        };
        setLayers((prev) => [...prev, layer]);
        setSelectedLayerIds([layer.id]);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = fileUrl;
    });

  const handlePickerSelect = async (files: any[]) => {
    setPickerOpen(false);
    if (!files || files.length === 0) return;

    if (pickerMode === "REPLACE" && replaceTargetId) {
      const url = files[0].url || files[0].thumbnailUrl;
      handleUpdateProps(replaceTargetId, { assetUrl: url });
      return;
    }

    if (pickerMode === "IMPORT") {
      setStatusMsg("Importing & auto-arranging…");
      const sources = files.map((f) => ({ url: f.url || f.thumbnailUrl, name: f.fileName }));
      const result = await analyzeAndArrangeImages(sources, widthPx, heightPx);
      if (result.mode === "FULL") {
        // Reconstruct original composition -> adopt the source canvas size.
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

    // ADD (single or several as centered layers)
    for (const f of files) {
      await addImageLayer(f.url || f.thumbnailUrl, f.fileName);
    }
  };

  // ---- Align / Distribute / Concat ----
  const doAlign = (mode: AlignMode) => applyPatches(computeAlign(layers, selectedLayerIds, mode, widthPx, heightPx));
  const doDistribute = (axis: "h" | "v") => applyPatches(computeDistribute(layers, selectedLayerIds, axis));
  const doConcat = (dir: "row" | "col") => applyPatches(computeConcat(layers, selectedLayerIds, dir, 0));

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

  const handleFlatten = async () => {
    if (selectedLayerIds.length < 2) {
      setStatusMsg("Select 2+ layers to flatten.");
      setTimeout(() => setStatusMsg(""), 2500);
      return;
    }
    const fc = getActiveFabricCanvas();
    if (!fc) return;
    setStatusMsg("Flattening…");

    const sel = layers.filter((l) => selectedLayerIds.includes(l.id));
    const minX = Math.min(...sel.map((l) => l.posX));
    const minY = Math.min(...sel.map((l) => l.posY));
    const maxX = Math.max(...sel.map((l) => l.posX + l.width));
    const maxY = Math.max(...sel.map((l) => l.posY + l.height));
    const bboxW = Math.max(1, Math.round(maxX - minX));
    const bboxH = Math.max(1, Math.round(maxY - minY));

    // Hide non-selected fabric objects, deselect, drop selection frames.
    const objs = fc.getObjects();
    const hidden: any[] = [];
    fc.discardActiveObject();
    objs.forEach((o: any) => {
      if (o.layerId && !selectedLayerIds.includes(o.layerId)) {
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

    // Restore
    hidden.forEach((o) => (o.visible = true));
    fc.backgroundColor = origBg;
    fc.renderAll();

    if (!dataUrl) {
      setStatusMsg("Flatten failed.");
      setTimeout(() => setStatusMsg(""), 2500);
      return;
    }

    const uploaded = await uploadDataUrl(dataUrl, `clipart_flat_${Date.now()}.png`);
    const finalUrl = uploaded?.url || dataUrl;

    const flatLayer: CanvasLayerItem = {
      id: `layer_${Date.now()}_flat`,
      name: "Merged Object",
      layerType: "ASSET",
      zIndex: Math.max(...sel.map((l) => l.zIndex)),
      posX: Math.round(minX),
      posY: Math.round(minY),
      width: bboxW,
      height: bboxH,
      rotation: 0,
      isVisible: true,
      isLocked: false,
      properties: { assetUrl: finalUrl, opacity: 1, naturalWidth: bboxW, naturalHeight: bboxH, aspectRatio: bboxW / bboxH },
    };
    setLayers((prev) => [...prev.filter((l) => !selectedLayerIds.includes(l.id)), flatLayer]);
    setSelectedLayerIds([flatLayer.id]);
    setStatusMsg("Merged into one object.");
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

  const handleSave = async () => {
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
          compositeUrl,
          compositeKey,
          thumbnailUrl: thumbnailUrl || compositeUrl,
          status: "PUBLISHED",
        }),
      });
      const data = await res.json();
      if (data.success && data.clipart) {
        setClipArtId(data.clipart.id);
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

  const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  const multi = selectedLayerIds.length >= 2;

  const ToolBtn = ({
    onClick,
    title,
    disabled,
    children,
  }: {
    onClick: () => void;
    title: string;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-8 w-8 flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
    >
      {children}
    </button>
  );

  return (
    <DashboardLayout currentUser={currentUser} contentPaddingClassName="p-4">
      <div className="flex flex-col h-[calc(100vh-80px)] min-h-[640px] overflow-hidden bg-slate-100 rounded-xl border border-slate-200">
        {/* Top bar */}
        <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate("/app/cliparts")}
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Library
            </button>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 w-48"
              placeholder="Clip art name"
            />
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500 w-32"
              placeholder="Category"
            />
            <span className="text-[11px] text-slate-400 font-mono">{widthPx}×{heightPx}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {statusMsg && <span className="text-[11px] font-semibold text-blue-600 truncate max-w-[240px]">{statusMsg}</span>}
            <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 rounded-lg p-0.5">
              <button type="button" onClick={() => setZoom((z) => Math.max(0.2, Math.round((z - 0.1) * 10) / 10))} className="h-6 w-6 flex items-center justify-center hover:bg-slate-200 rounded cursor-pointer">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setZoom(1)} className="min-w-[36px] h-6 text-[11px] font-bold hover:bg-slate-200 rounded cursor-pointer">
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10))} className="h-6 w-6 flex items-center justify-center hover:bg-slate-200 rounded cursor-pointer">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="h-8 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {isSaving ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : savedToast ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {savedToast ? "Saved!" : "Save"}
            </button>
          </div>
        </div>

        {/* Action toolbar */}
        <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex items-center gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => openPicker("ADD")} className="h-8 px-2.5 rounded-lg bg-white border border-slate-300 hover:border-blue-300 text-slate-700 hover:text-blue-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
              <ImageIcon className="w-3.5 h-3.5" /> Image
            </button>
            <button type="button" onClick={handleAddText} className="h-8 px-2.5 rounded-lg bg-white border border-slate-300 hover:border-blue-300 text-slate-700 hover:text-blue-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
              <TypeIcon className="w-3.5 h-3.5" /> Text
            </button>
            <button type="button" onClick={() => openPicker("IMPORT")} className="h-8 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer" title="Import a set of images and auto-arrange them">
              <Upload className="w-3.5 h-3.5" /> Import & Auto-arrange
            </button>
          </div>

          <div className="w-px h-6 bg-slate-300" />

          {/* Align */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase mr-0.5">Align</span>
            <ToolBtn onClick={() => doAlign("left")} title="Align left" disabled={selectedLayerIds.length === 0}><span className="text-[11px] font-bold">L</span></ToolBtn>
            <ToolBtn onClick={() => doAlign("hcenter")} title="Align center X" disabled={selectedLayerIds.length === 0}><span className="text-[11px] font-bold">C</span></ToolBtn>
            <ToolBtn onClick={() => doAlign("right")} title="Align right" disabled={selectedLayerIds.length === 0}><span className="text-[11px] font-bold">R</span></ToolBtn>
            <ToolBtn onClick={() => doAlign("top")} title="Align top" disabled={selectedLayerIds.length === 0}><span className="text-[11px] font-bold">T</span></ToolBtn>
            <ToolBtn onClick={() => doAlign("vcenter")} title="Align middle Y" disabled={selectedLayerIds.length === 0}><span className="text-[11px] font-bold">M</span></ToolBtn>
            <ToolBtn onClick={() => doAlign("bottom")} title="Align bottom" disabled={selectedLayerIds.length === 0}><span className="text-[11px] font-bold">B</span></ToolBtn>
            <ToolBtn onClick={() => doDistribute("h")} title="Distribute horizontally" disabled={selectedLayerIds.length < 3}><span className="text-[10px] font-bold">↔</span></ToolBtn>
            <ToolBtn onClick={() => doDistribute("v")} title="Distribute vertically" disabled={selectedLayerIds.length < 3}><span className="text-[10px] font-bold">↕</span></ToolBtn>
          </div>

          <div className="w-px h-6 bg-slate-300" />

          {/* Merge */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase mr-0.5">Merge</span>
            <button type="button" onClick={() => doConcat("row")} disabled={!multi} className="h-8 px-2.5 rounded-lg bg-white border border-slate-300 hover:border-amber-300 text-slate-700 hover:text-amber-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40" title="Concat in a row">
              <Combine className="w-3.5 h-3.5" /> Concat →
            </button>
            <button type="button" onClick={() => doConcat("col")} disabled={!multi} className="h-8 px-2 rounded-lg bg-white border border-slate-300 hover:border-amber-300 text-slate-700 hover:text-amber-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40" title="Concat in a column">
              <Combine className="w-3.5 h-3.5 rotate-90" /> Concat ↓
            </button>
            <button type="button" onClick={handleFlatten} disabled={!multi} className="h-8 px-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40" title="Flatten selected layers into one object">
              <Combine className="w-3.5 h-3.5" /> Flatten
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas */}
          <div className="flex-1 overflow-auto bg-slate-200/60">
            <StudioCanvas
              widthPx={widthPx}
              heightPx={heightPx}
              layers={layers}
              fields={[]}
              selectedLayerId={selectedLayerId}
              selectedLayerIds={selectedLayerIds}
              onSelectLayer={handleSelectLayer}
              onUpdateLayer={handleUpdateLayer}
              zoom={zoom}
              showGrid={true}
              workspaceBgColor="#ffffff"
              fonts={fonts}
              doodlePacks={[]}
            />
          </div>

          {/* Right sidebar: layers + inspector */}
          <div className="w-72 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <LayersIcon className="w-3.5 h-3.5 text-slate-500" /> Layers ({layers.length})
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sortedLayers.length === 0 ? (
                <div className="text-center text-[11px] text-slate-400 py-8">
                  Add / import images or text to start building.
                </div>
              ) : (
                sortedLayers.map((l) => {
                  const isSel = selectedLayerIds.includes(l.id);
                  return (
                    <div
                      key={l.id}
                      onClick={(e) => handleSelectLayer(l.id, e.metaKey || e.ctrlKey)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer ${
                        isSel ? "border-blue-500 bg-blue-50/60" : "border-transparent hover:bg-slate-50"
                      }`}
                    >
                      <span className="w-7 h-7 rounded bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                        {l.layerType === "TEXT" ? (
                          <TypeIcon className="w-3.5 h-3.5 text-slate-500" />
                        ) : l.properties?.assetUrl ? (
                          <img src={l.properties.assetUrl} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </span>
                      <span className="flex-1 truncate text-[11px] font-semibold text-slate-700">{l.name}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleDuplicateLayer(l.id); }} className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer" title="Duplicate">
                        <Copy className="w-3 h-3" />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteLayer(l.id); }} className="p-1 text-slate-400 hover:text-red-600 cursor-pointer" title="Delete">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Inspector */}
            {selectedLayer && (
              <div className="border-t border-slate-200 p-3 space-y-2.5 max-h-[45%] overflow-y-auto">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Properties</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-slate-500">X
                    <input type="number" value={Math.round(selectedLayer.posX)} onChange={(e) => handleUpdateLayer(selectedLayer.id, { posX: Number(e.target.value) })} className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded text-xs" />
                  </label>
                  <label className="text-[10px] text-slate-500">Y
                    <input type="number" value={Math.round(selectedLayer.posY)} onChange={(e) => handleUpdateLayer(selectedLayer.id, { posY: Number(e.target.value) })} className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded text-xs" />
                  </label>
                  <label className="text-[10px] text-slate-500">W
                    <input type="number" value={Math.round(selectedLayer.width)} onChange={(e) => handleUpdateLayer(selectedLayer.id, { width: Math.max(4, Number(e.target.value)) })} className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded text-xs" />
                  </label>
                  <label className="text-[10px] text-slate-500">H
                    <input type="number" value={Math.round(selectedLayer.height)} onChange={(e) => handleUpdateLayer(selectedLayer.id, { height: Math.max(4, Number(e.target.value)) })} className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded text-xs" />
                  </label>
                  <label className="text-[10px] text-slate-500">Rotation
                    <input type="number" value={Math.round(selectedLayer.rotation || 0)} onChange={(e) => handleUpdateLayer(selectedLayer.id, { rotation: Number(e.target.value) })} className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded text-xs" />
                  </label>
                  <label className="text-[10px] text-slate-500">Opacity
                    <input type="number" min={0} max={1} step={0.1} value={selectedLayer.properties?.opacity ?? 1} onChange={(e) => handleUpdateProps(selectedLayer.id, { opacity: Number(e.target.value) })} className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded text-xs" />
                  </label>
                </div>

                {selectedLayer.layerType === "ASSET" && (
                  <button type="button" onClick={() => openPicker("REPLACE", selectedLayer.id)} className="w-full h-8 rounded-lg border border-slate-300 hover:border-blue-300 text-xs font-bold text-slate-700 hover:text-blue-600 flex items-center justify-center gap-1.5 cursor-pointer">
                    <ImageIcon className="w-3.5 h-3.5" /> Replace image
                  </button>
                )}

                {selectedLayer.layerType === "TEXT" && (
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 block">Text
                      <input value={selectedLayer.properties?.text || ""} onChange={(e) => handleUpdateProps(selectedLayer.id, { text: e.target.value })} className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded text-xs" />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[10px] text-slate-500">Font
                        <select value={selectedLayer.properties?.fontFamily || "Roboto"} onChange={(e) => handleUpdateProps(selectedLayer.id, { fontFamily: e.target.value })} className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded text-xs">
                          {(fonts.length ? fonts : [{ family: "Roboto" } as any]).map((f) => (
                            <option key={f.family} value={f.family}>{f.family}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[10px] text-slate-500">Color
                        <input type="color" value={selectedLayer.properties?.color || "#111827"} onChange={(e) => handleUpdateProps(selectedLayer.id, { color: e.target.value })} className="w-full mt-0.5 h-7 border border-slate-200 rounded cursor-pointer" />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <MediaSelectModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiSelect={pickerMode !== "REPLACE"}
        allowedCategory="IMAGE"
        title={pickerMode === "IMPORT" ? "Import clip art set" : pickerMode === "REPLACE" ? "Replace image" : "Add image"}
        onSelect={handlePickerSelect}
      />
    </DashboardLayout>
  );
}
