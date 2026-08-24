import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  Sliders,
  GitBranch,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Undo2,
  Redo2,
  Grid,
  Settings,
} from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import prisma from "../db.server";
import { requireTeamUserId } from "../services/auth.server";
import StudioCanvas, { CanvasLayerItem, generateScreenThumbnailDataUrl, getActiveFabricCanvas } from "../components/studio/StudioCanvas";
import StudioPhotoUploadModal, { PhotoCustomizationData } from "../components/studio/StudioPhotoUploadModal";
import StudioLayerPanel from "../components/studio/StudioLayerPanel";
import StudioFieldPanel, { StudioFieldItem } from "../components/studio/StudioFieldPanel";
import StudioPropertyPanel from "../components/studio/StudioPropertyPanel";
import StudioConditionPanel, { StudioConditionRuleItem } from "../components/studio/StudioConditionPanel";
import StudioScreenBar, { StudioScreenItem } from "../components/studio/StudioScreenBar";
import StudioTopToolbar from "../components/studio/StudioTopToolbar";
import MediaSelectModal from "../components/MediaSelectModal";

import { injectFontStylesheets, type FontItem } from "../utils/fontLoader";

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUserId = await requireTeamUserId(request);
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    include: { userRoles: { include: { role: true } } },
  });

  const url = new URL(request.url);
  const artworkId = url.searchParams.get("id");

  let artworkData = null;
  const studioModel = (prisma as any).studioArtwork;

  if (artworkId && studioModel) {
    artworkData = await studioModel.findUnique({
      where: { id: artworkId },
      include: {
        layers: { orderBy: { zIndex: "asc" } },
        fields: { orderBy: { sortOrder: "asc" } },
        rules: true,
      },
    });
  }

  // Fetch all existing unique Niches and Categories from Database (no hardcoded presets)
  const dbStudioArtworks = studioModel ? await studioModel.findMany({ select: { niche: true, category: true } }) : [];
  const dbMasterArtworks = await prisma.artwork.findMany({ select: { niche: true, category: true } });
  const combinedArtworks = [...dbStudioArtworks, ...dbMasterArtworks];

  const dbNiches = Array.from(new Set(combinedArtworks.map((a: any) => a.niche).filter(Boolean))).sort() as string[];
  const dbCategories = Array.from(new Set(combinedArtworks.map((a: any) => a.category).filter(Boolean))).sort() as string[];

  // Fetch all fonts for Text Layer customization
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
    artworkData,
    dbNiches,
    dbCategories,
    fonts,
  });
}

