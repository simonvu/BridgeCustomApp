import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  Image as ImageIcon,
  Upload,
  Check,
  MoreHorizontal,
  Download,
  ClipboardCopy,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  Save,
  Trash2,
  GitBranch,
  X,
} from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import prisma from "../db.server";
import { requireAnyPage } from "../services/team.server";
import StudioCanvas, { type CanvasLayerItem, getActiveFabricCanvas } from "../components/studio/StudioCanvas";
import StudioTopToolbar from "../components/studio/StudioTopToolbar";
import ClipArtAssetPanel from "../components/studio/ClipArtAssetPanel";
import ClipArtConditionPanel from "../components/studio/ClipArtConditionPanel";
import MediaSelectModal from "../components/MediaSelectModal";
import { injectFontStylesheets, type FontItem } from "../utils/fontLoader";
import { analyzeAndArrangeImages } from "../utils/clipArtImport";
import {
  buildMergeCombos,
  dataUrlToFile,
  rasterizePlacements,
  unionBBox,
  visibleMergeOptions,
  type MergeGroup,
} from "../utils/clipArtMerge";
import type { StudioFieldItem } from "../utils/fieldHelpers";
import { isEmptyOption, isFreeTransformField, stripOptionTransform } from "../utils/fieldHelpers";
import MergeOptionsModal, { type MergeOptionsSubmit } from "../components/studio/MergeOptionsModal";
import { autoGenerateSquareThumbnail, trimToSquareDataUrl } from "../utils/thumbnailGenerator";
import { cleanImportedName, guessGroupName, slugValue } from "../utils/optionRename";
import {
  buildClipArtInstance,
  encodeClipArtFields,
  isClipArtGroupVisible,
  parseClipArtDocument,
  pruneClipArtRules,
  rasterizeClipArtFrame,
  isClipArtGroupHiddenFromCustomer,
  type ClipArtConditionRule,
} from "../utils/clipArtInstance";

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const { currentUser } = await requireAnyPage(
    request,
    id ? ["cliparts:items:read", "cliparts:items:update"] : ["cliparts:items:create"]
  );

  const model = (prisma as any).clipArt;
  const clipart = id && model ? await model.findUnique({ where: { id } }) : null;
  const dbCategories: string[] = model
    ? Array.from(
        new Set(
          (await model.findMany({ select: { category: true } }))
            .map((c: any) => c.category)
            .filter(Boolean)
        )
      ).sort()
    : [];

  const fontModel = (prisma as any).font;
  const fonts: FontItem[] = fontModel
    ? await fontModel.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] })
    : [];

  return json({
    currentUser,
    clipart,
    dbCategories,
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

/** Visual geometry: Free size groups store pos/size on the active option, not the layer. */
function layerVisualGeom(layer: CanvasLayerItem, fieldList: StudioFieldItem[]) {
  const field = fieldList.find((f) => f.id === layer.linkedFieldId);
  if (
    isFreeTransformField(field) &&
    field?.activeOptionId &&
    layer.properties?.sandwichRole !== "front"
  ) {
    const opt = (field.config?.options || []).find((o: any) => o.id === field.activeOptionId);
    if (opt) {
      return {
        posX: opt.posX ?? layer.posX,
        posY: opt.posY ?? layer.posY,
        width: opt.width ?? layer.width,
        height: opt.height ?? layer.height,
        rotation: opt.rotation ?? layer.rotation,
        flipH: opt.flipH ?? layer.properties?.flipH,
        flipV: opt.flipV ?? layer.properties?.flipV,
      };
    }
  }
  return {
    posX: layer.posX,
    posY: layer.posY,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    flipH: layer.properties?.flipH,
    flipV: layer.properties?.flipV,
  };
}

export default function ClipArtStudioRoute() {
  const { currentUser, clipart, dbCategories, fonts } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (fonts) injectFontStylesheets(fonts);
  }, [fonts]);

  const [clipArtId, setClipArtId] = useState<string | null>(clipart?.id || searchParams.get("id") || null);
  const [name, setName] = useState(clipart?.name || "New Clip Art");
  const [category, setCategory] = useState(clipart?.category || "General");
  const [categoryList, setCategoryList] = useState<string[]>(() => {
    const set = new Set([...(dbCategories || []), clipart?.category || "General", "General"]);
    return Array.from(set).filter(Boolean).sort();
  });
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryText, setNewCategoryText] = useState("");

  const handleAddNewCategory = () => {
    const trimmed = newCategoryText.trim();
    if (trimmed) {
      if (!categoryList.includes(trimmed)) {
        setCategoryList((prev) => [...prev, trimmed].sort());
      }
      setCategory(trimmed);
      setNewCategoryText("");
    }
    setIsAddingCategory(false);
  };
  const [saveStatus, setSaveStatus] = useState<"DRAFT" | "PUBLISHED">(
    clipart?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT"
  );
  const [widthPx, setWidthPx] = useState(clipart?.widthPx || 1000);
  const [heightPx, setHeightPx] = useState(clipart?.heightPx || 1000);
  const [layers, setLayers] = useState<CanvasLayerItem[]>(() => parseLayers(clipart?.layers));
  const [fields, setFields] = useState<any[]>(() => parseClipArtDocument(clipart?.fields).fields);
  const [clipArtRules, setClipArtRules] = useState<ClipArtConditionRule[]>(
    () => parseClipArtDocument(clipart?.fields).rules
  );
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [conditionDraft, setConditionDraft] = useState<ClipArtConditionRule[]>([]);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [pngBusy, setPngBusy] = useState<"download" | "copy" | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [rightSidebarWidthPx, setRightSidebarWidthPx] = useState(420);
  const didAutoTrim = useRef(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeProgress, setMergeProgress] = useState("");

  const selectedLayerId = selectedLayerIds.length === 1 ? selectedLayerIds[0] : null;
  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId) || null,
    [layers, selectedLayerId]
  );

  const clipArtPreview = useMemo(
    () =>
      buildClipArtInstance({
        id: clipArtId || "draft",
        name,
        widthPx,
        heightPx,
        layers,
        fields: encodeClipArtFields(fields, clipArtRules),
      }),
    [clipArtId, name, widthPx, heightPx, layers, fields, clipArtRules]
  );

  const canvasLayers = useMemo(
    () =>
      layers.map((l) => {
        const groupId = l.linkedFieldId || l.id;
        const shown = isClipArtGroupVisible(groupId, clipArtPreview.groups, clipArtPreview.rules);
        return shown ? l : { ...l, isVisible: false };
      }),
    [layers, clipArtPreview]
  );

  const mergeGroups: MergeGroup[] = useMemo(() => {
    const selected = layers
      .filter((l) => selectedLayerIds.includes(l.id))
      .sort((a, b) => a.zIndex - b.zIndex);
    return selected.map((layer) => {
      const field = fields.find((f) => f.id === layer.linkedFieldId);
      const all = (field?.config?.options || []) as any[];
      const visible = all.filter((o) => o.isVisible !== false);
      const options = visibleMergeOptions(visible);
      if (options.length === 0 && layer.properties?.assetUrl) {
        options.push({
          label: layer.name,
          value: slugValue(layer.name || "option", 1),
          assetImageUrl: layer.properties.assetUrl,
          swatchImageUrl: layer.properties.assetUrl,
        });
      }
      return {
        layer: {
          id: layer.id,
          name: layer.name,
          zIndex: layer.zIndex,
          posX: layer.posX,
          posY: layer.posY,
          width: layer.width,
          height: layer.height,
          rotation: layer.rotation,
          properties: layer.properties,
        },
        options,
        hasEmpty: visible.some((o) => isEmptyOption(o)),
      };
    });
  }, [layers, fields, selectedLayerIds]);

  // ---- Undo / Redo history + unsaved-changes tracking ----
  const historyRef = useRef<any[]>([]);
  const historyIndexRef = useRef(-1);
  const savedIndexRef = useRef(0);
  const seededRef = useRef(false);
  const isUndoRedoRef = useRef(false);
  const [, forceHist] = useState(0);
  const bump = () => forceHist((n) => n + 1);

  const snapshot = () => ({
    layers: JSON.parse(JSON.stringify(layers)),
    fields: JSON.parse(JSON.stringify(fields)),
    rules: JSON.parse(JSON.stringify(clipArtRules)),
    widthPx,
    heightPx,
  });

  // Record a history entry whenever the design changes (skips undo/redo replays).
  useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true;
      historyRef.current = [snapshot()];
      historyIndexRef.current = 0;
      savedIndexRef.current = 0;
      return;
    }
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    const sliced = historyRef.current.slice(0, historyIndexRef.current + 1);
    const updated = [...sliced, snapshot()];
    // Cap history depth; keep the saved marker valid when trimming the front.
    if (updated.length > 80) {
      updated.shift();
      savedIndexRef.current = Math.max(0, savedIndexRef.current - 1);
    }
    historyRef.current = updated;
    historyIndexRef.current = updated.length - 1;
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, fields, clipArtRules, widthPx, heightPx]);

  const applySnapshot = (snap: any) => {
    isUndoRedoRef.current = true;
    setLayers(JSON.parse(JSON.stringify(snap.layers)));
    setFields(JSON.parse(JSON.stringify(snap.fields)));
    setClipArtRules(JSON.parse(JSON.stringify(snap.rules || [])));
    setWidthPx(snap.widthPx);
    setHeightPx(snap.heightPx);
    setSelectedLayerIds((prev) => prev.filter((id) => snap.layers.some((l: any) => l.id === id)));
  };

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;
  const isDirty = historyIndexRef.current !== savedIndexRef.current;

  const undo = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    applySnapshot(historyRef.current[historyIndexRef.current]);
    bump();
  };
  const redo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    applySnapshot(historyRef.current[historyIndexRef.current]);
    bump();
  };

  const markSaved = () => {
    savedIndexRef.current = historyIndexRef.current;
    bump();
  };

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const handleBack = () => {
    if (isDirty) setShowExitConfirm(true);
    else navigate("/app/cliparts");
  };

  // Warn on browser tab close / reload when there are unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // Keyboard: arrow-key nudge / delete for selected layers, plus undo/redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "textarea" || tag === "select" || t?.isContentEditable) return;
      if (tag === "input") {
        const type = (t as HTMLInputElement).type;
        if (type !== "checkbox" && type !== "radio") return;
      }

      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const cmd = isMac ? e.metaKey : e.ctrlKey;
      if (cmd && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (cmd && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      if (cmd && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedLayerIds(layers.map((l) => l.id));
        return;
      }

      if (selectedLayerIds.length === 0) return;

      if (cmd && e.key.toLowerCase() === "d") {
        e.preventDefault();
        handleDuplicateSelectedLayers();
        return;
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;
        const ids = new Set(selectedLayerIds);
        const updates = layers
          .filter((layer) => ids.has(layer.id) && !layer.isLocked)
          .map((layer) => {
            const geom = layerVisualGeom(layer, fields);
            return {
              layerId: layer.id,
              patch: { posX: geom.posX + dx, posY: geom.posY + dy },
            };
          });
        handleUpdateLayers(updates);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteSelectedLayers(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLayerIds, layers, fields]);

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

  const handleSelectLayers = (layerIds: string[]) => {
    setSelectedLayerIds(layerIds.filter(Boolean));
  };

  const handleSelectGroup = (layerId: string, mode?: { multi?: boolean; range?: boolean }) => {
    if (mode?.range) {
      const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex).map((l) => l.id);
      const anchor = selectedLayerIds[selectedLayerIds.length - 1] || selectedLayerIds[0];
      if (!anchor) {
        setSelectedLayerIds([layerId]);
        return;
      }
      const i1 = ordered.indexOf(anchor);
      const i2 = ordered.indexOf(layerId);
      if (i1 < 0 || i2 < 0) {
        setSelectedLayerIds([layerId]);
        return;
      }
      const lo = Math.min(i1, i2);
      const hi = Math.max(i1, i2);
      setSelectedLayerIds(ordered.slice(lo, hi + 1));
      return;
    }
    handleSelectLayer(layerId, Boolean(mode?.multi));
  };

  const handleFlipSelected = () => {
    const ids = new Set(selectedLayerIds);
    if (ids.size === 0) return;

    const skipFrontIds = new Set<string>();
    layers.forEach((l) => {
      const srcId = l.properties?.sandwichSourceLayerId;
      if (l.properties?.sandwichRole === "front" && srcId && ids.has(srcId) && ids.has(l.id)) {
        skipFrontIds.add(l.id);
      }
    });

    const movers = layers.filter((l) => ids.has(l.id) && !l.isLocked);
    if (movers.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    movers.forEach((l) => {
      const g = layerVisualGeom(l, fields);
      minX = Math.min(minX, g.posX);
      maxX = Math.max(maxX, g.posX + g.width);
    });
    const cx = (minX + maxX) / 2;

    const patchMap = new Map<string, { posX: number; rotation: number; flipH?: boolean }>();
    movers.forEach((l) => {
      const g = layerVisualGeom(l, fields);
      const posX = 2 * cx - g.posX - g.width;
      const rotation = -((g.rotation || 0) as number);
      if (skipFrontIds.has(l.id)) {
        patchMap.set(l.id, { posX, rotation });
        return;
      }
      patchMap.set(l.id, { posX, rotation, flipH: !Boolean(g.flipH) });
    });

    setLayers((prev) =>
      prev.map((l) => {
        const patch = patchMap.get(l.id);
        if (!patch) return l;
        return {
          ...l,
          posX: patch.posX,
          rotation: patch.rotation,
          properties:
            patch.flipH === undefined
              ? l.properties
              : { ...(l.properties || {}), flipH: patch.flipH },
        };
      })
    );
    setFields((prev) =>
      prev.map((f) => {
        const owner = layers.find((l) => l.linkedFieldId === f.id && patchMap.has(l.id));
        if (!owner || !isFreeTransformField(f) || !f.activeOptionId) return f;
        const patch = patchMap.get(owner.id);
        if (!patch) return f;
        return {
          ...f,
          config: {
            ...(f.config || {}),
            options: (f.config?.options || []).map((o: any) =>
              o.id === f.activeOptionId
                ? {
                    ...o,
                    posX: patch.posX,
                    rotation: patch.rotation,
                    ...(patch.flipH === undefined ? {} : { flipH: patch.flipH }),
                  }
                : o
            ),
          },
        };
      })
    );
  };

  const handleUpdateLayers = (
    updates: { layerId: string; patch: Partial<CanvasLayerItem> }[],
    opts?: { persistOptionGeom?: boolean }
  ) => {
    if (updates.length === 0) return;
    const persistOptionGeom = opts?.persistOptionGeom !== false;
    const patchMap = new Map(updates.map((u) => [u.layerId, u.patch]));
    const geomTouched = (patch: Partial<CanvasLayerItem>) =>
      patch.posX !== undefined ||
      patch.posY !== undefined ||
      patch.width !== undefined ||
      patch.height !== undefined ||
      patch.rotation !== undefined ||
      patch.properties?.flipH !== undefined ||
      patch.properties?.flipV !== undefined;

    setLayers((prev) => {
      const merged = prev.map((l) => {
        const patch = patchMap.get(l.id);
        if (!patch) return l;
        const next = { ...l, ...patch };
        if (patch.properties) {
          next.properties = { ...(l.properties || {}), ...patch.properties };
        }
        return next;
      });
      return merged.map((l) => {
        const srcId = l.properties?.sandwichSourceLayerId;
        if (!srcId || !patchMap.has(srcId)) return l;
        const src = merged.find((s) => s.id === srcId);
        if (!src) return l;
        return {
          ...l,
          posX: src.posX,
          posY: src.posY,
          width: src.width,
          height: src.height,
          rotation: src.rotation,
          properties: {
            ...(l.properties || {}),
            assetUrl: src.properties?.assetUrl,
            flipH: src.properties?.flipH,
            flipV: src.properties?.flipV,
            opacity: src.properties?.opacity,
          },
        };
      });
    });

    if (!persistOptionGeom) return;

    setFields((prevFields) =>
      prevFields.map((f) => {
        if (!isFreeTransformField(f) || !f.activeOptionId) return f;
        const owner = layers.find((l) => l.linkedFieldId === f.id && patchMap.has(l.id));
        if (!owner || owner.properties?.sandwichRole === "front") return f;
        const patch = patchMap.get(owner.id);
        if (!patch || !geomTouched(patch)) return f;
        const merged = {
          ...owner,
          ...patch,
          properties: patch.properties
            ? { ...(owner.properties || {}), ...patch.properties }
            : owner.properties,
        };
        return {
          ...f,
          config: {
            ...(f.config || {}),
            options: (f.config?.options || []).map((o: any) => {
              if (o.id !== f.activeOptionId) return o;
              const next = { ...o };
              if (patch.posX !== undefined) next.posX = merged.posX;
              if (patch.posY !== undefined) next.posY = merged.posY;
              if (patch.width !== undefined) next.width = merged.width;
              if (patch.height !== undefined) next.height = merged.height;
              if (patch.rotation !== undefined) next.rotation = merged.rotation;
              if (patch.properties?.flipH !== undefined) next.flipH = merged.properties?.flipH;
              if (patch.properties?.flipV !== undefined) next.flipV = merged.properties?.flipV;
              return next;
            }),
          },
        };
      })
    );
  };

  const handleUpdateLayer = (
    layerId: string,
    patch: Partial<CanvasLayerItem>,
    opts?: { persistOptionGeom?: boolean }
  ) => {
    handleUpdateLayers([{ layerId, patch }], opts);
  };

  const handleUpdateProps = (layerId: string, propsPatch: Record<string, any>) => {
    handleUpdateLayer(layerId, { properties: propsPatch } as Partial<CanvasLayerItem>);
  };

  const handleDeleteLayer = (layerId: string) => {
    handleDeleteSelectedLayers(false, [layerId]);
  };

  const handleDeleteSelectedLayers = (confirm = true, explicitIds?: string[]) => {
    const ids = new Set(explicitIds || selectedLayerIds);
    if (ids.size === 0) return;
    if (confirm && ids.size > 1 && !window.confirm(`Delete ${ids.size} selected groups?`)) return;

    layers.forEach((l) => {
      if (ids.has(l.id) && l.properties?.sandwichRole !== "front") {
        layers.forEach((other) => {
          if (other.properties?.sandwichSourceLayerId === l.id) ids.add(other.id);
        });
      }
    });
    const remaining = layers.filter((l) => !ids.has(l.id));
    const remainingIds = remaining.map((l) => l.linkedFieldId || l.id);
    const removedFieldIds = layers
      .filter((l) => ids.has(l.id) && l.linkedFieldId)
      .map((l) => l.linkedFieldId as string)
      .filter((fid) => !remaining.some((l) => l.linkedFieldId === fid));
    setLayers(remaining);
    if (removedFieldIds.length > 0) {
      setFields((prev) => prev.filter((f) => !removedFieldIds.includes(f.id)));
    }
    setClipArtRules((prev) => pruneClipArtRules(prev, remainingIds));
    setSelectedLayerIds((prev) => prev.filter((id) => !ids.has(id)));
  };

  const handleDuplicateLayer = (layerId: string) => {
    handleDuplicateSelectedLayers([layerId]);
  };

  const handleDuplicateSelectedLayers = (explicitIds?: string[]) => {
    const selected = layers
      .filter((l) => (explicitIds || selectedLayerIds).includes(l.id))
      .sort((a, b) => a.zIndex - b.zIndex);
    if (selected.length === 0) return;

    let z = nextZ();
    const stamp = Date.now();
    const newFields: any[] = [];
    const copies: CanvasLayerItem[] = [];

    selected.forEach((src, i) => {
      const rnd = Math.random().toString(36).slice(2, 6);
      let newLinkedFieldId = src.linkedFieldId;
      if (src.linkedFieldId) {
        const srcField = fields.find((f) => f.id === src.linkedFieldId);
        if (srcField) {
          const newFieldId = `field_${stamp}_${i}_${rnd}`;
          const srcOpts = srcField.config?.options || [];
          const options = srcOpts.map((o: any, oi: number) => ({
            ...o,
            id: `opt_${stamp}_${i}_${oi}_${rnd}`,
            value: `${o.value || "v"}_copy_${rnd}`,
          }));
          const srcActiveIdx = srcOpts.findIndex((o: any) => o.id === srcField.activeOptionId);
          const activeOptionId = (srcActiveIdx >= 0 ? options[srcActiveIdx]?.id : options[0]?.id) as string | undefined;
          newFields.push({
            ...srcField,
            id: newFieldId,
            label: `${srcField.label || src.name} (Copy)`,
            sortOrder: fields.length + newFields.length,
            activeOptionId,
            config: { ...(srcField.config || {}), options },
          });
          newLinkedFieldId = newFieldId;
        }
      }
      copies.push({
        ...src,
        id: `layer_${stamp}_${i}_${rnd}`,
        name: `${src.name} (Copy)`,
        posX: src.posX + 20,
        posY: src.posY + 20,
        zIndex: z++,
        linkedFieldId: newLinkedFieldId,
        properties: JSON.parse(JSON.stringify(src.properties || {})),
      });
    });

    if (newFields.length > 0) setFields((prev) => [...prev, ...newFields]);
    setLayers((prev) => [...prev, ...copies]);
    setSelectedLayerIds(copies.map((c) => c.id));
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

  const handlePreviewOptionChoice = (fieldId: string, option: any, select = true) => {
    const linkedLayers = layers.filter((l) => l.linkedFieldId === fieldId);
    if (linkedLayers.length === 0) return;
    const empty = Boolean(option?.isEmpty);
    linkedLayers.forEach((linkedLayer, i) => {
      const updatedProps: Partial<CanvasLayerItem> = {
        properties: {
          ...(linkedLayer.properties || {}),
          assetUrl: empty ? "" : option.assetImageUrl || "",
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
      if (option.flipH !== undefined) {
        updatedProps.properties = { ...updatedProps.properties, flipH: Boolean(option.flipH) };
      }
      if (option.flipV !== undefined) {
        updatedProps.properties = { ...updatedProps.properties, flipV: Boolean(option.flipV) };
      }
      handleUpdateLayer(linkedLayer.id, updatedProps, { persistOptionGeom: false });
      if (select && i === 0 && linkedLayer.properties?.sandwichRole !== "front") {
        setSelectedLayerIds([linkedLayer.id]);
      }
    });
  };

  const handleAddSandwichFront = (layerId: string) => {
    const src = layers.find((l) => l.id === layerId);
    if (!src || src.properties?.sandwichRole === "front") return;
    if (layers.some((l) => l.properties?.sandwichSourceLayerId === src.id)) return;
    const stamp = Date.now();
    const rnd = Math.random().toString(36).slice(2, 6);
    const knockoutGroupIds = fields
      .filter(
        (f) =>
          f.id !== src.linkedFieldId &&
          (f.hiddenFromCustomer || f.allowPersonalized === false)
      )
      .map((f) => f.id);
    const copy: CanvasLayerItem = {
      ...src,
      id: `layer_${stamp}_front_${rnd}`,
      name: `${src.name} (front)`,
      zIndex: nextZ(),
      linkedFieldId: src.linkedFieldId,
      properties: {
        ...(src.properties || {}),
        sandwichRole: "front",
        sandwichSourceLayerId: src.id,
        sandwichOfGroupId: src.linkedFieldId || src.id,
        knockoutGroupIds,
      },
    };
    setLayers((prev) => [...prev, copy]);
    setSelectedLayerIds([copy.id]);
  };

  const applyDrivenOptions = (nextFields: any[]) => {
    const inst = buildClipArtInstance({
      id: clipArtId || "draft",
      name,
      widthPx,
      heightPx,
      layers,
      fields: encodeClipArtFields(nextFields, clipArtRules),
    });
    const updates: { fieldId: string; option: any }[] = [];
    inst.groups.forEach((g) => {
      if (!isClipArtGroupHiddenFromCustomer(g)) return;
      const field = nextFields.find((f) => f.id === g.id);
      if (!field || field.activeOptionId === g.activeOptionId) return;
      const opt = (field.config?.options || []).find((o: any) => o.id === g.activeOptionId);
      if (opt) updates.push({ fieldId: g.id, option: opt });
    });
    if (updates.length === 0) return;
    setFields((prev) =>
      prev.map((f) => {
        const u = updates.find((x) => x.fieldId === f.id);
        return u ? { ...f, activeOptionId: u.option.id } : f;
      })
    );
    setLayers((prev) =>
      prev.map((layer) => {
        const u = updates.find((x) => x.fieldId === layer.linkedFieldId);
        if (!u) return layer;
        const option = u.option;
        const empty = Boolean(option?.isEmpty);
        return {
          ...layer,
          ...(option.posX !== undefined ? { posX: option.posX } : {}),
          ...(option.posY !== undefined ? { posY: option.posY } : {}),
          ...(option.width !== undefined ? { width: option.width } : {}),
          ...(option.height !== undefined ? { height: option.height } : {}),
          ...(option.rotation !== undefined ? { rotation: option.rotation } : {}),
          properties: {
            ...(layer.properties || {}),
            assetUrl: empty ? "" : option.assetImageUrl || "",
            ...(option.opacity !== undefined ? { opacity: Number(option.opacity) } : {}),
          },
        };
      })
    );
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
      value: slugValue(layer.name || "option_1", 1),
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
        isRequired: true,
        allowPersonalized: true,
        activeOptionId: opt.id,
        config: { options: [opt] },
      },
    ]);
    handleUpdateLayer(layerId, { linkedFieldId: fieldId });
    if (url) {
      void makeSquareThumb(url).then((swatch) => {
        if (!swatch || swatch === url) return;
        setFields((prev) =>
          prev.map((f) => {
            if (f.id !== fieldId) return f;
            const options = (f.config?.options || []).map((o: any) =>
              o.id === opt.id ? { ...o, swatchImageUrl: swatch } : o
            );
            return { ...f, config: { ...(f.config || {}), options } };
          })
        );
      });
    }
    return fieldId;
  };

  const handleAddVariants = (layerId: string) => {
    const fieldId = ensureOptionGroup(layerId);
    if (fieldId) handleOpenMediaPickerForBatchOptions(fieldId);
  };

  const handleAddEmptyOption = (layerId: string) => {
    const fieldId = ensureOptionGroup(layerId);
    if (!fieldId) return;
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f;
        const options = f.config?.options || [];
        if (options.some((o: any) => o.isEmpty)) return f;
        const empty = {
          id: `opt_empty_${Date.now()}`,
          label: "None",
          value: "none",
          assetImageUrl: "",
          swatchImageUrl: "",
          isEmpty: true,
          isVisible: true,
        };
        return { ...f, config: { ...(f.config || {}), options: [...options, empty] } };
      })
    );
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

  const measureImage = (url: string): Promise<{ natW: number; natH: number }> =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve({ natW: img.naturalWidth || 300, natH: img.naturalHeight || 300 });
      img.onerror = () => resolve({ natW: 300, natH: 300 });
      img.src = url;
    });

  const fitToCanvas = (natW: number, natH: number) => {
    const maxDim = Math.min(widthPx, heightPx) * 0.6;
    const scale = Math.min(maxDim / Math.max(1, natW), maxDim / Math.max(1, natH), 1);
    const width = Math.max(20, Math.round(natW * scale));
    const height = Math.max(20, Math.round(natH * scale));
    return {
      posX: Math.round((widthPx - width) / 2),
      posY: Math.round((heightPx - height) / 2),
      width,
      height,
      rotation: 0,
    };
  };

  const keepCenter = (
    box: { posX: number; posY: number; width: number; height: number },
    fitted: { width: number; height: number; rotation?: number }
  ) => ({
    width: fitted.width,
    height: fitted.height,
    rotation: fitted.rotation ?? 0,
    posX: Math.round(box.posX + box.width / 2 - fitted.width / 2),
    posY: Math.round(box.posY + box.height / 2 - fitted.height / 2),
  });

  const handleToggleFreeTransform = async (fieldId: string, enabled: boolean) => {
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;
    const layer =
      layers.find((l) => l.linkedFieldId === fieldId && l.properties?.sandwichRole !== "front") ||
      layers.find((l) => l.linkedFieldId === fieldId);
    if (!enabled) {
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== fieldId) return f;
          const options = (f.config?.options || []).map((o: any) => stripOptionTransform(o));
          return { ...f, config: { ...(f.config || {}), options, freeTransform: false } };
        })
      );
      return;
    }
    setStatusMsg("Measuring option sizes…");
    const seeded = await mapPool(field.config?.options || [], 4, async (o: any) => {
      if (o.isEmpty) return o;
      if (o.posX !== undefined && o.width !== undefined && o.height !== undefined) return o;
      const isActive = o.id === field.activeOptionId;
      if (isActive && layer) {
        return {
          ...o,
          posX: layer.posX,
          posY: layer.posY,
          width: layer.width,
          height: layer.height,
          rotation: layer.rotation || 0,
          flipH: layer.properties?.flipH,
          flipV: layer.properties?.flipV,
        };
      }
      const url = o.assetImageUrl || o.swatchImageUrl;
      if (!url) {
        return layer
          ? {
              ...o,
              posX: layer.posX,
              posY: layer.posY,
              width: layer.width,
              height: layer.height,
              rotation: layer.rotation || 0,
              flipH: layer.properties?.flipH,
              flipV: layer.properties?.flipV,
            }
          : o;
      }
      const { natW, natH } = await measureImage(url);
      return { ...o, ...fitToCanvas(natW, natH) };
    });
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId ? { ...f, config: { ...(f.config || {}), options: seeded, freeTransform: true } } : f
      )
    );
    setStatusMsg("");
  };

  const uploadDataUrl = async (
    dataUrl: string,
    fileName: string,
    opts?: { key?: string; skipLibrary?: boolean }
  ): Promise<{ url: string; key: string } | null> => {
    try {
      const file = dataUrlToFile(dataUrl, fileName);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "cliparts");
      if (opts?.key) fd.append("key", opts.key);
      if (opts?.skipLibrary) fd.append("skipLibrary", "1");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success && data.url) return { url: data.url, key: data.key || opts?.key || fileName };
    } catch (e) {
      console.error("Upload failed", e);
    }
    return null;
  };

  const makeSquareThumb = async (url: string): Promise<string> => {
    if (!url) return "";
    try {
      const dataUrl = await autoGenerateSquareThumbnail(url, 256);
      if (!dataUrl || dataUrl.startsWith("data:")) return url;
      return dataUrl;
    } catch {
      return url;
    }
  };

  const filesToVariants = async (files: any[], attachGeom = false) =>
    mapPool(files, 4, async (f, i) => {
      const url = f.url || f.thumbnailUrl;
      const label = cleanImportedName(f.fileName, `Option ${i + 1}`);
      const measured = attachGeom ? await measureImage(url) : null;
      const geom = measured ? fitToCanvas(measured.natW, measured.natH) : {};
      return {
        id: `opt_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        label,
        value: slugValue(label, i + 1),
        assetImageUrl: url,
        swatchImageUrl: (await makeSquareThumb(url)) || url,
        isVisible: true,
        ...geom,
      };
    });

  const handleRenameOption = (fieldId: string, optId: string, name: string) => {
    const label = name.trim();
    if (!label) return;
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f;
        const options = (f.config?.options || []).map((o: any, i: number) =>
          o.id === optId ? { ...o, label, value: slugValue(label, i + 1) } : o
        );
        return { ...f, config: { ...(f.config || {}), options } };
      })
    );
  };

  const handleReorderOptions = (fieldId: string, options: any[]) => {
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, config: { ...(f.config || {}), options } } : f))
    );
  };

  const handleBulkRenameOptions = (fieldId: string, updates: { id: string; label: string }[]) => {
    const byId = new Map(updates.map((u) => [u.id, u.label]));
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f;
        const options = (f.config?.options || []).map((o: any, i: number) => {
          const label = byId.get(o.id);
          return label ? { ...o, label, value: slugValue(label, i + 1) } : o;
        });
        return { ...f, config: { ...(f.config || {}), options } };
      })
    );
  };

  const handleRegenerateThumbs = async (fieldId: string, sourceOpts?: any[]) => {
    const source = sourceOpts || fields.find((f) => f.id === fieldId)?.config?.options || [];
    if (source.length === 0) return;
    setStatusMsg("Trimming thumbnails…");
    const options = await mapPool(source, 4, async (o: any) => {
      if (o.isEmpty) return o;
      const src = o.assetImageUrl || o.swatchImageUrl;
      const swatch = src ? await makeSquareThumb(src) : o.swatchImageUrl;
      return { ...o, swatchImageUrl: swatch || o.swatchImageUrl };
    });
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, config: { ...(f.config || {}), options } } : f))
    );
    setStatusMsg("Thumbnails updated.");
    setTimeout(() => setStatusMsg(""), 2500);
  };

  useEffect(() => {
    const storageKey = `clipart-swatch-trim-v3-${clipArtId || "draft"}`;
    try {
      if (sessionStorage.getItem(storageKey)) return;
    } catch {
      if (didAutoTrim.current) return;
    }
    const pending = fields.filter((f) => (f.config?.options || []).length > 0);
    if (pending.length === 0) return;
    const needsTrim = pending.some((f) =>
      (f.config?.options || []).some((o: any) => !o.isEmpty && o.assetImageUrl && !o.swatchImageUrl)
    );
    didAutoTrim.current = true;
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    if (!needsTrim) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void (async () => {
        for (const f of pending) {
          await handleRegenerateThumbs(f.id, f.config?.options || []);
        }
      })();
    };
    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(run, { timeout: 2500 })
        : 0;
    const timeoutId = idleId ? 0 : window.setTimeout(run, 600);
    return () => {
      cancelled = true;
      if (idleId && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) window.clearTimeout(timeoutId);
    };
    // one-shot per clip art after the server-side trim shipped
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, clipArtId]);

  // Create an Option Group: a FIELD_ASSET field (variants) + one linked slot layer.
  const createOptionGroup = async (files: any[]) => {
    if (!files || files.length === 0) return;
    setStatusMsg("Preparing options…");
    const options = await filesToVariants(files);
    const groupCount = fields.filter((f) => f.fieldType === "FIELD_ASSET").length;
    const label = guessGroupName(options.map((o) => o.label)) || `Option Group ${groupCount + 1}`;
    const fieldId = `field_${Date.now()}`;

    const first = files[0];
    const { natW, natH } = await measureImage(first.url || first.thumbnailUrl);
    const { posX, posY, width: w, height: h } = fitToCanvas(natW, natH);

    const layer: CanvasLayerItem = {
      id: `layer_${Date.now()}_grp`,
      name: label,
      layerType: "ASSET",
      zIndex: nextZ(),
      posX,
      posY,
      width: w,
      height: h,
      rotation: 0,
      isVisible: true,
      isLocked: false,
      linkedFieldId: fieldId,
      properties: { assetUrl: options[0].assetImageUrl, opacity: 1, naturalWidth: natW, naturalHeight: natH },
    };

    setFields((prev) => [
      ...prev,
      {
        id: fieldId,
        label: label || "Option Group",
        fieldType: "FIELD_ASSET",
        displayType: "THUMBNAIL",
        sortOrder: fields.length,
        isRequired: true,
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

  const addVariantsToGroup = async (fieldId: string, files: any[]) => {
    setStatusMsg("Preparing variants…");
    const field = fields.find((f) => f.id === fieldId);
    const newOpts = await filesToVariants(files, isFreeTransformField(field));
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f;
        const options = [...(f.config?.options || [])];
        const emptyIdx = options.findIndex((o: any) => o.isEmpty);
        if (emptyIdx >= 0) options.splice(emptyIdx, 0, ...newOpts);
        else options.push(...newOpts);
        return { ...f, config: { ...(f.config || {}), options } };
      })
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
      const swatch = await makeSquareThumb(url);
      const { natW, natH } = await measureImage(url);
      const field = layer?.linkedFieldId ? fields.find((f) => f.id === layer.linkedFieldId) : undefined;
      const geom =
        field && isFreeTransformField(field) && layer
          ? keepCenter(layer, fitToCanvas(natW, natH))
          : null;
      handleUpdateLayer(target.layerId, {
        ...(geom || {}),
        properties: { assetUrl: url, naturalWidth: natW, naturalHeight: natH },
      });
      if (layer?.linkedFieldId) {
        setFields((prev) =>
          prev.map((f) => {
            if (f.id !== layer.linkedFieldId) return f;
            const options = (f.config?.options || []).map((o: any) =>
              o.id === f.activeOptionId
                ? { ...o, assetImageUrl: url, swatchImageUrl: swatch || url, ...(geom || {}) }
                : o
            );
            return { ...f, config: { ...(f.config || {}), options } };
          })
        );
      }
      return;
    }

    if (target.type === "OPTION" && target.fieldId != null && target.optionIndex != null) {
      const url = files[0].url || files[0].thumbnailUrl;
      const fileName = files[0].fileName as string | undefined;
      const swatch = await makeSquareThumb(url);
      const field = fields.find((f) => f.id === target.fieldId);
      const current = field?.config?.options?.[target.optionIndex];
      let geom: { posX: number; posY: number; width: number; height: number; rotation: number } | null = null;
      if (field && isFreeTransformField(field) && target.optionTargetType !== "SWATCH") {
        const { natW, natH } = await measureImage(url);
        const fitted = fitToCanvas(natW, natH);
        const layer = layers.find(
          (l) => l.linkedFieldId === field.id && l.properties?.sandwichRole !== "front"
        );
        const box =
          current?.posX !== undefined && current?.width !== undefined
            ? { posX: current.posX, posY: current.posY, width: current.width, height: current.height }
            : layer;
        geom = box ? keepCenter(box, fitted) : fitted;
      }
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== target.fieldId) return f;
          const options = [...(f.config?.options || [])];
          if (!options[target.optionIndex!]) return f;
          const cur = options[target.optionIndex!];
          const nextLabel = fileName ? cleanImportedName(fileName, cur.label || "Option") : cur.label;
          options[target.optionIndex!] = {
            ...cur,
            ...(target.optionTargetType === "SWATCH"
              ? { swatchImageUrl: swatch || url }
              : {
                  assetImageUrl: url,
                  swatchImageUrl: swatch || url,
                  label: nextLabel,
                  value: slugValue(nextLabel || cur.label || "option", target.optionIndex! + 1),
                  ...(geom || {}),
                }),
          };
          return { ...f, config: { ...(f.config || {}), options } };
        })
      );
      const opt = field?.config?.options?.[target.optionIndex];
      if (opt && target.optionTargetType !== "SWATCH") {
        handlePreviewOptionChoice(target.fieldId, { ...opt, assetImageUrl: url, ...(geom || {}) });
      }
      return;
    }

    if (target.type === "BATCH_OPTIONS" && target.fieldId) {
      await addVariantsToGroup(target.fieldId, files);
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

  const openMergeModal = () => {
    if (selectedLayerIds.length < 2) {
      setStatusMsg("Select 2+ layers to merge.");
      setTimeout(() => setStatusMsg(""), 2500);
      return;
    }
    setMergeProgress("");
    setMergeOpen(true);
  };

  const handleMergeOptions = async (payload: MergeOptionsSubmit) => {
    const groups = mergeGroups;
    if (groups.length < 2) {
      setMergeOpen(false);
      return;
    }

    const combos = buildMergeCombos(groups, payload.mergeType, {
      useFirstOption: payload.useFirstOption,
      newOptionName: payload.newOptionName,
    });
    if (combos.length === 0) {
      setStatusMsg("Nothing to merge.");
      setTimeout(() => setStatusMsg(""), 2500);
      setMergeOpen(false);
      return;
    }

    setMergeBusy(true);
    const stamp = Date.now();
    const fieldId = `field_${stamp}_merged`;
    const targetIds = groups.map((g) => g.layer.id);
    const removedFieldIds = groups
      .map((g) => layers.find((l) => l.id === g.layer.id)?.linkedFieldId)
      .filter(Boolean) as string[];
    const allPlacements = combos.flatMap((c) => c.placements);
    const bbox =
      allPlacements.length > 0
        ? unionBBox(allPlacements)
        : { minX: groups[0].layer.posX, minY: groups[0].layer.posY, width: groups[0].layer.width, height: groups[0].layer.height };

    try {
      let done = 0;
      const built = await mapPool(combos, 3, async (combo, i) => {
        let url = combo.sourceOptions[0]?.assetImageUrl || combo.placements[0]?.url || "";
        if (payload.mergeType !== "concat") {
          const dataUrl = await rasterizePlacements(combo.placements);
          if (!dataUrl) throw new Error("Rasterize failed");
          const uploaded = await uploadDataUrl(dataUrl, `clipart_merge_${stamp}_${i}.png`);
          url = uploaded?.url || dataUrl;
        }
        const swatch = url ? await makeSquareThumb(url) : "";
        done += 1;
        setMergeProgress(`Merging ${done} / ${combos.length}…`);
        const first = combo.placements[0];
        return {
          id: `opt_${stamp}_${i}`,
          label: combo.label || `Option ${i + 1}`,
          value: slugValue(combo.label || `option_${i + 1}`, i + 1),
          assetImageUrl: url,
          swatchImageUrl: swatch || url,
          isVisible: true,
          posX: payload.mergeType === "concat" ? first.posX : bbox.minX,
          posY: payload.mergeType === "concat" ? first.posY : bbox.minY,
          width: payload.mergeType === "concat" ? first.width : bbox.width,
          height: payload.mergeType === "concat" ? first.height : bbox.height,
        };
      });

      if (groups.some((g) => g.hasEmpty)) {
        built.push({
          id: `opt_empty_${stamp}`,
          label: "None",
          value: "none",
          assetImageUrl: "",
          swatchImageUrl: "",
          isVisible: true,
          isEmpty: true,
        } as any);
      }

      const firstOpt = built.find((o) => !(o as any).isEmpty) || built[0];
      const layerGeom =
        payload.mergeType === "concat" && firstOpt
          ? {
              posX: firstOpt.posX ?? bbox.minX,
              posY: firstOpt.posY ?? bbox.minY,
              width: firstOpt.width ?? bbox.width,
              height: firstOpt.height ?? bbox.height,
            }
          : { posX: bbox.minX, posY: bbox.minY, width: bbox.width, height: bbox.height };

      const flatLayer: CanvasLayerItem = {
        id: `layer_${stamp}_flat`,
        name: payload.fieldName,
        layerType: "ASSET",
        zIndex: Math.max(...groups.map((g) => g.layer.zIndex)),
        posX: Math.round(layerGeom.posX),
        posY: Math.round(layerGeom.posY),
        width: Math.max(1, Math.round(layerGeom.width)),
        height: Math.max(1, Math.round(layerGeom.height)),
        rotation: 0,
        isVisible: true,
        isLocked: false,
        linkedFieldId: fieldId,
        properties: {
          assetUrl: firstOpt?.assetImageUrl || "",
          opacity: 1,
          naturalWidth: layerGeom.width,
          naturalHeight: layerGeom.height,
          aspectRatio: layerGeom.width / Math.max(1, layerGeom.height),
        },
      };

      setFields((prev) => [
        ...prev.filter((f) => !removedFieldIds.includes(f.id)),
        {
          id: fieldId,
          label: payload.fieldName,
          fieldType: "FIELD_ASSET",
          displayType: "THUMBNAIL",
          sortOrder: prev.length,
          isRequired: true,
          allowPersonalized: true,
          activeOptionId: firstOpt?.id,
          config: { options: built },
        },
      ]);
      setLayers((prev) => [...prev.filter((l) => !targetIds.includes(l.id)), flatLayer]);
      setSelectedLayerIds([flatLayer.id]);
      setMergeOpen(false);
      setStatusMsg(`Merged ${combos.length} options into “${payload.fieldName}”.`);
      setTimeout(() => setStatusMsg(""), 3000);
    } catch (e) {
      console.error("Merge options failed", e);
      setStatusMsg("Merge failed.");
      setTimeout(() => setStatusMsg(""), 2500);
    } finally {
      setMergeBusy(false);
      setMergeProgress("");
    }
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
      let compositeDataUrl = exportComposite(1);
      if (!compositeDataUrl) {
        try {
          compositeDataUrl = await rasterizeClipArtFrame(
            buildClipArtInstance({
              id: clipArtId || "draft",
              name,
              widthPx,
              heightPx,
              layers,
              fields: encodeClipArtFields(fields, clipArtRules),
            })
          );
        } catch (e) {
          console.warn("Clip art raster fallback failed", e);
        }
      }

      let compositeUrl = "";
      let compositeKey = "";
      let thumbnailUrl = "";
      const previewId = clipArtId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `clip_${Date.now()}`);
      if (compositeDataUrl) {
        const bust = Date.now();
        const up = await uploadDataUrl(compositeDataUrl, "composite.png", {
          key: `cliparts/_generated/${previewId}/composite.png`,
          skipLibrary: true,
        });
        if (up) {
          compositeUrl = `${up.url}${up.url.includes("?") ? "&" : "?"}v=${bust}`;
          compositeKey = up.key;
        }
        try {
          const trimmed = await trimToSquareDataUrl(compositeDataUrl, 400);
          if (trimmed.startsWith("data:")) {
            const upt = await uploadDataUrl(trimmed, "thumb.png", {
              key: `cliparts/_generated/${previewId}/thumb.png`,
              skipLibrary: true,
            });
            thumbnailUrl = upt?.url ? `${upt.url}${upt.url.includes("?") ? "&" : "?"}v=${bust}` : "";
          }
        } catch (e) {
          console.warn("Trimmed clip art thumb failed", e);
        }
      }

      const res = await fetch("/api/cliparts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "SAVE",
          id: previewId,
          name,
          category,
          widthPx,
          heightPx,
          layers,
          fields: encodeClipArtFields(fields, clipArtRules),
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
        markSaved();
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

  const getScreenPngDataUrl = async (): Promise<string> => {
    let dataUrl = exportComposite(1);
    if (!dataUrl) {
      try {
        dataUrl = await rasterizeClipArtFrame(
          buildClipArtInstance({
            id: clipArtId || "draft",
            name,
            widthPx,
            heightPx,
            layers,
            fields: encodeClipArtFields(fields, clipArtRules),
          })
        );
      } catch (e) {
        console.warn("PNG export fallback failed", e);
      }
    }
    return dataUrl || "";
  };

  const handleDownload = async () => {
    setPngBusy("download");
    try {
      const dataUrl = await getScreenPngDataUrl();
      if (!dataUrl) {
        setStatusMsg("Nothing to download yet.");
        setTimeout(() => setStatusMsg(""), 2000);
        return;
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${name || "clipart"}.png`;
      a.click();
    } catch (e) {
      console.error("Download PNG failed", e);
      setStatusMsg("Download PNG failed.");
      setTimeout(() => setStatusMsg(""), 2000);
    } finally {
      setPngBusy(null);
    }
  };

  const handleCopyPng = async () => {
    setPngBusy("copy");
    try {
      const dataUrl = await getScreenPngDataUrl();
      if (!dataUrl) {
        setStatusMsg("Nothing to copy yet.");
        setTimeout(() => setStatusMsg(""), 2000);
        return;
      }
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
        setStatusMsg("Clipboard PNG is not supported in this browser.");
        setTimeout(() => setStatusMsg(""), 2500);
        return;
      }
      const file = dataUrlToFile(dataUrl, `${name || "clipart"}.png`);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
      setStatusMsg("Copied PNG to clipboard.");
      setTimeout(() => setStatusMsg(""), 2000);
    } catch (e) {
      console.error("Copy PNG failed", e);
      setStatusMsg("Copy PNG failed. Try Download instead.");
      setTimeout(() => setStatusMsg(""), 2500);
    } finally {
      setPngBusy(null);
    }
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
                onClick={undo}
                disabled={!canUndo}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Undo (Ctrl/Cmd + Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Redo (Ctrl/Cmd + Shift + Z)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
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
              onClick={handleDownload}
              disabled={pngBusy !== null}
              className="h-8 w-8 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 flex items-center justify-center transition cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
              title="Download current screen as PNG"
            >
              {pngBusy === "download" ? (
                <span className="w-3.5 h-3.5 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-emerald-700" />
              )}
            </button>
            <button
              type="button"
              onClick={handleCopyPng}
              disabled={pngBusy !== null}
              className="h-8 w-8 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 flex items-center justify-center transition cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
              title="Copy current screen as PNG"
            >
              {pngBusy === "copy" ? (
                <span className="w-3.5 h-3.5 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin" />
              ) : (
                <ClipboardCopy className="w-4 h-4 text-indigo-700" />
              )}
            </button>
            <button
              type="button"
              onClick={handleBack}
              className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer flex items-center gap-1.5"
            >
              {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved changes" />}
              Close
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
                      openMergeModal();
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
              selectedCount={selectedLayerIds.length}
              fields={fields}
              fonts={fonts}
              onUpdateLayer={handleUpdateLayer}
              onUpdateField={handleUpdateField}
              onOpenMediaPickerForLayer={handleOpenMediaPickerForLayer}
              onFlipSelected={handleFlipSelected}
              onMergeSelected={openMergeModal}
              onDuplicateSelected={() => handleDuplicateSelectedLayers()}
              onDeleteSelected={() => handleDeleteSelectedLayers(true)}
              lockOptionGeometry={
                Boolean(selectedLayer?.linkedFieldId) &&
                !isFreeTransformField(fields.find((f) => f.id === selectedLayer?.linkedFieldId))
              }
            />
            <div className="flex-1 relative overflow-auto">
              <StudioCanvas
                widthPx={widthPx}
                heightPx={heightPx}
                layers={canvasLayers}
                fields={fields}
                selectedLayerId={selectedLayerId}
                selectedLayerIds={selectedLayerIds}
                onSelectLayer={handleSelectLayer}
                onSelectLayers={handleSelectLayers}
                onUpdateLayer={handleUpdateLayer}
                onUpdateLayers={handleUpdateLayers}
                onUpdateField={handleUpdateField}
                zoom={zoom}
                showGrid={true}
                workspaceBgColor="#ffffff"
                fonts={fonts}
                doodlePacks={[]}
                useOptionGeometry="whenFree"
                onResizeCanvas={(w, h) => {
                  setWidthPx(w);
                  setHeightPx(h);
                }}
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
              {isAddingCategory ? (
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="text"
                    autoFocus
                    value={newCategoryText}
                    onChange={(e) => setNewCategoryText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddNewCategory();
                      if (e.key === "Escape") {
                        setIsAddingCategory(false);
                        setNewCategoryText("");
                      }
                    }}
                    placeholder="New category"
                    title="New category name"
                    className="h-7 w-28 px-2 rounded-md border border-blue-500 text-[11px] font-medium text-slate-700 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddNewCategory}
                    className="h-7 px-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <select
                  value={categoryList.includes(category) ? category : category || "General"}
                  onChange={(e) => {
                    if (e.target.value === "__ADD_NEW__") {
                      setIsAddingCategory(true);
                      setNewCategoryText("");
                    } else {
                      setCategory(e.target.value);
                    }
                  }}
                  className="h-7 max-w-[150px] px-1.5 rounded-md border border-slate-200 text-[11px] font-medium text-slate-600 bg-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  title="Category"
                >
                  {categoryList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {!categoryList.includes(category) && category ? (
                    <option value={category}>{category}</option>
                  ) : null}
                  <option value="__ADD_NEW__">+ New category…</option>
                </select>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              <ClipArtAssetPanel
                layers={layers}
                fields={fields}
                selectedLayerIds={selectedLayerIds}
                onSelectLayer={handleSelectGroup}
                onSelectAll={() => setSelectedLayerIds(layers.map((l) => l.id))}
                onClearSelection={() => setSelectedLayerIds([])}
                onFlipSelected={handleFlipSelected}
                onDuplicateSelected={() => handleDuplicateSelectedLayers()}
                onDeleteSelected={() => handleDeleteSelectedLayers(true)}
                onAddGroup={() => openPicker({ type: "OPTGROUP" }, true)}
                onAddVariants={handleAddVariants}
                onAddEmptyOption={handleAddEmptyOption}
                onSetActiveVariant={(fieldId, option) => {
                  setFields((prev) => {
                    const next = prev.map((f) => (f.id === fieldId ? { ...f, activeOptionId: option.id } : f));
                    const changed = next.find((f) => f.id === fieldId);
                    const isDriven = Boolean(changed?.hiddenFromCustomer || changed?.allowPersonalized === false);
                    if (!isDriven) queueMicrotask(() => applyDrivenOptions(next));
                    return next;
                  });
                  handlePreviewOptionChoice(fieldId, option);
                }}
                onRename={renameApartment}
                onRenameOption={handleRenameOption}
                onBulkRenameOptions={handleBulkRenameOptions}
                onRegenerateThumbs={handleRegenerateThumbs}
                onReorderOptions={handleReorderOptions}
                onToggleVisible={(id) => {
                  const layer = layers.find((l) => l.id === id);
                  if (layer) handleUpdateLayer(id, { isVisible: !layer.isVisible });
                }}
                onDuplicate={handleDuplicateLayer}
                onDelete={handleDeleteLayer}
                onDeleteVariant={handleDeleteVariant}
                onReorder={(newLayers) => setLayers(newLayers)}
                onAddSandwichFront={handleAddSandwichFront}
                onSetKnockoutGroupIds={(layerId, ids) => {
                  handleUpdateProps(layerId, { knockoutGroupIds: ids });
                }}
                onToggleHiddenField={(fieldId, hidden) => {
                  handleUpdateField(fieldId, { hiddenFromCustomer: hidden, allowPersonalized: !hidden });
                }}
                onToggleFreeTransform={handleToggleFreeTransform}
                onUpdateOption={(fieldId, optId, patch) => {
                  setFields((prev) => {
                    const next = prev.map((f) => {
                      if (f.id !== fieldId) return f;
                      const options = (f.config?.options || []).map((o: any) =>
                        o.id === optId ? { ...o, ...patch } : o
                      );
                      return { ...f, config: { ...(f.config || {}), options } };
                    });
                    queueMicrotask(() => applyDrivenOptions(next));
                    return next;
                  });
                }}
                onOpenConditions={() => {
                  setConditionDraft(JSON.parse(JSON.stringify(clipArtRules)));
                  setConditionsOpen(true);
                }}
                conditionCount={clipArtRules.length}
                hiddenGroupIds={
                  new Set(
                    clipArtPreview.groups
                      .filter((g) => !isClipArtGroupVisible(g.id, clipArtPreview.groups, clipArtPreview.rules))
                      .map((g) => g.id)
                  )
                }
              />
            </div>
          </div>
        </div>
      </div>

      {conditionsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                  <GitBranch className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Clip art conditions</h2>
                  <p className="text-[11px] text-slate-500">
                    Hide groups like Eyes when Skin and Body is a closed-eyes option.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConditionsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <ClipArtConditionPanel
                groups={clipArtPreview.groups.map((g) => ({
                  id: g.id,
                  name: g.name,
                  options: g.options,
                }))}
                rules={conditionDraft}
                onAddRule={(rule) => {
                  setConditionDraft((prev) => [...prev, { ...rule, id: `clip_rule_${Date.now()}` }]);
                }}
                onUpdateRule={(rule) => {
                  setConditionDraft((prev) => prev.map((r) => (r.id === rule.id ? rule : r)));
                }}
                onDeleteRule={(ruleId) => {
                  setConditionDraft((prev) => prev.filter((r) => r.id !== ruleId));
                }}
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConditionsOpen(false)}
                className="h-9 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setClipArtRules(JSON.parse(JSON.stringify(conditionDraft)));
                  setConditionsOpen(false);
                }}
                className="h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <MergeOptionsModal
        open={mergeOpen}
        groups={mergeGroups}
        busy={mergeBusy}
        progress={mergeProgress}
        onCancel={() => {
          if (mergeBusy) return;
          setMergeOpen(false);
        }}
        onConfirm={handleMergeOptions}
      />

      <MediaSelectModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiSelect={pickerMultiSelect}
        allowedCategory="IMAGE"
        defaultFolder="cliparts"
        title={pickerTitle}
        onSelect={handlePickerSelect}
      />

      {/* Unsaved changes confirmation on exit */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0 text-lg font-bold">
                ⚠️
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Save changes before leaving?</h3>
                <p className="text-xs text-slate-500 mt-0.5">You have unsaved changes in this clip art.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSaving}
                onClick={async () => {
                  await handleSave(saveStatus);
                  setShowExitConfirm(false);
                  navigate("/app/cliparts");
                }}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
              >
                {isSaving ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Save &amp; Close</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false);
                  navigate("/app/cliparts");
                }}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-rose-50 border border-slate-300 hover:border-rose-300 text-slate-700 hover:text-rose-700 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Discard &amp; Close</span>
              </button>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="w-full py-2 px-4 bg-transparent hover:bg-slate-100 text-slate-500 font-semibold text-xs rounded-xl transition cursor-pointer"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
