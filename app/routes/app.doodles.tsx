import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import React, { useState, useRef } from "react";
import { PrismaClient } from "@prisma/client";
import DashboardLayout from "../components/DashboardLayout";
import { getTeamUserId } from "../services/auth.server";
import prisma from "../db.server";
import {
  Sparkles,
  Plus,
  Trash2,
  UploadCloud,
  FolderPlus,
  Layers,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Edit2,
  RefreshCw,
  Image as ImageIcon,
  ChevronRight,
  ArrowLeft,
  FileImage,
  HelpCircle,
} from "lucide-react";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getTeamUserId(request);
  const currentUser = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true, avatarUrl: true },
      })
    : null;

  const packs = await prisma.doodlePack.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      styles: {
        orderBy: { sortOrder: "asc" },
        include: {
          letters: true,
        },
      },
    },
  });

  return json({ currentUser, packs });
}

export default function AppDoodlesRoute() {
  const { currentUser, packs: initialPacks } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const [packs, setPacks] = useState<any[]>(initialPacks || []);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(initialPacks?.[0]?.id || null);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showCreatePackModal, setShowCreatePackModal] = useState(false);
  const [newPackName, setNewPackName] = useState("");
  const [newPackDesc, setNewPackDesc] = useState("");
  const [isSubmittingPack, setIsSubmittingPack] = useState(false);

  const [showCreateStyleModal, setShowCreateStyleModal] = useState(false);
  const [newStyleName, setNewStyleName] = useState("");
  const [isSubmittingStyle, setIsSubmittingStyle] = useState(false);

  const [autoNamingRule, setAutoNamingRule] = useState<"AUTO_CASE" | "LOWERCASE" | "UPPERCASE" | "NUMBER">("AUTO_CASE");
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when reloaded
  React.useEffect(() => {
    setPacks(initialPacks || []);
  }, [initialPacks]);

  const activePack = packs.find((p) => p.id === selectedPackId) || packs[0];
  const activeStyle = activePack?.styles?.find((s: any) => s.id === selectedStyleId) || activePack?.styles?.[0];

  const uppercaseList = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)); // A-Z (1-26)
  const lowercaseList = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i)); // a-z (28-53)
  const specialList = ["#", "@", "?", "&"]; // 55=#, 56=@, 57=?, 58=&
  const digitsList = Array.from({ length: 10 }, (_, i) => String(i)); // 0-9 (59-68)
  const [activeCharTab, setActiveCharTab] = useState<"UPPERCASE" | "LOWERCASE" | "SPECIAL" | "DIGITS" | "ALL">("UPPERCASE");

  // Handlers
  const handleCreatePack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPackName.trim()) return;

    setIsSubmittingPack(true);
    try {
      const res = await fetch("/api/doodles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _action: "CREATE_PACK",
          name: newPackName.trim(),
          description: newPackDesc.trim(),
        }),
      });

      const data = await res.json();
      if (data.success && data.pack) {
        setShowCreatePackModal(false);
        setNewPackName("");
        setNewPackDesc("");
        revalidator.revalidate();
        setSelectedPackId(data.pack.id);
      } else {
        alert(data.error || "Failed to create doodle pack");
      }
    } catch (err: any) {
      alert("Failed to create doodle pack: " + err.message);
    } finally {
      setIsSubmittingPack(false);
    }
  };

  const handleCreateStyle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStyleName.trim() || !activePack) return;

    setIsSubmittingStyle(true);
    try {
      const res = await fetch("/api/doodles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _action: "CREATE_STYLE",
          packId: activePack.id,
          name: newStyleName.trim(),
        }),
      });

      const data = await res.json();
      if (data.success && data.style) {
        setShowCreateStyleModal(false);
        setNewStyleName("");
        revalidator.revalidate();
        setSelectedStyleId(data.style.id);
      } else {
        alert(data.error || "Failed to create doodle style");
      }
    } catch (err: any) {
      alert("Failed to create doodle style: " + err.message);
    } finally {
      setIsSubmittingStyle(false);
    }
  };

  const handleDeletePack = async (packId: string, packName: string) => {
    if (!confirm(`Are you sure you want to delete pack "${packName}"? All styles & letters will be deleted.`)) return;

    try {
      const res = await fetch("/api/doodles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _action: "DELETE_PACK",
          packId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (selectedPackId === packId) setSelectedPackId(null);
        revalidator.revalidate();
      }
    } catch (err: any) {
      alert("Failed to delete pack");
    }
  };

  const handleDeleteStyle = async (styleId: string, styleName: string) => {
    if (!confirm(`Are you sure you want to delete style "${styleName}"?`)) return;

    try {
      const res = await fetch("/api/doodles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _action: "DELETE_STYLE",
          styleId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (selectedStyleId === styleId) setSelectedStyleId(null);
        revalidator.revalidate();
      }
    } catch (err: any) {
      alert("Failed to delete style");
    }
  };

  const handleClearStyleLetters = async (styleId: string, styleName: string) => {
    if (!confirm(`Clear all mapped PNG letters in "${styleName}" so you can re-upload?`)) return;

    try {
      const res = await fetch("/api/doodles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _action: "CLEAR_STYLE_LETTERS",
          styleId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        revalidator.revalidate();
      }
    } catch (err: any) {
      alert("Failed to clear letters");
    }
  };

  const handleBulkUploadFiles = async (filesList: FileList | File[]) => {
    if (!activeStyle || !filesList || filesList.length === 0) return;

    const allFiles = Array.from(filesList);
    setIsUploadingFiles(true);
    
    const BATCH_SIZE = 10;
    const totalFiles = allFiles.length;
    let uploadedCount = 0;

    try {
      for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
        const chunk = allFiles.slice(i, i + BATCH_SIZE);
        setUploadProgress(`Uploading files ${i + 1}-${Math.min(i + BATCH_SIZE, totalFiles)} of ${totalFiles}...`);

        const formData = new FormData();
        formData.append("_action", "BULK_UPLOAD_LETTERS");
        formData.append("styleId", activeStyle.id);
        formData.append("autoNamingRule", autoNamingRule);

        chunk.forEach((f) => formData.append("files", f));

        const res = await fetch("/api/doodles", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Failed batch upload");
        }

        uploadedCount += chunk.length;
      }

      setUploadProgress(`Successfully uploaded all ${totalFiles} PNG letters!`);
      revalidator.revalidate();
    } catch (err: any) {
      alert("Error uploading files: " + err.message);
    } finally {
      setIsUploadingFiles(false);
      setUploadProgress(null);
    }
  };

  const filteredPacks = packs.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout currentUser={currentUser}>
      <div className="p-6 max-w-7xl mx-auto space-y-6 select-none">
        {/* HEADER SECTION */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-2xl shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-md">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Doodle Alphabet Packs</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-extrabold">
                  {packs.length} Packs
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Manage multi-style doodle alphabet packs, bulk upload PNG letter sets, and auto-map A-Z characters
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search Doodle Packs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowCreatePackModal(true)}
              className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Doodle Pack</span>
            </button>
          </div>
        </div>

        {/* MAIN BODY: PACKS NAV + STYLE DETAILS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: DOODLE PACKS LIST (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Doodle Pack</h2>
              <span className="text-[11px] font-semibold text-slate-400">{filteredPacks.length} packs found</span>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {filteredPacks.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
                  <FileImage className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-500">No Doodle Packs created yet.</p>
                  <button
                    type="button"
                    onClick={() => setShowCreatePackModal(true)}
                    className="text-xs text-indigo-600 font-bold hover:underline"
                  >
                    + Create your first Doodle Pack
                  </button>
                </div>
              ) : (
                filteredPacks.map((pack) => {
                  const isSelected = pack.id === activePack?.id;
                  const totalLetters = (pack.styles || []).reduce((acc: number, s: any) => acc + (s.letters?.length || 0), 0);

                  return (
                    <div
                      key={pack.id}
                      onClick={() => {
                        setSelectedPackId(pack.id);
                        setSelectedStyleId(pack.styles?.[0]?.id || null);
                      }}
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? "bg-indigo-50/80 border-indigo-400 shadow-xs"
                          : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center">
                          {pack.thumbnailUrl ? (
                            <img src={pack.thumbnailUrl} alt={pack.name} className="w-full h-full object-contain p-1" />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-slate-300" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <h3 className={`text-xs font-bold truncate ${isSelected ? "text-indigo-950" : "text-slate-800"}`}>
                            {pack.name}
                          </h3>
                          <p className="text-[10px] font-mono text-slate-400 truncate">{pack.code}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {pack.styles?.length || 0} Styles
                            </span>
                            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                              {totalLetters} Letters
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePack(pack.id, pack.name);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete Pack"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className={`w-4 h-4 ${isSelected ? "text-indigo-600" : "text-slate-300"}`} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: PACK STYLES & LETTER GRID (8 cols) */}
          <div className="lg:col-span-8 space-y-5">
            {activePack ? (
              <>
                {/* PACK TITLE BAR */}
                <div className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-extrabold text-slate-900">{activePack.name}</h2>
                      <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200">
                        {activePack.code}
                      </span>
                    </div>
                    {activePack.description && (
                      <p className="text-xs text-slate-500 font-medium mt-0.5">{activePack.description}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCreateStyleModal(true)}
                    className="h-8 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add New Style Variant</span>
                  </button>
                </div>

                {/* STYLES TABS */}
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
                  {(activePack.styles || []).map((st: any, idx: number) => {
                    const isStyleActive = st.id === activeStyle?.id;
                    const letterCount = st.letters?.length || 0;

                    return (
                      <div
                        key={st.id}
                        onClick={() => setSelectedStyleId(st.id)}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition shrink-0 border ${
                          isStyleActive
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                            : "bg-white text-slate-600 hover:bg-slate-100 border-slate-200"
                        }`}
                      >
                        <span>{st.name || `Style ${idx + 1}`}</span>
                        <span
                          className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                            isStyleActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {letterCount} PNGs
                        </span>
                        {activePack.styles.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteStyle(st.id, st.name);
                            }}
                            className={`p-0.5 rounded transition ${
                              isStyleActive ? "hover:bg-indigo-700 text-indigo-200" : "hover:bg-slate-200 text-slate-400"
                            }`}
                            title="Delete Style"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* BULK DRAG & DROP PNG UPLOAD ZONE */}
                {activeStyle && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UploadCloud className="w-4 h-4 text-indigo-600" />
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          Bulk Upload PNG Letter Set for "{activeStyle.name}"
                        </h3>
                      </div>

                      {/* AUTO NAMING RULE TOGGLE & CLEAR BUTTON */}
                      <div className="flex items-center gap-2">
                        {activeStyle.letters?.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleClearStyleLetters(activeStyle.id, activeStyle.name)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer flex items-center gap-1"
                            title="Clear all uploaded PNG mappings for this style to start fresh"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Clear PNGs</span>
                          </button>
                        )}

                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setAutoNamingRule("AUTO_CASE")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                              autoNamingRule === "AUTO_CASE"
                                ? "bg-white text-indigo-700 shadow-2xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                            title="Preserve Case: A.png ➔ 'A', a.png ➔ 'a', 0.png ➔ '0'"
                          >
                            Auto Case
                          </button>
                          <button
                            type="button"
                            onClick={() => setAutoNamingRule("LOWERCASE")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                              autoNamingRule === "LOWERCASE"
                                ? "bg-white text-indigo-700 shadow-2xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                            title="Force Lowercase: Map files to 'a'-'z'"
                          >
                            a.png ➔ 'a'
                          </button>
                          <button
                            type="button"
                            onClick={() => setAutoNamingRule("UPPERCASE")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                              autoNamingRule === "UPPERCASE"
                                ? "bg-white text-indigo-700 shadow-2xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                            title="Force Uppercase: Map files to 'A'-'Z'"
                          >
                            A.png ➔ 'A'
                          </button>
                          <button
                            type="button"
                            onClick={() => setAutoNamingRule("NUMBER")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                              autoNamingRule === "NUMBER"
                                ? "bg-white text-indigo-700 shadow-2xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                            title="Order Rule: 1-26 ➔ A-Z, 28-53 ➔ a-z, 55 ➔ #, 56 ➔ @, 57 ➔ ?, 58 ➔ &, 59-68 ➔ 0-9"
                          >
                            1.png ➔ 'A' (Rules 1-68)
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* DRAG & DROP DROPZONE */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          handleBulkUploadFiles(e.dataTransfer.files);
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
                        dragOver
                          ? "border-indigo-500 bg-indigo-50/60"
                          : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/png,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleBulkUploadFiles(e.target.files);
                          }
                        }}
                      />

                      <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <UploadCloud className="w-5 h-5" />
                      </div>

                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          Click to select or Drag & Drop your full set of PNG letters here
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                          Upload 26+ PNG images at once (e.g. A.png - Z.png or 1.png - 26.png). Transparent PNGs recommended.
                        </p>
                      </div>
                    </div>

                    {/* NUMBERED ORDER MAPPING RULE HINT BOX */}
                    <div className="bg-indigo-50/60 border border-indigo-100/90 rounded-xl p-3.5 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-extrabold text-indigo-950 text-[11px] uppercase tracking-wider">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Numbered File Order Mapping Guide (1.png – 68.png)</span>
                        </div>
                        <span className="text-[10px] font-extrabold text-indigo-700 bg-white border border-indigo-200/80 px-2 py-0.5 rounded-full shadow-2xs">
                          Auto-Mapped
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 font-mono text-[11px]">
                        <div className="bg-white border border-indigo-100 px-3 py-1.5 rounded-lg flex items-center justify-between shadow-2xs">
                          <span className="bg-indigo-100/80 text-indigo-800 font-extrabold px-1.5 py-0.5 rounded text-[10px]">
                            1 – 26
                          </span>
                          <span className="text-slate-400 font-sans">➔</span>
                          <span className="font-extrabold text-slate-800 font-sans">A – Z</span>
                        </div>

                        <div className="bg-white border border-indigo-100 px-3 py-1.5 rounded-lg flex items-center justify-between shadow-2xs">
                          <span className="bg-indigo-100/80 text-indigo-800 font-extrabold px-1.5 py-0.5 rounded text-[10px]">
                            28 – 53
                          </span>
                          <span className="text-slate-400 font-sans">➔</span>
                          <span className="font-extrabold text-slate-800 font-sans">a – z</span>
                        </div>

                        <div className="bg-white border border-indigo-100 px-3 py-1.5 rounded-lg flex items-center justify-between shadow-2xs">
                          <span className="bg-indigo-100/80 text-indigo-800 font-extrabold px-1.5 py-0.5 rounded text-[10px]">
                            55 – 58
                          </span>
                          <span className="text-slate-400 font-sans">➔</span>
                          <span className="font-extrabold text-slate-800 font-sans"># @ ? &</span>
                        </div>

                        <div className="bg-white border border-indigo-100 px-3 py-1.5 rounded-lg flex items-center justify-between shadow-2xs">
                          <span className="bg-indigo-100/80 text-indigo-800 font-extrabold px-1.5 py-0.5 rounded text-[10px]">
                            59 – 68
                          </span>
                          <span className="text-slate-400 font-sans">➔</span>
                          <span className="font-extrabold text-slate-800 font-sans">0 – 9</span>
                        </div>
                      </div>
                    </div>

                    {/* UPLOADING SPINNER INDICATOR */}
                    {isUploadingFiles && (
                      <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3 animate-pulse">
                        <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-bold text-indigo-900">{uploadProgress}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* A-Z, a-z, 0-9 VISUAL CHARACTER GRID CARD VIEW */}
                {activeStyle && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                          Doodle Character Grid ({activeStyle.name})
                        </h3>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Visual mapping preview for 26 Uppercase (A-Z), 26 Lowercase (a-z), and 10 Digits (0-9)
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* TAB FILTER BUTTONS */}
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setActiveCharTab("UPPERCASE")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                              activeCharTab === "UPPERCASE"
                                ? "bg-white text-indigo-700 shadow-2xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            A-Z (26)
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveCharTab("LOWERCASE")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                              activeCharTab === "LOWERCASE"
                                ? "bg-white text-indigo-700 shadow-2xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            a-z (26)
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveCharTab("SPECIAL")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                              activeCharTab === "SPECIAL"
                                ? "bg-white text-indigo-700 shadow-2xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Symbol (#@?&)
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveCharTab("DIGITS")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                              activeCharTab === "DIGITS"
                                ? "bg-white text-indigo-700 shadow-2xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            0-9 (10)
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveCharTab("ALL")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition cursor-pointer ${
                              activeCharTab === "ALL"
                                ? "bg-white text-indigo-700 shadow-2xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            All (66)
                          </button>
                        </div>

                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shrink-0">
                          {activeStyle.letters?.length || 0} / 66 Mapped
                        </span>
                      </div>
                    </div>

                    {/* ALPHABET, DIGITS & SYMBOLS GRID */}
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 lg:grid-cols-9 gap-2.5">
                      {(activeCharTab === "UPPERCASE"
                        ? uppercaseList
                        : activeCharTab === "LOWERCASE"
                        ? lowercaseList
                        : activeCharTab === "SPECIAL"
                        ? specialList
                        : activeCharTab === "DIGITS"
                        ? digitsList
                        : [...uppercaseList, ...lowercaseList, ...specialList, ...digitsList]
                      ).map((char) => {
                        // Check exact char match
                        const exactObj = (activeStyle.letters || []).find((l: any) => l.char === char);
                        // Check fallback match (e.g. uppercase 'A' for lowercase 'a')
                        const fallbackObj = !exactObj && char !== char.toUpperCase()
                          ? (activeStyle.letters || []).find((l: any) => l.char === char.toUpperCase())
                          : null;

                        const letterObj = exactObj || fallbackObj;
                        const hasImg = Boolean(letterObj?.imageUrl);
                        const isFallback = Boolean(!exactObj && fallbackObj);

                        return (
                          <div
                            key={char}
                            className={`p-2 rounded-xl border flex flex-col items-center justify-between gap-1.5 transition ${
                              exactObj
                                ? "bg-white border-slate-200 hover:border-indigo-300 shadow-2xs"
                                : fallbackObj
                                ? "bg-indigo-50/40 border-indigo-200/80"
                                : "bg-slate-50/60 border-slate-200 opacity-60"
                            }`}
                          >
                            <span className="text-[11px] font-extrabold text-slate-700 bg-slate-100 w-5 h-5 rounded flex items-center justify-center">
                              {char}
                            </span>

                            <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100 p-0.5">
                              {hasImg ? (
                                <img src={letterObj.imageUrl} alt={char} className="w-full h-full object-contain" />
                              ) : (
                                <span className="text-[10px] font-bold text-slate-300">N/A</span>
                              )}
                            </div>

                            <span
                              className={`text-[9px] font-extrabold px-1 rounded ${
                                exactObj
                                  ? "text-emerald-700 bg-emerald-50"
                                  : isFallback
                                  ? "text-indigo-700 bg-indigo-50"
                                  : "text-slate-400 bg-slate-100"
                              }`}
                            >
                              {exactObj ? "Mapped" : isFallback ? `Auto (${char.toUpperCase()})` : "Missing"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
                <Sparkles className="w-10 h-10 text-indigo-400 mx-auto" />
                <h3 className="text-base font-bold text-slate-800">Select or Create a Doodle Pack</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto font-medium">
                  Choose a Doodle Pack from the left navigation or create a new pack to start uploading PNG letter sets.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreatePackModal(true)}
                  className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Doodle Pack</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* MODAL: CREATE NEW DOODLE PACK */}
        {showCreatePackModal && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
            onClick={() => setShowCreatePackModal(false)}
          >
            <form
              onSubmit={handleCreatePack}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 cursor-default"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <FolderPlus className="w-4 h-4 text-indigo-600" />
                  <span>Create New Doodle Pack</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreatePackModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Doodle Pack Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Christmas Candy Cane Alphabet"
                    value={newPackName}
                    onChange={(e) => setNewPackName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Description (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Describe this doodle font pack e.g. Festive candy stripe & leopard pattern font..."
                    value={newPackDesc}
                    onChange={(e) => setNewPackDesc(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreatePackModal(false)}
                  className="h-9 px-4 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPack}
                  className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  {isSubmittingPack ? "Creating..." : "Create Pack"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* MODAL: CREATE NEW STYLE VARIANT */}
        {showCreateStyleModal && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
            onClick={() => setShowCreateStyleModal(false)}
          >
            <form
              onSubmit={handleCreateStyle}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 cursor-default"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>Add New Style Variant for "{activePack?.name}"</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateStyleModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Style Variant Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Style 2 - Leopard Print or Style 3 - Glitter Holly"
                  value={newStyleName}
                  onChange={(e) => setNewStyleName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateStyleModal(false)}
                  className="h-9 px-4 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStyle}
                  className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  {isSubmittingStyle ? "Adding Style..." : "Add Style"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
