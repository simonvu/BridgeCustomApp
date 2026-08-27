import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, Upload, Check, ChevronDown, Sparkles, X, Type, Loader2, Plus, Globe, CheckCircle2, AlertCircle } from "lucide-react";
import { FontItem, loadSingleFontOnDemand } from "../../utils/fontLoader";

interface StudioFontPickerProps {
  selectedFont: string;
  fonts: FontItem[];
  onSelectFont: (fontFamily: string) => void;
  onFontUploaded?: (newFont: FontItem) => void;
  isFontLoading?: boolean;
}

export default function StudioFontPicker({
  selectedFont,
  fonts,
  onSelectFont,
  onFontUploaded,
  isFontLoading = false,
}: StudioFontPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(30);

  // Portal mount state for body portal rendering
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Floating coordinates for breaking out of parent overflow-x-auto clipping containers
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Add Font Modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [activeAddTab, setActiveAddTab] = useState<"FILE" | "GOOGLE">("FILE");
  const [fontNameInput, setFontNameInput] = useState("");
  const [googleFontFamily, setGoogleFontFamily] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Google Font Live Verification state
  const [isVerifyingGoogleFont, setIsVerifyingGoogleFont] = useState(false);
  const [googleFontValidation, setGoogleFontValidation] = useState<{
    status: "idle" | "valid" | "invalid";
    message?: string;
    fontFamily?: string;
  }>({ status: "idle" });

  // Debounced Google Font live verification against Google Fonts CSS API
  useEffect(() => {
    if (activeAddTab !== "GOOGLE" || !googleFontFamily.trim()) {
      setGoogleFontValidation({ status: "idle" });
      setIsVerifyingGoogleFont(false);
      return;
    }

    setIsVerifyingGoogleFont(true);
    setGoogleFontValidation({ status: "idle" });

    const timer = setTimeout(async () => {
      const query = googleFontFamily.trim();
      try {
        const encoded = encodeURIComponent(query);
        const res = await fetch(`https://fonts.googleapis.com/css2?family=${encoded}:wght@400;700&display=swap`);
        if (res.ok) {
          setGoogleFontValidation({
            status: "valid",
            message: `Font "${query}" was found on Google Fonts!`,
            fontFamily: query,
          });
        } else {
          setGoogleFontValidation({
            status: "invalid",
            message: `Font "${query}" not found on Google Fonts. Please check spelling or search fonts.google.com`,
          });
        }
      } catch (err) {
        setGoogleFontValidation({
          status: "invalid",
          message: "Unable to connect to Google Fonts API. Please check your internet connection.",
        });
      } finally {
        setIsVerifyingGoogleFont(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [googleFontFamily, activeAddTab]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Current selected font object
  const selectedFontObj = useMemo(() => {
    return (
      fonts.find((f) => f.family.toLowerCase() === (selectedFont || "Roboto").toLowerCase()) || {
        name: selectedFont || "Roboto",
        family: selectedFont || "Roboto",
      }
    );
  }, [fonts, selectedFont]);

  // Search Query state (independent of input value display)
  const [searchQuery, setSearchQuery] = useState("");

  // Sync input value with selected font when not actively focused
  useEffect(() => {
    if (!isFocused) {
      setInputValue(selectedFontObj.name);
      setSearchQuery("");
    }
  }, [selectedFontObj, isFocused]);

  // Position popover card relative to window viewport to prevent overflow clipping
  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPopoverCoords({
        top: rect.bottom + 4,
        left: Math.max(10, Math.min(rect.left, window.innerWidth - 300)),
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener("scroll", updateCoords, true);
      window.addEventListener("resize", updateCoords);
      return () => {
        window.removeEventListener("scroll", updateCoords, true);
        window.removeEventListener("resize", updateCoords);
      };
    }
  }, [isOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
        setSearchQuery("");
        setInputValue(selectedFontObj.name);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedFontObj]);

  // Pinned Selected Font at Top + Search Filtered Library Fonts
  const filteredFonts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const activeFont = selectedFontObj;

    // 1. All fonts except the active selected one
    const otherFonts = fonts.filter(
      (f) => f.family.toLowerCase() !== activeFont.family.toLowerCase()
    );

    // 2. Filter & rank other fonts if user typed a search query
    let matchingOther = otherFonts;
    if (q) {
      matchingOther = otherFonts.filter(
        (f) => f.name.toLowerCase().includes(q) || f.family.toLowerCase().includes(q)
      );
      matchingOther.sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) || a.family.toLowerCase().startsWith(q);
        const bStarts = b.name.toLowerCase().startsWith(q) || b.family.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });
    }

    // 3. Active selected font is ALWAYS pinned at index 0!
    return [activeFont, ...matchingOther];
  }, [fonts, searchQuery, selectedFontObj]);

  // Reset pagination count & highlight when search changes
  useEffect(() => {
    setVisibleCount(30);
    setHighlightedIndex(0);
  }, [searchQuery]);

  // Auto-scroll dropdown list to currently selected / highlighted font
  useEffect(() => {
    if (isOpen && listRef.current) {
      const selectedIdx = filteredFonts.findIndex(
        (f) => f.family.toLowerCase() === selectedFontObj.family.toLowerCase()
      );
      if (selectedIdx >= 0) {
        setHighlightedIndex(selectedIdx);
        if (selectedIdx >= visibleCount) {
          setVisibleCount(selectedIdx + 15);
        }
        setTimeout(() => {
          const itemEl = listRef.current?.children[selectedIdx] as HTMLElement;
          if (itemEl) {
            itemEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }, 60);
      }
    }
  }, [isOpen]);

  // Infinite scroll lazy loading
  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      setVisibleCount((prev) => Math.min(prev + 30, filteredFonts.length));
    }
  };

  // Preload font faces into document.fonts as they appear in view
  useEffect(() => {
    if (isOpen) {
      const slice = filteredFonts.slice(0, visibleCount);
      slice.forEach((f) => {
        loadSingleFontOnDemand(f, fonts).catch(() => {});
      });
    }
  }, [isOpen, filteredFonts, visibleCount, fonts]);

  // Keyboard Navigation (ArrowUp, ArrowDown, Enter, Escape)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        updateCoords();
        return;
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, filteredFonts.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredFonts[highlightedIndex]) {
        onSelectFont(filteredFonts[highlightedIndex].family);
        setIsOpen(false);
        setIsFocused(false);
        inputRef.current?.blur();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setIsFocused(false);
      setInputValue(selectedFontObj.name);
      inputRef.current?.blur();
    }
  };

  // Add Font Submit Handler (File Upload or Google Font)
  const handleAddFontSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);
    setModalError(null);

    try {
      if (activeAddTab === "FILE") {
        if (!selectedFile) {
          throw new Error("Please select a font file (.ttf, .otf, .woff, .woff2)");
        }
        const name = fontNameInput.trim() || selectedFile.name.replace(/\.[^/.]+$/, "");
        const family = name;

        // 1. Upload font file to server storage
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("folder", "fonts");

        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        if (!uploadData.url) {
          throw new Error(uploadData.error || "Failed to upload font file");
        }

        // 2. Save custom font record
        const fontRes = await fetch("/api/fonts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ADD_CUSTOM_FONT",
            name,
            family,
            sourceUrl: uploadData.url,
          }),
        });

        const fontData = await fontRes.json();
        if (!fontData.success || !fontData.font) {
          throw new Error(fontData.error || "Failed to save font");
        }

        const newFont: FontItem = fontData.font;
        await loadSingleFontOnDemand(newFont, [...fonts, newFont]);
        if (onFontUploaded) onFontUploaded(newFont);
        onSelectFont(newFont.family);
      } else {
        // GOOGLE FONT
        const family = googleFontFamily.trim();
        if (!family) {
          throw new Error("Please enter a Google Font family name");
        }

        // Strict verification check before adding
        const encoded = encodeURIComponent(family);
        const checkRes = await fetch(`https://fonts.googleapis.com/css2?family=${encoded}:wght@400;700&display=swap`);
        if (!checkRes.ok) {
          throw new Error(`Google Font "${family}" was not found. Please verify exact spelling at fonts.google.com`);
        }

        const name = fontNameInput.trim() || family;

        const fontRes = await fetch("/api/fonts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ADD_GOOGLE_FONT",
            name,
            family,
          }),
        });

        const fontData = await fontRes.json();
        if (!fontData.success || !fontData.font) {
          throw new Error(fontData.error || "Failed to add Google font");
        }

        const newFont: FontItem = fontData.font;
        await loadSingleFontOnDemand(newFont, [...fonts, newFont]);
        if (onFontUploaded) onFontUploaded(newFont);
        onSelectFont(newFont.family);
      }

      setAddModalOpen(false);
      setFontNameInput("");
      setGoogleFontFamily("");
      setSelectedFile(null);
      setIsOpen(false);
    } catch (err: any) {
      setModalError(err.message || "Failed to add font");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-1 shrink-0" ref={containerRef}>
      {/* DIRECT INLINE COMBOBOX SEARCH INPUT TRIGGER */}
      <div className="relative flex items-center w-[160px] shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onFocus={() => {
            setIsFocused(true);
            setIsOpen(true);
            updateCoords();
            inputRef.current?.select();
          }}
          onChange={(e) => {
            setInputValue(e.target.value);
            setSearchQuery(e.target.value);
            if (!isOpen) {
              setIsOpen(true);
              updateCoords();
            }
          }}
          onKeyDown={handleKeyDown}
          className="h-7.5 w-full border border-slate-300 rounded-md pl-2.5 pr-6 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 hover:border-slate-400 truncate shadow-2xs transition"
          style={{ fontFamily: selectedFontObj.family, fontSize: "13px" }}
          title="Type to search font family by name..."
          placeholder="Search font..."
        />
        {isFontLoading ? (
          <Loader2 className="w-3 h-3 text-indigo-600 animate-spin absolute right-2 pointer-events-none" />
        ) : (
          <button
            type="button"
            onClick={() => {
              const nextState = !isOpen;
              setIsOpen(nextState);
              if (nextState) {
                updateCoords();
                inputRef.current?.focus();
              }
            }}
            className="absolute right-1 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>


      {/* DROPDOWN POPUP MENU (FIXED POSITIONING BREAKS OUT OF TOOLBAR OVERFLOW CLIPPING) */}
      {isOpen && (
        <div
          style={{ top: popoverCoords.top, left: popoverCoords.left }}
          className="fixed w-72 bg-white border border-slate-200 rounded-xl shadow-2xl z-[9999] animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col"
        >
          {/* DIRECT "+ ADD NEW FONT" ACTION BUTTON AT TOP OF DROPDOWN */}
          <div className="p-1.5 border-b border-slate-100 bg-indigo-50/50">
            <button
              type="button"
              onClick={() => {
                setAddModalOpen(true);
                setIsOpen(false);
              }}
              className="w-full h-7.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Font (File / Google)</span>
            </button>
          </div>

          {/* LAZY LOADED AUTOCOMPLETE FONT LIST */}
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="max-h-64 overflow-y-auto divide-y divide-slate-50 p-1"
          >
            {filteredFonts.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 space-y-1">
                <Type className="w-6 h-6 mx-auto text-slate-300" />
                <p>No font matching &quot;{inputValue}&quot;</p>
              </div>
            ) : (
              filteredFonts.slice(0, visibleCount).map((font, idx) => {
                const isSelected =
                  font.family.toLowerCase() === (selectedFont || "Roboto").toLowerCase();
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    type="button"
                    key={font.id || font.family}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => {
                      onSelectFont(font.family);
                      setIsOpen(false);
                      setIsFocused(false);
                      setSearchQuery("");
                    }}
                    className={`w-full px-2.5 py-2 text-left rounded-lg transition flex items-center justify-between group cursor-pointer ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-950 font-bold"
                        : isHighlighted
                        ? "bg-slate-100 text-slate-900"
                        : "hover:bg-slate-50 text-slate-800"
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-sm truncate block"
                          style={{ fontFamily: font.family }}
                        >
                          {font.name}
                        </span>
                        {font.fontType === "CUSTOM" && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 rounded shrink-0 uppercase">
                            Custom
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-normal truncate block">
                        The quick brown fox jumps over the lazy dog
                      </span>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-indigo-600 shrink-0 ml-1" />
                    )}
                  </button>
                );
              })
            )}

            {visibleCount < filteredFonts.length && (
              <div className="py-2 text-center text-[10px] text-slate-400 font-semibold">
                Scroll to load more fonts... ({visibleCount} of {filteredFonts.length})
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADD FONT MODAL (FILE UPLOAD OR GOOGLE FONT) - Portal to document.body to cover all header/stacking contexts */}
      {addModalOpen && mounted && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[99999] animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Add Font to Library</h3>
                  <p className="text-[11px] text-slate-400">Upload font file or add Google Font</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* TAB SELECTOR */}
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setActiveAddTab("FILE")}
                className={`flex-1 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeAddTab === "FILE"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Font File</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAddTab("GOOGLE")}
                className={`flex-1 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeAddTab === "GOOGLE"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Google Font</span>
              </button>
            </div>

            <form onSubmit={handleAddFontSubmit} className="space-y-4">
              {modalError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {modalError}
                </div>
              )}

              {activeAddTab === "FILE" ? (
                <>
                  {/* Font Display Name Input */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">Font Display Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Bison Bold Custom"
                      value={fontNameInput}
                      onChange={(e) => setFontNameInput(e.target.value)}
                      className="w-full h-9 border border-slate-300 rounded-lg px-3 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* File Dropzone */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">
                      Font File (.TTF / .OTF / .WOFF / .WOFF2)
                    </label>
                    <div className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-4 text-center cursor-pointer transition bg-slate-50 relative">
                      <input
                        type="file"
                        accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            const f = e.target.files[0];
                            setSelectedFile(f);
                            if (!fontNameInput) {
                              setFontNameInput(f.name.replace(/\.[^/.]+$/, ""));
                            }
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      {selectedFile ? (
                        <div className="space-y-1 text-indigo-700">
                          <Type className="w-8 h-8 mx-auto text-indigo-600" />
                          <p className="text-xs font-bold truncate max-w-xs mx-auto">{selectedFile.name}</p>
                          <p className="text-[10px] text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      ) : (
                        <div className="space-y-1 text-slate-500">
                          <Upload className="w-7 h-7 mx-auto text-slate-400" />
                          <p className="text-xs font-semibold">Click or drag font file here</p>
                          <p className="text-[10px] text-slate-400">Max size 25MB</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Google Font Family Name */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">Google Font Family Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Dancing Script, Montserrat, Pacifico"
                      value={googleFontFamily}
                      onChange={(e) => {
                        setGoogleFontFamily(e.target.value);
                        if (!fontNameInput) setFontNameInput(e.target.value);
                      }}
                      className={`w-full h-9 border rounded-lg px-3 text-xs font-medium focus:ring-2 focus:outline-none ${
                        googleFontValidation.status === "invalid"
                          ? "border-rose-400 focus:ring-rose-500 bg-rose-50/40"
                          : googleFontValidation.status === "valid"
                          ? "border-emerald-400 focus:ring-emerald-500 bg-emerald-50/30"
                          : "border-slate-300 focus:ring-indigo-500"
                      }`}
                    />

                    {/* Live Verification Status Feedback */}
                    {isVerifyingGoogleFont && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold mt-1 animate-pulse">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying font on Google Fonts...</span>
                      </div>
                    )}

                    {!isVerifyingGoogleFont && googleFontValidation.status === "valid" && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold mt-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Font "{googleFontValidation.fontFamily}" found on Google Fonts!</span>
                      </div>
                    )}

                    {!isVerifyingGoogleFont && googleFontValidation.status === "invalid" && (
                      <div className="flex items-center gap-1.5 text-xs text-rose-600 font-semibold mt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{googleFontValidation.message}</span>
                      </div>
                    )}

                    <span className="text-[10px] text-slate-400 block pt-0.5">
                      Enter exact family name from fonts.google.com
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">Display Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Dancing Script Cursive"
                      value={fontNameInput}
                      onChange={(e) => setFontNameInput(e.target.value)}
                      className="w-full h-9 border border-slate-300 rounded-lg px-3 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="flex-1 py-2 px-3 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    isUploading ||
                    isVerifyingGoogleFont ||
                    (activeAddTab === "FILE" && !selectedFile) ||
                    (activeAddTab === "GOOGLE" && (!googleFontFamily.trim() || googleFontValidation.status === "invalid"))
                  }
                  className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" /> Save Font
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