export default function ArtworkStudioRoute() {
  const { currentUser, artworkData, dbNiches, dbCategories, fonts } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const artworkIdFromUrl = searchParams.get("id");

  // Inject font stylesheets dynamically so canvas text layers render correctly
  useEffect(() => {
    if (fonts) injectFontStylesheets(fonts);
  }, [fonts]);

  // Artwork Info
  const [artworkId, setArtworkId] = useState<string | null>(artworkData?.id || artworkIdFromUrl || null);
  const [title, setTitle] = useState(artworkData?.title || "New Personalization Artwork");
  const [widthPx, setWidthPx] = useState(artworkData?.widthPx || 1000);
  const [heightPx, setHeightPx] = useState(artworkData?.heightPx || 1000);

  // Default Layers for Screen 1
  const defaultLayers: CanvasLayerItem[] = [
    {
      id: "layer_bg",
      name: "Background Scene",
      layerType: "BACKGROUND",
      zIndex: 0,
      posX: 0,
      posY: 0,
      width: 1000,
      height: 1000,
      isVisible: true,
      isLocked: false,
    },
    {
      id: "layer_hair",
      name: "Girl Hair Clipart",
      layerType: "ASSET",
      zIndex: 1,
      posX: 300,
      posY: 200,
      width: 400,
      height: 400,
      isVisible: true,
      isLocked: false,
      properties: {
        assetUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?w=500&auto=format&fit=crop&q=60",
      },
    },
    {
      id: "layer_gender",
      name: "Select Gender",
      layerType: "ASSET",
      zIndex: 1,
      posX: 320,
      posY: 200,
      width: 360,
      height: 360,
      isVisible: true,
      isLocked: false,
      linkedFieldId: "field_gender",
      properties: {},
    },
    {
      id: "layer_text_name",
      name: "Customer Name Text",
      layerType: "TEXT",
      zIndex: 2,
      posX: 250,
      posY: 700,
      width: 500,
      height: 100,
      isVisible: true,
      isLocked: false,
      properties: {
        text: "Sarah & Emily",
        fontSize: 48,
        color: "#1e293b",
        align: "center",
      },
      linkedFieldId: "field_name",
    },
  ];

  // MULTI-SCREEN STATE (Each screen has its OWN independent layers & custom fields!)
  const [screens, setScreens] = useState<StudioScreenItem[]>(() => {
    if (artworkData?.screens) {
      try {
        const parsed = typeof artworkData.screens === "string" ? JSON.parse(artworkData.screens) : artworkData.screens;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Failed to parse saved artwork screens JSON:", e);
      }
    }

    // Default layers and fields if no saved screens JSON exist
    const initialLayers: CanvasLayerItem[] = artworkData?.layers && artworkData.layers.length > 0
      ? artworkData.layers.map((l: any) => ({
          ...l,
          properties: typeof l.properties === "string" ? JSON.parse(l.properties) : l.properties || {},
        }))
      : defaultLayers;

    const initialFields: StudioFieldItem[] = artworkData?.fields && artworkData.fields.length > 0
      ? artworkData.fields.map((f: any) => ({
          ...f,
          config: typeof f.config === "string" ? JSON.parse(f.config) : f.config || {},
        }))
      : [
          {
            id: "field_gender",
            label: "Select Gender",
            fieldType: "RADIO",
            sortOrder: 0,
            isRequired: true,
            config: {
              options: [
                { label: "Male", value: "Male" },
                { label: "Female", value: "Female" },
              ],
            },
          },
          {
            id: "field_name",
            label: "Customer Name",
            fieldType: "TEXT",
            sortOrder: 1,
            isRequired: true,
            config: { maxLength: 20, defaultText: "Sarah & Emily" },
          },
        ];

    return [
      {
        id: "screen_1",
        name: "Screen 1 (Default Layout)",
        bgUrl: artworkData?.bgUrl || undefined,
        bgColor: "#ffffff",
        sortOrder: 0,
        layers: initialLayers,
        fields: initialFields,
      },
    ];
  });

  const [activeScreenId, setActiveScreenId] = useState<string>(() => screens[0]?.id || "screen_1");

  // Ensure activeScreenId ALWAYS defaults to the FIRST screen in the list on initial load / reload
  useEffect(() => {
    if (screens && screens.length > 0) {
      if (!activeScreenId || !screens.some((s) => s.id === activeScreenId)) {
        setActiveScreenId(screens[0].id);
      }
    }
  }, [artworkData]);

  // Get Active Screen's Data
  const activeScreen = screens.find((s) => s.id === activeScreenId) || screens[0];
  const layers = activeScreen?.layers || [];
  const fields = activeScreen?.fields || [];

  const [rules, setRules] = useState<StudioConditionRuleItem[]>(artworkData?.rules || []);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(layers[0]?.id || null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(fields[0]?.id || null);
  const [activeTab, setActiveTab] = useState<"FIELDS" | "LAYERS" | "CONDITIONS">("FIELDS");
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [niche, setNiche] = useState<string>(artworkData?.niche || "General");
  const [category, setCategory] = useState<string>(artworkData?.category || "General");
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Photo Upload Customer Customization Modal State
  const [photoUploadModalOpen, setPhotoUploadModalOpen] = useState(false);
  const [photoUploadTargetLayerId, setPhotoUploadTargetLayerId] = useState<string | null>(null);

  const handleOpenPhotoUploadModal = (layerId: string) => {
    setPhotoUploadTargetLayerId(layerId);
    setPhotoUploadModalOpen(true);
  };

  const handleApplyPhotoCustomization = (data: PhotoCustomizationData) => {
    if (!photoUploadTargetLayerId) return;
    const targetLayer = layers.find((l) => l.id === photoUploadTargetLayerId);
    if (!targetLayer) return;

    handleUpdateLayer(photoUploadTargetLayerId, {
      properties: {
        ...(targetLayer.properties || {}),
        assetUrl: data.imageUrl,
        photoCustomization: data,
      },
    });
  };

  // Dynamic Niche & Category Option Lists (Strictly loaded from Database)
  const [nicheList, setNicheList] = useState<string[]>(() => {
    const set = new Set([...(dbNiches || []), artworkData?.niche || "General", "General"]);
    return Array.from(set).filter(Boolean).sort();
  });

  const [categoryList, setCategoryList] = useState<string[]>(() => {
    const set = new Set([...(dbCategories || []), artworkData?.category || "General", "General"]);
    return Array.from(set).filter(Boolean).sort();
  });

  const [isAddingNiche, setIsAddingNiche] = useState(false);
  const [newNicheText, setNewNicheText] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryText, setNewCategoryText] = useState("");

  const handleAddNewNiche = () => {
    const trimmed = newNicheText.trim();
    if (trimmed) {
      if (!nicheList.includes(trimmed)) {
        setNicheList((prev) => [...prev, trimmed]);
      }
      setNiche(trimmed);
      setNewNicheText("");
    }
    setIsAddingNiche(false);
  };

  const handleAddNewCategory = () => {
    const trimmed = newCategoryText.trim();
    if (trimmed) {
      if (!categoryList.includes(trimmed)) {
        setCategoryList((prev) => [...prev, trimmed]);
      }
      setCategory(trimmed);
      setNewCategoryText("");
    }
    setIsAddingCategory(false);
  };

  // HISTORY UNDO / REDO SYSTEM
  const [history, setHistory] = useState<StudioScreenItem[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const isUndoRedoActionRef = useRef(false);

  const historyRef = useRef<StudioScreenItem[][]>(history);
  const historyIndexRef = useRef<number>(historyIndex);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  // Initialize history snapshot with initial screens
  useEffect(() => {
    if (historyRef.current.length === 0 && screens.length > 0) {
      const initialSnapshot = [JSON.parse(JSON.stringify(screens))];
      setHistory(initialSnapshot);
      setHistoryIndex(0);
    }
  }, [screens]);

  // Push snapshot into history stack
  const pushHistorySnapshot = (newScreens: StudioScreenItem[]) => {
    if (isUndoRedoActionRef.current) return;
    const cloned = JSON.parse(JSON.stringify(newScreens));
    const currentIdx = historyIndexRef.current;
    const currentHistory = historyRef.current;

    const sliced = currentHistory.slice(0, currentIdx + 1);
    const updated = [...sliced, cloned];
    if (updated.length > 50) updated.shift();

    setHistory(updated);
    setHistoryIndex(updated.length - 1);
  };

  const handleUndo = () => {
    const currentIdx = historyIndexRef.current;
    const currentHistory = historyRef.current;
    if (currentIdx <= 0 || currentHistory.length === 0) return;

    isUndoRedoActionRef.current = true;
    const targetIdx = currentIdx - 1;
    const previousSnapshot = JSON.parse(JSON.stringify(currentHistory[targetIdx])) as StudioScreenItem[];
    setScreens(previousSnapshot);
    setHistoryIndex(targetIdx);

    // Ensure activeScreenId is valid in the restored screens snapshot
    if (previousSnapshot.length > 0) {
      const exists = previousSnapshot.some((s) => s.id === activeScreenId);
      if (!exists) {
        setActiveScreenId(previousSnapshot[0].id);
      }
    }

    setTimeout(() => {
      isUndoRedoActionRef.current = false;
    }, 150);
  };

  const handleRedo = () => {
    const currentIdx = historyIndexRef.current;
    const currentHistory = historyRef.current;
    if (currentIdx >= currentHistory.length - 1) return;

    isUndoRedoActionRef.current = true;
    const targetIdx = currentIdx + 1;
    const nextSnapshot = JSON.parse(JSON.stringify(currentHistory[targetIdx])) as StudioScreenItem[];
    setScreens(nextSnapshot);
    setHistoryIndex(targetIdx);

    // Ensure activeScreenId is valid in the restored screens snapshot
    if (nextSnapshot.length > 0) {
      const exists = nextSnapshot.some((s) => s.id === activeScreenId);
      if (!exists) {
        setActiveScreenId(nextSnapshot[0].id);
      }
    }

    setTimeout(() => {
      isUndoRedoActionRef.current = false;
    }, 150);
  };

  // Keyboard shortcut listener for Undo & Redo (Cmd/Ctrl + Z, Cmd/Ctrl + Shift + Z, Cmd/Ctrl + Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(targetTag)) return;

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl) {
        if (e.key.toLowerCase() === "z") {
          if (e.shiftKey) {
            e.preventDefault();
            handleRedo();
          } else {
            e.preventDefault();
            handleUndo();
          }
        } else if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Helper Mutators for Active Screen's Layers & Fields
  const setLayers = (updateFn: (prevLayers: CanvasLayerItem[]) => CanvasLayerItem[]) => {
    setScreens((prevScreens) => {
      const nextScreens = prevScreens.map((scr) =>
        scr.id === activeScreenId
          ? { ...scr, layers: updateFn(scr.layers || []) }
          : scr
      );
      pushHistorySnapshot(nextScreens);
      return nextScreens;
    });
  };

  const setFields = (updateFn: (prevFields: StudioFieldItem[]) => StudioFieldItem[]) => {
    setScreens((prevScreens) => {
      const nextScreens = prevScreens.map((scr) =>
        scr.id === activeScreenId
          ? { ...scr, fields: updateFn(scr.fields || []) }
          : scr
      );
      pushHistorySnapshot(nextScreens);
      return nextScreens;
    });
  };

  // Screen Management Handlers
  const handleAddScreen = () => {
    const newScreenId = `screen_${Date.now()}`;
    const newScreen: StudioScreenItem = {
      id: newScreenId,
      name: `Screen ${screens.length + 1}`,
      bgUrl: undefined,
      bgColor: "#ffffff",
      sortOrder: screens.length,
      layers: [],
      fields: [],
    };
    const nextScreens = [...screens, newScreen];
    setScreens(nextScreens);
    pushHistorySnapshot(nextScreens);
    setActiveScreenId(newScreenId);
  };

  const handleDuplicateScreen = (screenId: string) => {
    const targetScreen = screens.find((s) => s.id === screenId);
    if (!targetScreen) return;

    const duplicatedScreenId = `screen_${Date.now()}`;
    const duplicatedScreen: StudioScreenItem = {
      ...targetScreen,
      id: duplicatedScreenId,
      name: `${targetScreen.name} (Copy)`,
      sortOrder: screens.length,
      layers: (targetScreen.layers || []).map((l) => ({
        ...l,
        id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      })),
      fields: (targetScreen.fields || []).map((f) => ({
        ...f,
        id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      })),
    };

    const nextScreens = [...screens, duplicatedScreen];
    setScreens(nextScreens);
    pushHistorySnapshot(nextScreens);
    setActiveScreenId(duplicatedScreenId);
  };

  const handleUpdateScreen = (screenId: string, updatedProps: Partial<StudioScreenItem>) => {
    const nextScreens = screens.map((s) => (s.id === screenId ? { ...s, ...updatedProps } : s));
    setScreens(nextScreens);
    pushHistorySnapshot(nextScreens);
  };

  const handleDeleteScreen = (screenId: string) => {
    if (screens.length <= 1) return;
    const remaining = screens.filter((s) => s.id !== screenId);
    setScreens(remaining);
    pushHistorySnapshot(remaining);

    if (activeScreenId === screenId) {
      setActiveScreenId(remaining[0]?.id || "screen_1");
    }
  };

  // Global Screen Customization Field Config (Default: DISABLED for new artworks!)
  const [screenFieldConfig, setScreenFieldConfig] = useState<StudioScreenFieldConfig>(() => {
    if (artworkData?.screenFieldConfig) {
      try {
        return typeof artworkData.screenFieldConfig === "string"
          ? JSON.parse(artworkData.screenFieldConfig)
          : artworkData.screenFieldConfig;
      } catch (e) {
        console.error("Failed to parse saved artwork screenFieldConfig JSON:", e);
      }
    }
    return {
      enableScreenField: false,
      customerLabel: "Number Of Grandkids",
      displayViewMode: "BUTTON",
    };
  });

  const handleUpdateScreenFieldConfig = (updatedConfig: Partial<StudioScreenFieldConfig>) => {
    setScreenFieldConfig((prev) => {
      const nextConfig = { ...prev, ...updatedConfig };
      // When toggling OFF, preserve all screens in DB/state, just set active to screen 1
      if (updatedConfig.enableScreenField === false) {
        if (screens.length > 0) {
          setActiveScreenId(screens[0].id);
        }
      }
      return nextConfig;
    });
  };

  const handleReorderScreens = (reorderedScreens: StudioScreenItem[]) => {
    setScreens(reorderedScreens);
    pushHistorySnapshot(reorderedScreens);
  };

  // Save Artwork Handler
  const handleSaveArtwork = async () => {
    setIsSaving(true);
    try {
      // Generate Full Composite PNG Snapshot Thumbnail from Default Screen (Screen 1)
      const defaultScreen = screens[0] || null;
      const screenBgUrl = defaultScreen?.bgUrl || null;
      let compositeThumbnail = "";

      if (defaultScreen) {
        try {
          const activeFc = getActiveFabricCanvas();
          compositeThumbnail = await generateScreenThumbnailDataUrl(
            widthPx,
            heightPx,
            defaultScreen.layers || [],
            screenBgUrl,
            activeFc
          );
        } catch (e) {
          console.warn("Failed to generate composite thumbnail:", e);
        }
      }

      const screenAssetLayer = defaultScreen?.layers?.find(
        (l) => l.properties && l.properties.assetUrl
      );
      const fallbackImage = screenBgUrl || screenAssetLayer?.properties?.assetUrl || null;
      const finalThumbnail = compositeThumbnail || fallbackImage;

      const response = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: artworkId,
          title,
          niche,
          category,
          widthPx,
          heightPx,
          bgUrl: screenBgUrl,
          thumbnailUrl: finalThumbnail,
          screens,
          screenFieldConfig,
          layers,
          fields,
          rules,
        }),
      });

      const resData = await response.json();
      if (resData.success && resData.artwork) {
        setArtworkId(resData.artwork.id);
        // Synchronize browser URL query string so page reload fetches THIS saved record!
        window.history.replaceState(null, "", `/app/artworks/studio?id=${resData.artwork.id}`);
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), 3000);
      } else {
        alert("Save failed: " + (resData.error || "Unknown error"));
      }
    } catch (e: any) {
      alert("Save error: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Layer Handlers
  const handleAddLayer = (type: CanvasLayerItem["layerType"]) => {
    const newZ = layers.length > 0 ? Math.max(...layers.map((l) => l.zIndex)) + 1 : 0;
    const newLayer: CanvasLayerItem = {
      id: `layer_${Date.now()}`,
      name: type === "ASSET" ? "Image Layer" : type === "PHOTO_UPLOAD" ? "Photo Upload Area" : `New ${type.toLowerCase()} layer`,
      layerType: type,
      zIndex: newZ,
      posX: Math.round(widthPx / 4),
      posY: Math.round(heightPx / 4),
      width: 300,
      height: 300,
      rotation: 0,
      isVisible: true,
      isLocked: false,
      properties: type === "TEXT"
        ? { text: "Sample Text", fontSize: 36, color: "#1e293b", align: "center" }
        : type === "ASSET"
        ? { opacity: 1 }
        : type === "PHOTO_UPLOAD"
        ? {
            fieldLabel: "Upload Your Photo",
            helpText: "High resolution JPG or PNG recommended",
            isRequired: true,
            maskShape: "RECTANGLE",
            enableZoom: true,
            enableRotate: true,
            enableFlip: true,
            enableFilters: true,
          }
        : {},
    };
    setLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);

    // If adding an Image layer (ASSET), immediately open the Media Library modal!
    if (type === "ASSET") {
      handleOpenMediaPickerForLayer(newLayer.id);
    }
  };

  const handleDuplicateLayer = (layerId: string) => {
    const targetLayer = layers.find((l) => l.id === layerId);
    if (!targetLayer) return;

    const maxZ = layers.length > 0 ? Math.max(...layers.map((l) => l.zIndex)) : 0;
    const duplicatedLayer: CanvasLayerItem = {
      ...targetLayer,
      id: `layer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `${targetLayer.name} (Copy)`,
      posX: targetLayer.posX + 20,
      posY: targetLayer.posY + 20,
      zIndex: maxZ + 1,
      properties: JSON.parse(JSON.stringify(targetLayer.properties || {})),
    };

    setLayers((prev) => [...prev, duplicatedLayer]);
    setSelectedLayerId(duplicatedLayer.id);
  };

  const handleUpdateLayer = (layerId: string, updatedProps: Partial<CanvasLayerItem>) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, ...updatedProps } : l))
    );
  };

  const handleAddMaskLayer = (photoLayerId: string) => {
    const photoLayer = layers.find((l) => l.id === photoLayerId);
    if (!photoLayer) return;

    if (photoLayer.maskLayerId) {
      setSelectedLayerId(photoLayer.maskLayerId);
      return;
    }

    const newMaskId = `mask_${Date.now()}`;
    const maxZ = layers.length > 0 ? Math.max(...layers.map((l) => l.zIndex)) : 0;

    const newMaskLayer: CanvasLayerItem = {
      id: newMaskId,
      name: `Mask for ${photoLayer.name}`,
      layerType: "MASK",
      zIndex: maxZ + 1,
      posX: photoLayer.posX,
      posY: photoLayer.posY,
      width: photoLayer.width,
      height: photoLayer.height,
      rotation: photoLayer.rotation,
      isVisible: true,
      isLocked: false,
      parentPhotoUploadId: photoLayerId,
      properties: {
        maskShape: "RECTANGLE",
        rx: 4,
        ry: 4,
      },
    };

    setLayers((prev) =>
      prev.map((l) => (l.id === photoLayerId ? { ...l, maskLayerId: newMaskId } : l)).concat(newMaskLayer)
    );
    setSelectedLayerId(newMaskId);
  };

  const handleDeleteLayer = (layerId: string) => {
    setLayers((prev) => {
      const targetLayer = prev.find((l) => l.id === layerId);
      let updated = prev.filter((l) => l.id !== layerId);

      if (targetLayer?.maskLayerId) {
        updated = updated.filter((l) => l.id !== targetLayer.maskLayerId);
      }
      if (targetLayer?.parentPhotoUploadId) {
        updated = updated.map((l) =>
          l.id === targetLayer.parentPhotoUploadId ? { ...l, maskLayerId: undefined } : l
        );
      }
      return updated;
    });
    if (selectedLayerId === layerId) setSelectedLayerId(null);
  };

  // Keyboard Shortcuts & Nudge Handler (Arrow Keys: 1px/10px nudge, Delete/Backspace: delete layer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts if focus is inside form input elements
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (!selectedLayerId) return;

      const isArrowKey = [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.key);

      if (isArrowKey) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;

        setLayers((prevLayers) =>
          prevLayers.map((layer) => {
            if (layer.id !== selectedLayerId || layer.isLocked) return layer;
            let { posX, posY } = layer;
            if (e.key === "ArrowUp") posY -= step;
            if (e.key === "ArrowDown") posY += step;
            if (e.key === "ArrowLeft") posX -= step;
            if (e.key === "ArrowRight") posX += step;
            return { ...layer, posX, posY };
          })
        );
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const targetLayer = layers.find((l) => l.id === selectedLayerId);
        if (targetLayer && !targetLayer.isLocked) {
          e.preventDefault();
          handleDeleteLayer(selectedLayerId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLayerId, layers]);

  // Field Handlers
  const handleAddField = (fieldType: StudioFieldItem["fieldType"]) => {
    const newFieldId = `field_${Date.now()}`;
    const newFieldLabel = `New ${fieldType.toLowerCase()} field`;

    const newField: StudioFieldItem = {
      id: newFieldId,
      label: newFieldLabel,
      fieldType,
      sortOrder: fields.length,
      isRequired: false,
      config:
        fieldType === "RADIO" || fieldType === "SELECT" || fieldType === "FIELD_ASSET"
          ? {
              options: [
                { label: "Option 1", value: "option_1" },
                { label: "Option 2", value: "option_2" },
              ],
            }
          : {},
    };

    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newFieldId);

    // Auto-create a linked canvas layer on active screen!
    const layerType: CanvasLayerItem["layerType"] =
      fieldType === "TEXT" || fieldType === "CALENDAR"
        ? "TEXT"
        : fieldType === "IMAGE_UPLOAD"
        ? "PHOTO_UPLOAD"
        : "ASSET";

    const newZ = layers.length > 0 ? Math.max(...layers.map((l) => l.zIndex)) + 1 : 0;
    const newLayer: CanvasLayerItem = {
      id: `layer_${Date.now()}`,
      name: newFieldLabel,
      layerType,
      zIndex: newZ,
      posX: widthPx / 4,
      posY: heightPx / 4,
      width: layerType === "TEXT" ? 250 : 350,
      height: layerType === "TEXT" ? 50 : 250,
      rotation: 0,
      isVisible: true,
      isLocked: false,
      linkedFieldId: newFieldId,
      properties:
        layerType === "TEXT"
          ? { text: `[${newFieldLabel}]`, fontSize: 32, color: "#1e293b", align: "center" }
          : {},
    };

    setLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  const handleUpdateField = (fieldId: string, updatedProps: Partial<StudioFieldItem>) => {
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, ...updatedProps } : f))
    );

    if (updatedProps.label) {
      setLayers((prev) =>
        prev.map((l) => (l.linkedFieldId === fieldId ? { ...l, name: updatedProps.label! } : l))
      );
    }
  };

  const handleDeleteField = (fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
  };

  const handleAddRule = (ruleData: Omit<StudioConditionRuleItem, "id">) => {
    const newRule: StudioConditionRuleItem = {
      id: `rule_${Date.now()}`,
      ...ruleData,
    };
    setRules((prev) => [...prev, newRule]);
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  // Media Picker Modal State
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{
    type: "LAYER" | "OPTION" | "SCREEN_BG" | "SCREEN_ICON";
    layerId?: string;
    fieldId?: string;
    optionIndex?: number;
    bgOptionIndex?: number;
    optionTargetType?: "SWATCH" | "ASSET";
    screenId?: string;
  } | null>(null);

  const handleOpenMediaPickerForLayer = (layerId: string, bgOptionIndex?: number) => {
    setPickerTarget({ type: "LAYER", layerId, bgOptionIndex });
    setMediaPickerOpen(true);
  };

  const handleOpenMediaPickerForOption = (
    fieldId: string,
    optionIndex: number,
    targetType: "SWATCH" | "ASSET" = "ASSET"
  ) => {
    setPickerTarget({ type: "OPTION", fieldId, optionIndex, optionTargetType: targetType });
    setMediaPickerOpen(true);
  };

  const handleOpenMediaPickerForScreenBg = (screenId: string) => {
    setPickerTarget({ type: "SCREEN_BG", screenId });
    setMediaPickerOpen(true);
  };

  const handleOpenMediaPickerForScreenIcon = (screenId: string) => {
    setPickerTarget({ type: "SCREEN_ICON", screenId });
    setMediaPickerOpen(true);
  };

  const handlePreviewOptionChoice = (fieldId: string, option: any) => {
    let linkedLayer = layers.find((l) => l.linkedFieldId === fieldId);
    if (!linkedLayer) {
      const field = fields.find((f) => f.id === fieldId);
      const newZ = layers.length > 0 ? Math.max(...layers.map((l) => l.zIndex)) + 1 : 1;
      const newLayer: CanvasLayerItem = {
        id: `layer_${Date.now()}`,
        name: field?.label || "Linked Layer",
        layerType: field?.fieldType === "TEXT" ? "TEXT" : "ASSET",
        zIndex: newZ,
        posX: option.posX !== undefined ? option.posX : 300,
        posY: option.posY !== undefined ? option.posY : 200,
        width: option.width !== undefined ? option.width : 350,
        height: option.height !== undefined ? option.height : 350,
        rotation: option.rotation !== undefined ? option.rotation : 0,
        isVisible: true,
        isLocked: false,
        linkedFieldId: fieldId,
        properties: {
          assetUrl: option.assetImageUrl || "",
        },
      };
      setLayers((prev) => [...prev, newLayer]);
      setSelectedLayerId(newLayer.id);
    } else {
      const updatedProps: Partial<CanvasLayerItem> = {
        properties: {
          ...(linkedLayer.properties || {}),
          assetUrl: option.assetImageUrl || linkedLayer.properties?.assetUrl,
        },
      };

      if (option.hasCustomPosition) {
        if (option.posX !== undefined) updatedProps.posX = option.posX;
        if (option.posY !== undefined) updatedProps.posY = option.posY;
        if (option.width !== undefined) updatedProps.width = option.width;
        if (option.height !== undefined) updatedProps.height = option.height;
        if (option.rotation !== undefined) updatedProps.rotation = option.rotation;
      }

      handleUpdateLayer(linkedLayer.id, updatedProps);
    }
  };

  const handleSelectMediaAsset = (fileUrl: string) => {
    if (!pickerTarget) return;

    if (pickerTarget.type === "SCREEN_BG" && pickerTarget.screenId) {
      handleUpdateScreen(pickerTarget.screenId, { bgUrl: fileUrl });
    } else if (pickerTarget.type === "SCREEN_ICON" && pickerTarget.screenId) {
      handleUpdateScreen(pickerTarget.screenId, { iconUrl: fileUrl });
    } else if (pickerTarget.type === "LAYER" && pickerTarget.layerId) {
      const targetLayer = layers.find((l) => l.id === pickerTarget.layerId);
      const currentProps = targetLayer?.properties || {};

      if (pickerTarget.bgOptionIndex !== undefined) {
        const bgOptions = [...(currentProps.bgOptions || [])];
        if (bgOptions[pickerTarget.bgOptionIndex]) {
          bgOptions[pickerTarget.bgOptionIndex] = {
            ...bgOptions[pickerTarget.bgOptionIndex],
            assetUrl: fileUrl,
          };
          handleUpdateLayer(pickerTarget.layerId, {
            properties: { ...currentProps, bgOptions, assetUrl: fileUrl },
          });
        }
      } else {
        // Preload image to calculate natural aspect ratio and 50% artwork max size limit
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = fileUrl;
        img.onload = () => {
          const naturalW = img.naturalWidth || 300;
          const naturalH = img.naturalHeight || 300;
          const aspectRatio = naturalW / naturalH;

          // Max allowed dimensions: 50% of artwork dimensions
          const maxW = widthPx * 0.5;
          const maxH = heightPx * 0.5;

          let calcW = Math.min(naturalW, maxW);
          let calcH = calcW / aspectRatio;

          if (calcH > maxH) {
            calcH = maxH;
            calcW = calcH * aspectRatio;
          }

          calcW = Math.round(calcW);
          calcH = Math.round(calcH);

          const posX = Math.round((widthPx - calcW) / 2);
          const posY = Math.round((heightPx - calcH) / 2);

          handleUpdateLayer(pickerTarget.layerId!, {
            width: calcW,
            height: calcH,
            posX,
            posY,
            properties: {
              ...currentProps,
              assetUrl: fileUrl,
              aspectRatio,
              naturalWidth: naturalW,
              naturalHeight: naturalH,
            },
          });
        };
        img.onerror = () => {
          handleUpdateLayer(pickerTarget.layerId!, {
            properties: { ...currentProps, assetUrl: fileUrl },
          });
        };
      }
    } else if (pickerTarget.type === "OPTION" && pickerTarget.fieldId && pickerTarget.optionIndex !== undefined) {
      const field = fields.find((f) => f.id === pickerTarget.fieldId);
      if (field) {
        const config = field.config || {};
        const options = [...(config.options || [])];
        if (options[pickerTarget.optionIndex]) {
          const isSwatch = pickerTarget.optionTargetType === "SWATCH";
          options[pickerTarget.optionIndex] = {
            ...options[pickerTarget.optionIndex],
            swatchImageUrl: isSwatch ? fileUrl : options[pickerTarget.optionIndex].swatchImageUrl,
            assetImageUrl: !isSwatch ? fileUrl : options[pickerTarget.optionIndex].assetImageUrl || fileUrl,
          };
          handleUpdateField(field.id, { config: { ...config, options } });

          if (!isSwatch) {
            handlePreviewOptionChoice(field.id, options[pickerTarget.optionIndex]);
          }
        }
      }
    }
  };

  const selectedLayer = layers.find((l) => l.id === selectedLayerId) || null;

  return (
    <DashboardLayout currentUser={currentUser}>
      <div className="flex flex-col h-[calc(100vh-64px)] min-h-[650px] overflow-hidden bg-slate-100">
        {/* Ultra-slim Top Navigation & Screens Header Bar (height 44px) */}
        <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex items-center justify-between shrink-0 z-50 relative gap-2 overflow-visible">
          {/* SCREENS MANAGEMENT BAR (Sits at the far left!) */}
          <div className="flex-1 flex justify-start min-w-0 overflow-visible">
            <StudioScreenBar
              screens={screens}
              activeScreenId={activeScreenId}
              screenFieldConfig={screenFieldConfig}
              fields={fields}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onSelectScreen={setActiveScreenId}
              onAddScreen={handleAddScreen}
              onDuplicateScreen={handleDuplicateScreen}
              onReorderScreens={handleReorderScreens}
              onUpdateScreen={handleUpdateScreen}
              onUpdateScreenFieldConfig={handleUpdateScreenFieldConfig}
              onDeleteScreen={handleDeleteScreen}
              onOpenMediaPickerForScreenBg={handleOpenMediaPickerForScreenBg}
              onOpenMediaPickerForScreenIcon={handleOpenMediaPickerForScreenIcon}
            />
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Compact Undo/Redo + Grid & Zoom Control Box (Fixed 32px Height) */}
            <div className="h-8 flex items-center gap-1 bg-slate-100 border border-slate-300 rounded-lg p-0.5 text-xs font-semibold shrink-0">
              {/* Undo & Redo Buttons */}
              <button
                type="button"
                disabled={historyIndex <= 0 || history.length === 0}
                onClick={handleUndo}
                className={`p-1 h-6 w-6 rounded flex items-center justify-center transition cursor-pointer ${
                  historyIndex > 0
                    ? "bg-white text-slate-700 hover:text-blue-600 shadow-2xs"
                    : "text-slate-300 cursor-not-allowed"
                }`}
                title="Undo last action (Cmd/Ctrl + Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                disabled={historyIndex >= history.length - 1}
                onClick={handleRedo}
                className={`p-1 h-6 w-6 rounded flex items-center justify-center transition cursor-pointer ${
                  historyIndex < history.length - 1
                    ? "bg-white text-slate-700 hover:text-blue-600 shadow-2xs"
                    : "text-slate-300 cursor-not-allowed"
                }`}
                title="Redo action (Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              {/* Preview Toggle Icon Button */}
              <button
                type="button"
                onClick={() => setIsPreviewMode(!isPreviewMode)}
                className={`p-1 h-6 w-6 rounded flex items-center justify-center transition cursor-pointer ${
                  isPreviewMode
                    ? "bg-amber-500 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
                title={isPreviewMode ? "Exit Storefront Preview (Edit Mode)" : "Storefront Preview Mode"}
              >
                {isPreviewMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>

              <div className="w-[1px] h-3.5 bg-slate-300 mx-0.5" />
              <button
                type="button"
                onClick={() => setShowGrid((g) => !g)}
                className={`px-2 h-6 rounded flex items-center gap-1 transition cursor-pointer text-[11px] font-bold ${
                  showGrid
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
                title={showGrid ? "Hide Alignment Grid" : "Show Alignment Grid"}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>{showGrid ? "ON" : "OFF"}</span>
              </button>

              <div className="w-[1px] h-3.5 bg-slate-300 mx-0.5" />

              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.1, Math.round((z - 0.1) * 100) / 100))}
                className="p-1 h-6 w-6 flex items-center justify-center hover:bg-slate-200 rounded text-slate-600 transition cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setZoom(1)}
                className="min-w-[36px] h-6 flex items-center justify-center font-mono text-[11px] font-bold text-slate-800 hover:bg-slate-200 rounded px-1 transition cursor-pointer"
                title="Click to Reset Zoom to 100%"
              >
                {Math.round(zoom * 100)}%
              </button>

              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 100) / 100))}
                className="p-1 h-6 w-6 flex items-center justify-center hover:bg-slate-200 rounded text-slate-600 transition cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Save Artwork Button (Fixed 32px Height) */}
            <button
              onClick={handleSaveArtwork}
              disabled={isSaving}
              className="h-8 flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3.5 rounded-lg shadow-2xs transition cursor-pointer"
            >
              {isSaving ? (
                "Saving..."
              ) : saveToast ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" /> Saved!
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> Save Artwork
                </>
              )}
            </button>
          </div>
        </div>

        {/* Studio Workspace Main Grid */}
        <div className="flex-1 flex overflow-hidden">
          {/* CENTER: 2D VISUAL CANVAS WORKSPACE */}
          <div className="flex-1 h-full flex flex-col overflow-hidden bg-slate-200/60 relative">
            <StudioTopToolbar
              selectedLayer={selectedLayer}
              fonts={fonts}
              onUpdateLayer={handleUpdateLayer}
              onOpenMediaPickerForLayer={handleOpenMediaPickerForLayer}
            />
            <div className="flex-1 relative overflow-auto">
              <StudioCanvas
                widthPx={widthPx}
                heightPx={heightPx}
                layers={layers}
                selectedLayerId={selectedLayerId}
                onSelectLayer={setSelectedLayerId}
                onUpdateLayer={handleUpdateLayer}
                bgUrl={activeScreen?.bgUrl}
                zoom={zoom}
                showGrid={showGrid}
                isPreviewMode={isPreviewMode}
                fonts={fonts}
              />
            </div>
          </div>

          {/* RIGHT SIDEBAR: Artwork Info Header + Layer Stack & Property Inspector */}
          <div className="flex flex-col border-l border-slate-200 bg-white shrink-0 w-80">
            {/* ARTWORK TITLE & SETTINGS HEADER (Relocated to Right Sidebar) */}
            <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="font-bold text-slate-900 text-xs bg-white hover:bg-slate-100 border border-slate-200 focus:border-blue-500 rounded px-2 py-1 focus:outline-none truncate w-full"
                  placeholder="Artwork Title"
                />
                <span className="text-[11px] text-slate-400 font-mono shrink-0">
                  ({widthPx}×{heightPx})
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSettingsModalOpen(true)}
                className="p-1 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer shrink-0"
                title="Configure Canvas Settings & Dimensions"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="h-1/2 border-b border-slate-200 overflow-hidden">
                <StudioLayerPanel
                  layers={layers}
                  selectedLayerId={selectedLayerId}
                  onSelectLayer={setSelectedLayerId}
                  onUpdateLayer={handleUpdateLayer}
                  onAddLayer={handleAddLayer}
                  onAddMaskLayer={handleAddMaskLayer}
                  onDuplicateLayer={handleDuplicateLayer}
                  onDeleteLayer={handleDeleteLayer}
                  onReorderLayers={(newLayers) => setLayers(() => newLayers)}
                />
              </div>
              <div className="h-1/2 overflow-hidden">
                <StudioPropertyPanel
                  selectedLayer={selectedLayer}
                  fields={fields}
                  fonts={fonts}
                  onUpdateLayer={handleUpdateLayer}
                  onOpenMediaPickerForLayer={handleOpenMediaPickerForLayer}
                  onOpenPhotoUploadModal={handleOpenPhotoUploadModal}
                  onAddMaskLayer={handleAddMaskLayer}
                  onDeleteLayer={handleDeleteLayer}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Artwork General & Canvas Dimensions Settings Modal */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
            {/* Modal Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-bold text-sm text-[#303030]">Artwork Settings & Dimensions</h2>
                  <p className="text-[11px] text-[#616161]">Configure artwork meta properties and canvas resolution</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition cursor-pointer text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto bg-white">
              {/* Artwork Title */}
              <div>
                <label className="block text-xs font-semibold text-[#303030] mb-1">
                  Artwork Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xs font-medium text-[#303030] bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#005bd3] focus:border-[#005bd3] outline-none shadow-2xs"
                  placeholder="Enter artwork title..."
                />
              </div>

              {/* Niche & Category Grid with Add New Feature */}
              <div className="grid grid-cols-2 gap-3">
                {/* Niche Column */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-[#303030]">
                      Niche
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddingNiche(!isAddingNiche)}
                      className="text-[11px] font-bold text-[#005bd3] hover:underline cursor-pointer"
                    >
                      {isAddingNiche ? "Cancel" : "+ Add New"}
                    </button>
                  </div>

                  {isAddingNiche ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newNicheText}
                        onChange={(e) => setNewNicheText(e.target.value)}
                        placeholder="New Niche name..."
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddNewNiche();
                        }}
                        className="w-full text-xs font-medium text-[#303030] bg-white border border-[#005bd3] rounded-lg px-2.5 py-1.5 focus:outline-none shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddNewNiche}
                        className="px-2.5 py-1.5 text-xs font-bold text-white bg-[#005bd3] hover:bg-[#004bb5] rounded-lg transition shrink-0 cursor-pointer shadow-2xs"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <select
                      value={niche}
                      onChange={(e) => {
                        if (e.target.value === "__ADD_NEW__") {
                          setIsAddingNiche(true);
                        } else {
                          setNiche(e.target.value);
                        }
                      }}
                      className="w-full text-xs font-medium text-[#303030] bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#005bd3] focus:border-[#005bd3] outline-none shadow-2xs cursor-pointer"
                    >
                      {nicheList.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                      <option value="__ADD_NEW__">+ Add New Niche...</option>
                    </select>
                  )}
                </div>

                {/* Category Column */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-[#303030]">
                      Category
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddingCategory(!isAddingCategory)}
                      className="text-[11px] font-bold text-[#005bd3] hover:underline cursor-pointer"
                    >
                      {isAddingCategory ? "Cancel" : "+ Add New"}
                    </button>
                  </div>

                  {isAddingCategory ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newCategoryText}
                        onChange={(e) => setNewCategoryText(e.target.value)}
                        placeholder="New Category name..."
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddNewCategory();
                        }}
                        className="w-full text-xs font-medium text-[#303030] bg-white border border-[#005bd3] rounded-lg px-2.5 py-1.5 focus:outline-none shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddNewCategory}
                        className="px-2.5 py-1.5 text-xs font-bold text-white bg-[#005bd3] hover:bg-[#004bb5] rounded-lg transition shrink-0 cursor-pointer shadow-2xs"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <select
                      value={category}
                      onChange={(e) => {
                        if (e.target.value === "__ADD_NEW__") {
                          setIsAddingCategory(true);
                        } else {
                          setCategory(e.target.value);
                        }
                      }}
                      className="w-full text-xs font-medium text-[#303030] bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#005bd3] focus:border-[#005bd3] outline-none shadow-2xs cursor-pointer"
                    >
                      {categoryList.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="__ADD_NEW__">+ Add New Category...</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Canvas Dimensions Section */}
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-[#303030]">
                    Canvas Resolution / Dimensions
                  </label>
                  <span className="text-[11px] font-mono text-[#005bd3] bg-blue-50 px-2 py-0.5 rounded font-bold border border-blue-200">
                    {widthPx} × {heightPx} px
                  </span>
                </div>

                {/* Quick Presets */}
                <div>
                  <label className="block text-[11px] font-medium text-[#616161] mb-1.5">
                    Quick Aspect Ratio Presets:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => { setWidthPx(1000); setHeightPx(1000); }}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-semibold text-center transition cursor-pointer ${
                        widthPx === 1000 && heightPx === 1000
                          ? "bg-blue-50 border-[#005bd3] text-[#005bd3] shadow-2xs"
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-[#303030]"
                      }`}
                    >
                      1000 × 1000 (1:1)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setWidthPx(1200); setHeightPx(800); }}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-semibold text-center transition cursor-pointer ${
                        widthPx === 1200 && heightPx === 800
                          ? "bg-blue-50 border-[#005bd3] text-[#005bd3] shadow-2xs"
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-[#303030]"
                      }`}
                    >
                      1200 × 800 (3:2)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setWidthPx(800); setHeightPx(1200); }}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-semibold text-center transition cursor-pointer ${
                        widthPx === 800 && heightPx === 1200
                          ? "bg-blue-50 border-[#005bd3] text-[#005bd3] shadow-2xs"
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-[#303030]"
                      }`}
                    >
                      800 × 1200 (2:3)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setWidthPx(2000); setHeightPx(2000); }}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-semibold text-center transition cursor-pointer ${
                        widthPx === 2000 && heightPx === 2000
                          ? "bg-blue-50 border-[#005bd3] text-[#005bd3] shadow-2xs"
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-[#303030]"
                      }`}
                    >
                      2000 × 2000 (HD)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setWidthPx(2400); setHeightPx(3200); }}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-semibold text-center transition cursor-pointer ${
                        widthPx === 2400 && heightPx === 3200
                          ? "bg-blue-50 border-[#005bd3] text-[#005bd3] shadow-2xs"
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-[#303030]"
                      }`}
                    >
                      2400 × 3200 (300 DPI)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setWidthPx(991); setHeightPx(991); }}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-semibold text-center transition cursor-pointer ${
                        widthPx === 991 && heightPx === 991
                          ? "bg-blue-50 border-[#005bd3] text-[#005bd3] shadow-2xs"
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-[#303030]"
                      }`}
                    >
                      991 × 991 (Print)
                    </button>
                  </div>
                </div>

                {/* Custom Width & Height Inputs */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#616161] mb-1">
                      Custom Width (px)
                    </label>
                    <input
                      type="number"
                      value={widthPx}
                      onChange={(e) => setWidthPx(Math.max(100, parseInt(e.target.value) || 1000))}
                      className="w-full text-xs font-mono font-bold text-[#303030] bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#005bd3] focus:border-[#005bd3] outline-none shadow-2xs"
                      min={100}
                      max={10000}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#616161] mb-1">
                      Custom Height (px)
                    </label>
                    <input
                      type="number"
                      value={heightPx}
                      onChange={(e) => setHeightPx(Math.max(100, parseInt(e.target.value) || 1000))}
                      className="w-full text-xs font-mono font-bold text-[#303030] bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#005bd3] focus:border-[#005bd3] outline-none shadow-2xs"
                      min={100}
                      max={10000}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50/80 border-t border-gray-200 px-6 py-3.5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#005bd3] hover:bg-[#004bb5] rounded-lg transition cursor-pointer shadow-2xs"
              >
                Apply Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Shopify-Style Media Select Modal */}
      <MediaSelectModal
        isOpen={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(selectedFiles) => {
          if (selectedFiles.length > 0) {
            handleSelectMediaAsset(selectedFiles[0].url);
          }
          setMediaPickerOpen(false);
        }}
      />

      {/* Amazon-Style Customer Photo Upload & Customization Modal */}
      {photoUploadModalOpen && photoUploadTargetLayerId && (() => {
        const targetLayer = layers.find((l) => l.id === photoUploadTargetLayerId);
        const targetProps = targetLayer?.properties || {};
        return (
          <StudioPhotoUploadModal
            isOpen={photoUploadModalOpen}
            title={targetProps.fieldLabel || "Upload & Customise Your Photo"}
            helpText={targetProps.helpText || "Upload a high-resolution JPG or PNG for best print quality."}
            maskShape={targetProps.maskShape || "RECTANGLE"}
            aspectRatio={targetLayer ? targetLayer.width / targetLayer.height : 1}
            currentData={targetProps.photoCustomization}
            allowedTools={{
              zoom: targetProps.enableZoom !== false,
              rotate: targetProps.enableRotate !== false,
              flip: targetProps.enableFlip !== false,
              filters: targetProps.enableFilters !== false,
            }}
            onClose={() => setPhotoUploadModalOpen(false)}
            onApply={handleApplyPhotoCustomization}
            onOpenMediaPicker={() => {
              setMediaPickerOpen(true);
              setMediaPickerTarget({ type: "LAYER", layerId: photoUploadTargetLayerId });
            }}
          />
        );
      })()}
    </DashboardLayout>
  );
}
