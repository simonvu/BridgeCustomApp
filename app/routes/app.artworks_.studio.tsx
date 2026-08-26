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
  LogOut,
  Trash2,
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
import { autoGenerateSquareThumbnail } from "../utils/thumbnailGenerator";
import StudioScreenBar, { StudioScreenItem } from "../components/studio/StudioScreenBar";
import StudioTopToolbar from "../components/studio/StudioTopToolbar";
import StudioStorefrontPreviewModal from "../components/studio/StudioStorefrontPreviewModal";
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
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s: any) => ({
            ...s,
            layers: (s.layers || []).map((l: any) => {
              const props = typeof l.properties === "string" ? JSON.parse(l.properties) : (l.properties || {});
              return {
                ...l,
                properties: props,
                maskLayerId: l.maskLayerId || props.maskLayerId,
                parentPhotoUploadId: l.parentPhotoUploadId || props.parentPhotoUploadId,
              };
            }),
          }));
        }
      } catch (e) {
        console.error("Failed to parse saved artwork screens JSON:", e);
      }
    }

    // Default layers and fields if no saved screens JSON exist
    const initialLayers: CanvasLayerItem[] = artworkData?.layers && artworkData.layers.length > 0
      ? artworkData.layers.map((l: any) => {
          const props = typeof l.properties === "string" ? JSON.parse(l.properties) : l.properties || {};
          return {
            ...l,
            properties: props,
            maskLayerId: l.maskLayerId || props.maskLayerId,
            parentPhotoUploadId: l.parentPhotoUploadId || props.parentPhotoUploadId,
          };
        })
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
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>(() => (layers[0]?.id ? [layers[0].id] : []));

  const handleSelectLayer = (layerId: string | null, isMultiKey: boolean = false) => {
    if (!layerId) {
      setSelectedLayerIds([]);
      return;
    }
    if (isMultiKey) {
      setSelectedLayerIds((prev) =>
        prev.includes(layerId) ? prev.filter((id) => id !== layerId) : [...prev, layerId]
      );
    } else {
      setSelectedLayerIds([layerId]);
    }
  };

  const selectedLayerId = selectedLayerIds.length === 1 ? selectedLayerIds[0] : null;
  const setSelectedLayerId = (layerId: string | null) => {
    if (!layerId) setSelectedLayerIds([]);
    else setSelectedLayerIds([layerId]);
  };

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(fields[0]?.id || null);
  const [activeTab, setActiveTab] = useState<"FIELDS" | "LAYERS" | "CONDITIONS">("FIELDS");
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [storefrontPreviewOpen, setStorefrontPreviewOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [niche, setNiche] = useState<string>(artworkData?.niche || "General");
  const [category, setCategory] = useState<string>(artworkData?.category || "General");
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Browser Tab Close & Page Reload Unsaved Changes Confirmation Guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Right Sidebar Draggable Panel Height Resizer State (15% to 85%, default 50%)
  const [layerPanelHeightPercent, setLayerPanelHeightPercent] = useState<number>(50);
  const sidebarPanelsContainerRef = useRef<HTMLDivElement>(null);

  const handleStartResizingPanels = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = sidebarPanelsContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const containerHeight = containerRect.height;
    const startY = e.clientY;
    const startPercent = layerPanelHeightPercent;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaPercent = (deltaY / containerHeight) * 100;
      const newPercent = Math.max(15, Math.min(85, startPercent + deltaPercent));
      setLayerPanelHeightPercent(newPercent);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Right Sidebar Horizontal Width Resizer State (280px to 650px, default 400px)
  const [rightSidebarWidthPx, setRightSidebarWidthPx] = useState<number>(400);

  const handleStartResizingRightSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightSidebarWidthPx;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(650, startWidth + deltaX));
      setRightSidebarWidthPx(newWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

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
      setIsDirty(false);
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
    setIsDirty(true);
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
      const sanitizeLayerList = (list: CanvasLayerItem[]) => {
        return list.map((l) => ({
          ...l,
          maskLayerId: l.maskLayerId || l.properties?.maskLayerId,
          parentPhotoUploadId: l.parentPhotoUploadId || l.properties?.parentPhotoUploadId,
          properties: {
            ...(l.properties || {}),
            maskLayerId: l.maskLayerId || l.properties?.maskLayerId,
            parentPhotoUploadId: l.parentPhotoUploadId || l.properties?.parentPhotoUploadId,
          },
        }));
      };

      const sanitizedActiveLayers = sanitizeLayerList(layers);
      const updatedScreens = screens.map((s) => {
        const screenLayers = s.id === activeScreenId ? sanitizedActiveLayers : s.layers || [];
        return {
          ...s,
          layers: sanitizeLayerList(screenLayers),
        };
      });

      // Generate Full Composite PNG Snapshot Thumbnail from Default Screen (Screen 1)
      const defaultScreen = updatedScreens[0] || null;
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
          screens: updatedScreens,
          screenFieldConfig,
          layers: sanitizedActiveLayers,
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
        setIsDirty(false); // Reset unsaved changes state!
        setTimeout(() => setSaveToast(false), 3000);
        return true;
      } else {
        alert("Save failed: " + (resData.error || "Unknown error"));
        return false;
      }
    } catch (e: any) {
      alert("Save error: " + e.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Studio Exit & Unsaved Changes Confirmation Handlers
  const handleCloseStudio = () => {
    if (!isDirty) {
      navigate("/app/artworks");
    } else {
      setShowCloseConfirmModal(true);
    }
  };

  const handleSaveAndClose = async () => {
    const success = await handleSaveArtwork();
    if (success) {
      setShowCloseConfirmModal(false);
      navigate("/app/artworks");
    }
  };

  const handleDiscardAndClose = () => {
    setIsDirty(false);
    setShowCloseConfirmModal(false);
    navigate("/app/artworks");
  };

  // Layer Handlers
  const handleAddLayer = (type: CanvasLayerItem["layerType"] | "DROPDOWN") => {
    const newZ = layers.length > 0 ? Math.max(...layers.map((l) => l.zIndex)) + 1 : 0;
    const nowStamp = Date.now();

    if (type === "DROPDOWN") {
      // 1. Create a linked custom field of type "SELECT" (List / Item)
      const newFieldId = `field_${nowStamp}`;
      const newField: StudioFieldItem = {
        id: newFieldId,
        label: "List / Item",
        fieldType: "SELECT",
        displayType: "DROPDOWN",
        sortOrder: fields.length + 1,
        isRequired: true,
        allowPersonalized: true,
        config: {
          options: [
            { id: `item_${nowStamp}_1`, label: "Item 1", value: "item_1", swatchImageUrl: "", assetImageUrl: "" },
            { id: `item_${nowStamp}_2`, label: "Item 2", value: "item_2", swatchImageUrl: "", assetImageUrl: "" },
            { id: `item_${nowStamp}_3`, label: "Item 3", value: "item_3", swatchImageUrl: "", assetImageUrl: "" },
          ],
        },
      };
      setFields((prev) => [...prev, newField]);

      // 2. Create the linked ASSET layer
      const newLayer: CanvasLayerItem = {
        id: `layer_${nowStamp}`,
        name: "List / Item Layer",
        layerType: "ASSET",
        zIndex: newZ,
        posX: Math.round(widthPx / 4),
        posY: Math.round(heightPx / 4),
        width: 300,
        height: 300,
        rotation: 0,
        isVisible: true,
        isLocked: false,
        linkedFieldId: newFieldId,
        properties: { opacity: 1 },
      };
      setLayers((prev) => [...prev, newLayer]);
      setSelectedLayerId(newLayer.id);
      return;
    }

    const newLayer: CanvasLayerItem = {
      id: `layer_${nowStamp}`,
      name: type === "ASSET" ? "Image Layer" : type === "PHOTO_UPLOAD" ? "Photo Upload Area" : `New ${type.toLowerCase()} layer`,
      layerType: type as CanvasLayerItem["layerType"],
      zIndex: newZ,
      posX: Math.round(widthPx / 4),
      posY: Math.round(heightPx / 4),
      width: 300,
      height: 300,
      rotation: 0,
      isVisible: true,
      isLocked: false,
      properties: type === "TEXT"
        ? { text: "Sample Text", fontSize: 36, color: "#1e293b", align: "center", minCharacters: 3, maxCharacters: 50, disallowSpecialChars: false }
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

    const timeSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    if (targetLayer.layerType === "PHOTO_UPLOAD") {
      // Find linked mask layer if present
      const existingMask = layers.find(
        (l) => l.id === targetLayer.maskLayerId || (l.layerType === "MASK" && l.parentPhotoUploadId === targetLayer.id)
      );

      const targetZ = Math.max(targetLayer.zIndex, existingMask ? existingMask.zIndex : targetLayer.zIndex);
      const newPhotoId = `layer_${timeSuffix}`;
      const newMaskId = existingMask ? `mask_${timeSuffix}` : undefined;
      const shiftCount = existingMask ? 2 : 1;

      const duplicatedPhoto: CanvasLayerItem = {
        ...targetLayer,
        id: newPhotoId,
        name: `${targetLayer.name} (Copy)`,
        maskLayerId: newMaskId,
        posX: targetLayer.posX + 20,
        posY: targetLayer.posY + 20,
        zIndex: targetZ + 1,
        properties: JSON.parse(JSON.stringify(targetLayer.properties || {})),
      };

      setLayers((prev) => {
        const shifted = prev.map((l) => (l.zIndex > targetZ ? { ...l, zIndex: l.zIndex + shiftCount } : l));

        if (existingMask && newMaskId) {
          const duplicatedMask: CanvasLayerItem = {
            ...existingMask,
            id: newMaskId,
            name: `Mask for ${targetLayer.name} (Copy)`,
            parentPhotoUploadId: newPhotoId,
            posX: existingMask.posX + 20,
            posY: existingMask.posY + 20,
            zIndex: targetZ + 2,
            properties: JSON.parse(JSON.stringify(existingMask.properties || {})),
          };
          return [...shifted, duplicatedPhoto, duplicatedMask];
        } else {
          return [...shifted, duplicatedPhoto];
        }
      });
      setSelectedLayerId(newPhotoId);
    } else if (targetLayer.layerType === "MASK") {
      // Duplicating a mask layer duplicates its parent Photo Upload layer & Mask pair
      const parentPhoto = layers.find(
        (l) => l.id === targetLayer.parentPhotoUploadId || l.maskLayerId === targetLayer.id
      );

      if (parentPhoto) {
        handleDuplicateLayer(parentPhoto.id);
      } else {
        const targetZ = targetLayer.zIndex;
        const duplicatedMaskOnly: CanvasLayerItem = {
          ...targetLayer,
          id: `mask_${timeSuffix}`,
          name: `${targetLayer.name} (Copy)`,
          posX: targetLayer.posX + 20,
          posY: targetLayer.posY + 20,
          zIndex: targetZ + 1,
          properties: JSON.parse(JSON.stringify(targetLayer.properties || {})),
        };
        setLayers((prev) =>
          prev.map((l) => (l.zIndex > targetZ ? { ...l, zIndex: l.zIndex + 1 } : l)).concat(duplicatedMaskOnly)
        );
        setSelectedLayerId(duplicatedMaskOnly.id);
      }
    } else {
      const targetZ = targetLayer.zIndex;
      const duplicatedLayer: CanvasLayerItem = {
        ...targetLayer,
        id: `layer_${timeSuffix}`,
        name: `${targetLayer.name} (Copy)`,
        maskLayerId: undefined,
        parentPhotoUploadId: undefined,
        posX: targetLayer.posX + 20,
        posY: targetLayer.posY + 20,
        zIndex: targetZ + 1,
        properties: JSON.parse(JSON.stringify(targetLayer.properties || {})),
      };

      setLayers((prev) =>
        prev.map((l) => (l.zIndex > targetZ ? { ...l, zIndex: l.zIndex + 1 } : l)).concat(duplicatedLayer)
      );
      setSelectedLayerId(duplicatedLayer.id);
    }
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

      if (selectedLayerIds.length === 0) return;

      const isArrowKey = [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.key);

      if (isArrowKey) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;

        setLayers((prevLayers) =>
          prevLayers.map((layer) => {
            if (!selectedLayerIds.includes(layer.id) || layer.isLocked) return layer;
            return { ...layer, posX: layer.posX + dx, posY: layer.posY + dy };
          })
        );
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        selectedLayerIds.forEach((id) => handleDeleteLayer(id));
        setSelectedLayerIds([]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLayerIds, layers]);

  // Field Handlers
  const handleAddField = (fieldType: StudioFieldItem["fieldType"]) => {
    const nowStamp = Date.now();
    const newFieldId = `field_${nowStamp}`;
    const newFieldLabel = fieldType === "SELECT" ? "List / Item" : `New ${fieldType.toLowerCase()} field`;

    const newField: StudioFieldItem = {
      id: newFieldId,
      label: newFieldLabel,
      fieldType,
      displayType: fieldType === "SELECT" ? "DROPDOWN" : undefined,
      sortOrder: fields.length,
      isRequired: false,
      config:
        fieldType === "RADIO" || fieldType === "SELECT" || fieldType === "FIELD_ASSET"
          ? {
              options: [
                { id: `item_${nowStamp}_1`, label: "Item 1", value: "item_1", swatchImageUrl: "", assetImageUrl: "" },
                { id: `item_${nowStamp}_2`, label: "Item 2", value: "item_2", swatchImageUrl: "", assetImageUrl: "" },
                { id: `item_${nowStamp}_3`, label: "Item 3", value: "item_3", swatchImageUrl: "", assetImageUrl: "" },
              ],
            }
          : fieldType === "TEXT"
          ? { minCharacters: 3, maxCharacters: 50, disallowSpecialChars: false }
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
          ? { text: `[${newFieldLabel}]`, fontSize: 32, color: "#1e293b", align: "center", minCharacters: 3, maxCharacters: 50, disallowSpecialChars: false }
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

function detectCleanNameFromFileName(fileName: string): string {
  if (!fileName) return "Item";
  let name = fileName.replace(/\.[^/.]+$/, "");
  name = name.replace(/[-_]+/g, " ").trim();
  return name.replace(/\b\w/g, (char) => char.toUpperCase());
}

  // Media Picker Modal State
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [pickerMultiSelect, setPickerMultiSelect] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{
    type: "LAYER" | "OPTION" | "BATCH_OPTIONS" | "SCREEN_BG" | "SCREEN_ICON";
    layerId?: string;
    fieldId?: string;
    optionIndex?: number;
    bgOptionIndex?: number;
    optionTargetType?: "SWATCH" | "ASSET";
    screenId?: string;
  } | null>(null);

  const handleOpenMediaPickerForLayer = (layerId: string, bgOptionIndex?: number) => {
    setPickerTarget({ type: "LAYER", layerId, bgOptionIndex });
    setPickerMultiSelect(false);
    setMediaPickerOpen(true);
  };

  const handleOpenMediaPickerForOption = (
    fieldId: string,
    optionIndex: number,
    targetType: "SWATCH" | "ASSET" = "ASSET"
  ) => {
    setPickerTarget({ type: "OPTION", fieldId, optionIndex, optionTargetType: targetType });
    setPickerMultiSelect(false);
    setMediaPickerOpen(true);
  };

  const handleOpenMediaPickerForBatchOptions = (fieldId: string) => {
    setPickerTarget({ type: "BATCH_OPTIONS", fieldId });
    setPickerMultiSelect(true);
    setMediaPickerOpen(true);
  };

  const handleOpenMediaPickerForScreenBg = (screenId: string) => {
    setPickerTarget({ type: "SCREEN_BG", screenId });
    setPickerMultiSelect(false);
    setMediaPickerOpen(true);
  };

  const handleOpenMediaPickerForScreenIcon = (screenId: string) => {
    setPickerTarget({ type: "SCREEN_ICON", screenId });
    setPickerMultiSelect(false);
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

  const handleSelectMediaAssets = async (selectedFiles: any[]) => {
    if (!pickerTarget || !selectedFiles || selectedFiles.length === 0) return;
    const firstUrl = selectedFiles[0]?.url || selectedFiles[0]?.thumbnailUrl;

    if (pickerTarget.type === "BATCH_OPTIONS" && pickerTarget.fieldId) {
      const field = fields.find((f) => f.id === pickerTarget.fieldId);
      if (field) {
        const config = field.config || {};
        const existingOpts = [...(config.options || [])];
        const item1 = existingOpts[0];

        const refLayer = layers.find((l) => l.linkedFieldId === field.id);
        const firstPosX = item1?.posX !== undefined ? item1.posX : refLayer?.posX || 100;
        const firstPosY = item1?.posY !== undefined ? item1.posY : refLayer?.posY || 100;
        const firstWidth = item1?.width !== undefined ? item1.width : 300;
        const firstRotation = item1?.rotation !== undefined ? item1.rotation : refLayer?.rotation || 0;
        const firstOpacity = item1?.opacity !== undefined ? item1.opacity : refLayer?.properties?.opacity ?? 1;

        const newOptions: any[] = [];

        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          const fileUrl = file.url || file.thumbnailUrl;
          if (!fileUrl) continue;

          const detectedLabel = detectCleanNameFromFileName(file.fileName);
          const optId = `item_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
          const valueStr = `${detectedLabel.toLowerCase().replace(/\s+/g, "_")}_${Date.now().toString(36).substring(2, 5)}`;

          const calcH = await new Promise<number>((resH) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = fileUrl;
            img.onload = () => {
              const natW = img.naturalWidth || 300;
              const natH = img.naturalHeight || 300;
              resH(Math.max(10, Math.round(firstWidth / (natW / natH))));
            };
            img.onerror = () => resH(300);
          });

          const autoSwatchUrl = await autoGenerateSquareThumbnail(fileUrl);

          newOptions.push({
            id: optId,
            label: detectedLabel,
            value: valueStr,
            swatchImageUrl: autoSwatchUrl || fileUrl,
            assetImageUrl: fileUrl,
            posX: firstPosX,
            posY: firstPosY,
            width: firstWidth,
            height: calcH,
            rotation: firstRotation,
            opacity: firstOpacity,
            isVisible: true,
          });
        }

        const updatedOptions = [...existingOpts, ...newOptions];
        handleUpdateField(field.id, {
          config: { ...config, options: updatedOptions },
          activeOptionId: newOptions[0]?.id || field.activeOptionId,
        });
        if (newOptions[0]) {
          handlePreviewOptionChoice(field.id, newOptions[0]);
        }
      }
      return;
    }

    if (!firstUrl) return;

    if (pickerTarget.type === "SCREEN_BG" && pickerTarget.screenId) {
      handleUpdateScreen(pickerTarget.screenId, { bgUrl: firstUrl });
    } else if (pickerTarget.type === "SCREEN_ICON" && pickerTarget.screenId) {
      handleUpdateScreen(pickerTarget.screenId, { iconUrl: firstUrl });
    } else if (pickerTarget.type === "LAYER" && pickerTarget.layerId) {
      const targetLayer = layers.find((l) => l.id === pickerTarget.layerId);
      const currentProps = targetLayer?.properties || {};

      if (pickerTarget.bgOptionIndex !== undefined) {
        const bgOptions = [...(currentProps.bgOptions || [])];
        if (bgOptions[pickerTarget.bgOptionIndex]) {
          bgOptions[pickerTarget.bgOptionIndex] = {
            ...bgOptions[pickerTarget.bgOptionIndex],
            assetUrl: firstUrl,
          };
          handleUpdateLayer(pickerTarget.layerId, {
            properties: { ...currentProps, bgOptions, assetUrl: firstUrl },
          });
        }
      } else if (targetLayer && targetLayer.layerType === "MASK") {
        handleUpdateLayer(pickerTarget.layerId, {
          properties: {
            ...currentProps,
            maskShape: "CUSTOM",
            maskAssetUrl: firstUrl,
          },
        });
      } else {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = firstUrl;
        img.onload = () => {
          const naturalW = img.naturalWidth || 300;
          const naturalH = img.naturalHeight || 300;
          const aspectRatio = naturalW / naturalH;

          const currentW = targetLayer ? targetLayer.width : 300;
          const calcH = Math.max(10, Math.round(currentW / aspectRatio));

          handleUpdateLayer(pickerTarget.layerId!, {
            width: currentW,
            height: calcH,
            properties: {
              ...currentProps,
              assetUrl: firstUrl,
              aspectRatio,
              naturalWidth: naturalW,
              naturalHeight: naturalH,
            },
          });
        };
        img.onerror = () => {
          handleUpdateLayer(pickerTarget.layerId!, {
            properties: { ...currentProps, assetUrl: firstUrl },
          });
        };
      }
    } else if (pickerTarget.type === "OPTION" && pickerTarget.fieldId && pickerTarget.optionIndex !== undefined) {
      const field = fields.find((f) => f.id === pickerTarget.fieldId);
      if (field) {
        const config = field.config || {};
        const options = [...(config.options || [])];
        const targetOpt = options[pickerTarget.optionIndex];
        if (targetOpt) {
          const isSwatch = pickerTarget.optionTargetType === "SWATCH";
          if (!isSwatch) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = firstUrl;
            img.onload = async () => {
              const natW = img.naturalWidth || 300;
              const natH = img.naturalHeight || 300;
              const currentW = targetOpt.width || 300;
              const calcH = Math.max(10, Math.round(currentW / (natW / natH)));

              let autoSwatchUrl = targetOpt.swatchImageUrl;
              if (!autoSwatchUrl || autoSwatchUrl.startsWith("data:image")) {
                autoSwatchUrl = await autoGenerateSquareThumbnail(firstUrl);
              }

              options[pickerTarget.optionIndex] = {
                ...targetOpt,
                assetImageUrl: firstUrl,
                swatchImageUrl: autoSwatchUrl || firstUrl,
                width: currentW,
                height: calcH,
              };
              handleUpdateField(field.id, { config: { ...config, options } });
              handlePreviewOptionChoice(field.id, options[pickerTarget.optionIndex]);
            };
            img.onerror = async () => {
              let autoSwatchUrl = targetOpt.swatchImageUrl;
              if (!autoSwatchUrl || autoSwatchUrl.startsWith("data:image")) {
                autoSwatchUrl = await autoGenerateSquareThumbnail(firstUrl);
              }
              options[pickerTarget.optionIndex] = {
                ...targetOpt,
                assetImageUrl: firstUrl,
                swatchImageUrl: autoSwatchUrl || firstUrl,
              };
              handleUpdateField(field.id, { config: { ...config, options } });
              handlePreviewOptionChoice(field.id, options[pickerTarget.optionIndex]);
            };
          } else {
            options[pickerTarget.optionIndex] = {
              ...targetOpt,
              swatchImageUrl: firstUrl,
            };
            handleUpdateField(field.id, { config: { ...config, options } });
          }
        }
      }
    }
  };

  const selectedLayer = layers.find((l) => l.id === selectedLayerId) || null;

  return (
    <DashboardLayout currentUser={currentUser} contentPaddingClassName="p-4">
      <div className="flex flex-col h-[calc(100vh-80px)] min-h-[650px] overflow-hidden bg-slate-100 rounded-xl border border-slate-200 shadow-2xs">
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
                onClick={() => setStorefrontPreviewOpen(true)}
                className="px-2 h-6 rounded flex items-center justify-center transition cursor-pointer text-indigo-600 hover:bg-indigo-50 bg-indigo-50/50 border border-indigo-200"
                title="Live Preview & Customer Customization Form"
              >
                <Eye className="w-3.5 h-3.5" />
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

            {/* Close Button */}
            <button
              type="button"
              onClick={handleCloseStudio}
              className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-2xs"
              title="Close Studio and return to Artwork List"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-500" />
              <span>Close</span>
            </button>

            {/* Save Button (Disabled when no unsaved changes exist) */}
            <button
              type="button"
              onClick={() => handleSaveArtwork()}
              disabled={isSaving || !isDirty}
              className={`h-8 font-bold text-xs px-3.5 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                isSaving || !isDirty
                  ? "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60"
                  : "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-md"
              }`}
              title={!isDirty ? "No unsaved changes" : "Save Artwork"}
            >
              {isSaving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...
                </>
              ) : saveToast ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" /> Saved!
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> Save
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
                fields={fields}
                selectedLayerId={selectedLayerId}
                selectedLayerIds={selectedLayerIds}
                onSelectLayer={handleSelectLayer}
                onUpdateLayer={handleUpdateLayer}
                onUpdateField={handleUpdateField}
                bgUrl={activeScreen?.bgUrl}
                zoom={zoom}
                showGrid={showGrid}
                isPreviewMode={isPreviewMode}
                fonts={fonts}
              />
            </div>
          </div>

          {/* HORIZONTAL DRAGGABLE RESIZER SPLITTER BAR (BETWEEN CANVAS & RIGHT SIDEBAR) */}
          <div
            onMouseDown={handleStartResizingRightSidebar}
            className="w-2 bg-slate-200/80 hover:bg-blue-300 border-x border-slate-300/60 cursor-ew-resize flex items-center justify-center group transition select-none shrink-0 z-20"
            title="Drag left/right to adjust sidebar width"
          >
            <div className="h-8 w-1 rounded-full bg-slate-400 group-hover:bg-blue-600 transition" />
          </div>

          {/* RIGHT SIDEBAR: Artwork Info Header + Layer Stack & Property Inspector */}
          <div style={{ width: `${rightSidebarWidthPx}px` }} className="flex flex-col bg-white shrink-0">
            {/* ARTWORK TITLE & SETTINGS HEADER (Relocated to Right Sidebar) */}
            <div className="h-9 px-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {isEditingTitle ? (
                  <input
                    type="text"
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => setIsEditingTitle(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") setIsEditingTitle(false);
                    }}
                    className="font-bold text-slate-900 text-xs bg-white border border-blue-500 rounded px-2 py-1 focus:outline-none w-full shadow-2xs"
                    placeholder="Artwork Title"
                  />
                ) : (
                  <span
                    onDoubleClick={() => setIsEditingTitle(true)}
                    className="font-bold text-slate-900 text-xs hover:bg-slate-200/60 rounded px-2 py-1 transition cursor-pointer truncate max-w-[220px] select-none"
                    title="Double click to edit artwork title"
                  >
                    {title || "Untitled Artwork"}
                  </span>
                )}
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

            <div ref={sidebarPanelsContainerRef} className="flex-1 flex flex-col overflow-hidden select-none">
              <div style={{ height: `${layerPanelHeightPercent}%` }} className="overflow-hidden">
                <StudioLayerPanel
                  layers={layers}
                  selectedLayerId={selectedLayerId}
                  selectedLayerIds={selectedLayerIds}
                  fields={fields}
                  onSelectLayer={handleSelectLayer}
                  onUpdateLayer={handleUpdateLayer}
                  onUpdateField={handleUpdateField}
                  onAddLayer={handleAddLayer}
                  onAddMaskLayer={handleAddMaskLayer}
                  onOpenMediaPickerForOption={handleOpenMediaPickerForOption}
                  onOpenMediaPickerForBatchOptions={handleOpenMediaPickerForBatchOptions}
                  onPreviewOptionChoice={handlePreviewOptionChoice}
                  onDuplicateLayer={handleDuplicateLayer}
                  onDeleteLayer={handleDeleteLayer}
                  onReorderLayers={(newLayers) => setLayers(() => newLayers)}
                />
              </div>

              {/* DRAGGABLE RESIZER SPLITTER BAR */}
              <div
                onMouseDown={handleStartResizingPanels}
                className="h-2 bg-slate-100 hover:bg-blue-100 border-y border-slate-200 cursor-ns-resize flex items-center justify-center group transition select-none shrink-0"
                title="Drag up/down to adjust panel heights"
              >
                <div className="w-8 h-1 rounded-full bg-slate-300 group-hover:bg-blue-500 transition" />
              </div>

              <div style={{ height: `calc(${100 - layerPanelHeightPercent}% - 8px)` }} className="overflow-hidden">
                <StudioPropertyPanel
                  selectedLayer={selectedLayer}
                  selectedLayerIds={selectedLayerIds}
                  fields={fields}
                  fonts={fonts}
                  onUpdateLayer={handleUpdateLayer}
                  onUpdateField={handleUpdateField}
                  onAddField={handleAddField}
                  onOpenMediaPickerForLayer={handleOpenMediaPickerForLayer}
                  onOpenMediaPickerForOption={handleOpenMediaPickerForOption}
                  onOpenMediaPickerForBatchOptions={handleOpenMediaPickerForBatchOptions}
                  onPreviewOptionChoice={handlePreviewOptionChoice}
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
        multiSelect={pickerMultiSelect}
        onSelect={async (selectedFiles) => {
          if (selectedFiles.length > 0) {
            await handleSelectMediaAssets(selectedFiles);
          }
          setMediaPickerOpen(false);
        }}
      />

      {/* Amazon-Style Customer Photo Upload & Customization Modal */}
      {photoUploadModalOpen && photoUploadTargetLayerId && (() => {
        const targetLayer = layers.find((l) => l.id === photoUploadTargetLayerId);
        const targetProps = targetLayer?.properties || {};

        const linkedMaskLayer = layers.find(
          (l) => l.id === targetLayer?.maskLayerId || (l.layerType === "MASK" && l.parentPhotoUploadId === targetLayer?.id)
        );
        const mProps = linkedMaskLayer?.properties || {};

        return (
          <StudioPhotoUploadModal
            isOpen={photoUploadModalOpen}
            title={targetProps.fieldLabel || "Upload & Customise Your Photo"}
            helpText={targetProps.helpText || "Upload a high-resolution JPG or PNG for best print quality."}
            maskShape={mProps.maskShape || targetProps.maskShape || "RECTANGLE"}
            maskAssetUrl={mProps.maskAssetUrl || targetProps.maskAssetUrl}
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

      {/* Storefront Customer Live Preview & Form Modal */}
      <StudioStorefrontPreviewModal
        isOpen={storefrontPreviewOpen}
        onClose={() => setStorefrontPreviewOpen(false)}
        artworkTitle={title}
        screens={screens}
        screenFieldConfig={screenFieldConfig}
        fields={fields}
        rules={rules}
        widthPx={widthPx}
        heightPx={heightPx}
        fonts={fonts}
      />

      {/* Unsaved Changes Confirmation Modal */}
      {showCloseConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0 font-bold text-lg">
                ⚠️
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Save Unsaved Changes?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  You have made changes in this artwork studio. Would you like to save them before leaving?
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleSaveAndClose}
                disabled={isSaving}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save & Close</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDiscardAndClose}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-rose-50 border border-slate-300 hover:border-rose-300 text-slate-700 hover:text-rose-700 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Discard Changes & Exit</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCloseConfirmModal(false)}
                className="w-full py-2 px-4 bg-transparent hover:bg-slate-100 text-slate-500 font-semibold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
