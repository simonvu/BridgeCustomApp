import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Type,
  Plus,
  UploadCloud,
  Search,
  Check,
  Trash2,
  Sparkles,
  Globe,
  FileCode,
  Star,
  RefreshCw,
} from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import prisma from "../db.server";
import { getTeamUserId } from "../services/auth.server";
import { injectFontStylesheets, type FontItem } from "../utils/fontLoader";

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUserId = await getTeamUserId(request);
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    include: { userRoles: { include: { role: true } } },
  });

  const fontModel = (prisma as any).font;
  const fonts: FontItem[] = fontModel
    ? await fontModel.findMany({
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      })
    : [];

  return json({
    currentUser: {
      email: currentUser?.email || "admin@bridgecustom.com",
      name: currentUser?.name || "Super Admin",
      roleName: currentUser?.userRoles?.[0]?.role?.code?.toUpperCase() || "SUPER_ADMIN",
      avatarUrl: currentUser?.avatarUrl || null,
    },
    fonts,
  });
}

// Popular Google Font suggestions for 1-click addition
const POPULAR_GOOGLE_FONTS = [
  { name: "Dancing Script", family: "Dancing Script", category: "Handwriting" },
  { name: "Playfair Display", family: "Playfair Display", category: "Serif" },
  { name: "Montserrat", family: "Montserrat", category: "Sans-Serif" },
  { name: "Pacifico", family: "Pacifico", category: "Handwriting" },
  { name: "Caveat", family: "Caveat", category: "Handwriting" },
  { name: "Lobster", family: "Lobster", category: "Display" },
  { name: "Great Vibes", family: "Great Vibes", category: "Calligraphy" },
  { name: "Cinzel", family: "Cinzel", category: "Serif" },
  { name: "Alex Brush", family: "Alex Brush", category: "Calligraphy" },
  { name: "Bebas Neue", family: "Bebas Neue", category: "Display" },
  { name: "Sacramento", family: "Sacramento", category: "Handwriting" },
  { name: "Satisfy", family: "Satisfy", category: "Handwriting" },
];

export default function FontsRoute() {
  const { currentUser, fonts: initialFonts } = useLoaderData<typeof loader>();
  const [fonts, setFonts] = useState<FontItem[]>(initialFonts);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "GOOGLE" | "CUSTOM">("ALL");
  const [previewText, setPreviewText] = useState("The quick brown fox jumps over the lazy dog 123");

  // Modal States
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add Google Font Form
  const [googleFontName, setGoogleFontName] = useState("");

  // Add Custom Font Form
  const [customFontName, setCustomFontName] = useState("");
  const [customFontFile, setCustomFontFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Inject font stylesheets on load and update
  useEffect(() => {
    injectFontStylesheets(fonts);
  }, [fonts]);

  // Fetch Latest Fonts
  const fetchFonts = async () => {
    try {
      const res = await fetch("/api/fonts");
      const data = await res.json();
      if (data.fonts) setFonts(data.fonts);
    } catch (e) {
      console.error("Failed to refresh fonts:", e);
    }
  };

  // Add Google Font Handler
  const handleAddGoogleFont = async (fontFamilyName?: string) => {
    const familyToUse = fontFamilyName || googleFontName.trim();
    if (!familyToUse) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/fonts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ADD_GOOGLE_FONT",
          name: familyToUse,
          family: familyToUse,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setGoogleModalOpen(false);
        setGoogleFontName("");
        await fetchFonts();
      } else {
        alert(data.error || "Failed to add Google Font");
      }
    } catch (e) {
      alert("Error adding Google Font");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Custom Font Upload & Add Handler
  const handleUploadCustomFont = async () => {
    if (!customFontName.trim() || !customFontFile) {
      alert("Please enter a font name and select a font file (.ttf, .otf, .woff, .woff2)");
      return;
    }

    setIsUploading(true);
    try {
      // Upload font file via /api/upload
      const formData = new FormData();
      formData.append("file", customFontFile);
      formData.append("folder", "fonts");

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadRes.json();
      if (!uploadData.url) {
        alert(uploadData.error || "Font file upload failed");
        setIsUploading(false);
        return;
      }

      // Register custom font in DB
      const res = await fetch("/api/fonts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ADD_CUSTOM_FONT",
          name: customFontName.trim(),
          family: customFontName.trim().replace(/[^a-zA-Z0-9_-]/g, ""),
          sourceUrl: uploadData.url,
          fileKey: uploadData.key || null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCustomModalOpen(false);
        setCustomFontName("");
        setCustomFontFile(null);
        await fetchFonts();
      } else {
        alert(data.error || "Failed to save custom font");
      }
    } catch (e) {
      console.error(e);
      alert("Error uploading custom font file");
    } finally {
      setIsUploading(false);
    }
  };

  // Set Default Font Handler
  const handleSetDefault = async (fontId: string) => {
    try {
      const res = await fetch("/api/fonts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SET_DEFAULT_FONT", id: fontId }),
      });
      if (res.ok) await fetchFonts();
    } catch (e) {
      console.error(e);
    }
  };

  // Delete Font Handler
  const handleDeleteFont = async (fontId: string, fontName: string) => {
    if (!confirm(`Are you sure you want to delete the font '${fontName}'?`)) return;

    try {
      const res = await fetch("/api/fonts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE_FONT", id: fontId }),
      });
      if (res.ok) await fetchFonts();
    } catch (e) {
      console.error(e);
    }
  };

  // Filtered Fonts List
  const filteredFonts = fonts.filter((f) => {
    const matchesSearch =
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.family.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "ALL" || f.fontType === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <DashboardLayout currentUser={currentUser} activeItem="fonts">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-50 text-[#005bd3] rounded-lg">
                <Type className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold text-[#303030]">Font Library & Management</h1>
            </div>
            <p className="text-xs text-[#616161] mt-1">
              Manage Google Fonts and Custom Uploaded Font Files for Personalization Artworks
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setGoogleModalOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg px-3.5 py-2 transition shadow-2xs cursor-pointer"
            >
              <Globe className="w-4 h-4 text-blue-600" />
              <span>+ Add Google Font</span>
            </button>

            <button
              onClick={() => setCustomModalOpen(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#005bd3] hover:bg-[#004bb5] rounded-lg px-4 py-2 transition shadow-2xs cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>+ Upload Custom Font</span>
            </button>
          </div>
        </div>

        {/* Filter & Live Preview Controls Bar */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search fonts by name or family..."
                className="w-full text-xs font-medium text-[#303030] bg-gray-50 border border-gray-300 rounded-lg pl-9 pr-3 py-2 focus:bg-white focus:ring-2 focus:ring-[#005bd3] outline-none"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200 text-xs font-semibold">
              <button
                onClick={() => setFilterType("ALL")}
                className={`px-3 py-1 rounded-md transition cursor-pointer ${
                  filterType === "ALL" ? "bg-white text-[#303030] shadow-2xs" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                All Fonts ({fonts.length})
              </button>
              <button
                onClick={() => setFilterType("GOOGLE")}
                className={`px-3 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  filterType === "GOOGLE" ? "bg-white text-[#005bd3] shadow-2xs font-bold" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Globe className="w-3 h-3" /> Google Fonts ({fonts.filter((f) => f.fontType === "GOOGLE").length})
              </button>
              <button
                onClick={() => setFilterType("CUSTOM")}
                className={`px-3 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                  filterType === "CUSTOM" ? "bg-white text-purple-700 shadow-2xs font-bold" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <FileCode className="w-3 h-3" /> Custom Fonts ({fonts.filter((f) => f.fontType === "CUSTOM").length})
              </button>
            </div>
          </div>

          {/* Live Preview Text Customizer */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider shrink-0">
              Live Preview Snippet:
            </span>
            <input
              type="text"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              className="flex-1 text-xs font-medium text-[#303030] bg-gray-50 border border-gray-200 rounded-lg px-3 py-1 focus:bg-white focus:ring-1 focus:ring-[#005bd3] outline-none"
              placeholder="Type custom text to preview across all fonts..."
            />
          </div>
        </div>

        {/* Fonts Grid */}
        {filteredFonts.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center space-y-3">
            <Type className="w-10 h-10 text-gray-300 mx-auto" />
            <h3 className="text-sm font-bold text-gray-700">No fonts found</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Add Google Fonts or upload custom font files (.ttf, .otf, .woff, .woff2) to use in your text personalization layers.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFonts.map((font) => (
              <div
                key={font.id}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs hover:shadow-md transition flex flex-col justify-between space-y-3 relative group"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-bold text-sm text-[#303030] truncate" title={font.name}>
                      {font.name}
                    </h3>
                    {font.isDefault && (
                      <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-500" /> Default
                      </span>
                    )}
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      font.fontType === "GOOGLE"
                        ? "bg-blue-50 text-[#005bd3] border-blue-200"
                        : "bg-purple-50 text-purple-700 border-purple-200"
                    }`}
                  >
                    {font.fontType}
                  </span>
                </div>

                {/* Live Font Sample Rendering Area */}
                <div className="bg-gray-50/70 border border-gray-100 rounded-lg p-3 min-h-[90px] flex items-center justify-center text-center overflow-hidden">
                  <p
                    style={{ fontFamily: font.family }}
                    className="text-2xl text-slate-900 leading-snug break-words max-w-full truncate"
                  >
                    {previewText || "Sample Text"}
                  </p>
                </div>

                {/* Card Footer Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                  <span className="text-[11px] font-mono text-gray-500 truncate" title={font.family}>
                    family: '{font.family}'
                  </span>

                  <div className="flex items-center gap-1.5">
                    {!font.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(font.id)}
                        className="text-[11px] font-semibold text-gray-600 hover:text-amber-700 hover:bg-amber-50 px-2 py-1 rounded transition cursor-pointer"
                        title="Set as Default Font"
                      >
                        Make Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteFont(font.id, font.name)}
                      className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition cursor-pointer"
                      title="Delete Font"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Google Font Modal */}
        {googleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-blue-600" />
                  <h2 className="font-bold text-sm text-[#303030]">Add Google Font</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setGoogleModalOpen(false)}
                  className="text-gray-400 hover:text-gray-700 p-1 rounded-lg"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#303030] mb-1">
                    Google Font Family Name
                  </label>
                  <input
                    type="text"
                    value={googleFontName}
                    onChange={(e) => setGoogleFontName(e.target.value)}
                    placeholder="e.g. Playfair Display, Dancing Script, Pacifico..."
                    className="w-full text-xs font-medium text-[#303030] bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#005bd3] outline-none"
                  />
                </div>

                {/* Popular Quick Suggestions */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">
                    Popular Google Font Recommendations:
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-gray-50 border border-gray-200 rounded-lg">
                    {POPULAR_GOOGLE_FONTS.map((gf) => (
                      <button
                        key={gf.name}
                        type="button"
                        onClick={() => handleAddGoogleFont(gf.family)}
                        disabled={isSubmitting}
                        className="text-xs font-medium bg-white hover:bg-blue-50 hover:text-[#005bd3] border border-gray-200 rounded-lg px-2.5 py-1 transition cursor-pointer shadow-2xs"
                      >
                        + {gf.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 border-t border-gray-200 px-6 py-3.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setGoogleModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleAddGoogleFont()}
                  disabled={isSubmitting || !googleFontName.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#005bd3] hover:bg-[#004bb5] rounded-lg shadow-2xs disabled:opacity-50"
                >
                  {isSubmitting ? "Adding..." : "Add Google Font"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Custom Font Modal */}
        {customModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-purple-600" />
                  <h2 className="font-bold text-sm text-[#303030]">Upload Custom Font File</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomModalOpen(false)}
                  className="text-gray-400 hover:text-gray-700 p-1 rounded-lg"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#303030] mb-1">
                    Custom Font Display Name
                  </label>
                  <input
                    type="text"
                    value={customFontName}
                    onChange={(e) => setCustomFontName(e.target.value)}
                    placeholder="e.g. My Handwriting Bold, Vintage Script..."
                    className="w-full text-xs font-medium text-[#303030] bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#005bd3] outline-none"
                  />
                </div>

                {/* Font File Picker Area */}
                <div>
                  <label className="block text-xs font-semibold text-[#303030] mb-1">
                    Font File (.ttf, .otf, .woff, .woff2)
                  </label>
                  <div className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-xl p-6 text-center bg-gray-50 transition relative">
                    <input
                      type="file"
                      accept=".ttf,.otf,.woff,.woff2"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setCustomFontFile(e.target.files[0]);
                          if (!customFontName) {
                            const nameWithoutExt = e.target.files[0].name.replace(/\.[^/.]+$/, "");
                            setCustomFontName(nameWithoutExt);
                          }
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <UploadCloud className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    {customFontFile ? (
                      <div>
                        <p className="text-xs font-bold text-[#005bd3]">{customFontFile.name}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {(customFontFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-semibold text-gray-700">
                          Click to upload or drag font file here
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Supports TTF, OTF, WOFF, WOFF2
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 border-t border-gray-200 px-6 py-3.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCustomModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUploadCustomFont}
                  disabled={isUploading || !customFontName.trim() || !customFontFile}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#005bd3] hover:bg-[#004bb5] rounded-lg shadow-2xs disabled:opacity-50"
                >
                  {isUploading ? "Uploading & Saving..." : "Upload Font"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
