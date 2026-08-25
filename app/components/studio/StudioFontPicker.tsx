import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, Upload, Check, ChevronDown, Sparkles, X, Type, Loader2, Plus, Globe } from "lucide-react";
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

  // Sync input value with selected font when not actively focused
  useEffect(() => {
    if (!isFocused) {
      setInputValue(selectedFontObj.name);
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
        setInputValue(selectedFontObj.name);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedFontObj]);

  // Filter fonts by search input value
  const filteredFonts = useMemo(() => {
    if (!isFocused || !inputValue.trim() || inputValue.trim().toLowerCase() === selectedFontObj.name.toLowerCase()) {
      return fonts;
    }
    const q = inputValue.toLowerCase().trim();
    return fonts.filter(
      (f) => f.name.toLowerCase().includes(q) || f.family.toLowerCase().includes(q)
    );
  }, [fonts, inputValue, isFocused, selectedFontObj]);

  // Reset pagination count & highlight when search changes
  useEffect(() => {
    setVisibleCount(30);
    setHighlightedIndex(0);
  }, [inputValue]);

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
      <div className="relative flex items-center w-[130px] shrink-0">
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
            if (!isOpen) {
              setIsOpen(true);
              updateCoords();
            }
          }}
          onKeyDown={handleKeyDown}
          className="h-7 w-full border border-slate-300 rounded-md pl-2 pr-6 bg-white text-[11px] font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 hover:border-slate-400 truncate shadow-2xs transition"
          style={{ fontFamily: selectedFontObj.family }}
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

      {/* QUICK "+ ADD FONT" BUTTON ON TOP TOOLBAR */}
      <button
        type="button"
        onClick={() => setAddModalOpen(true)}
        className="h-7 px-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
        title="Add custom font file or Google Font"
      >
        <Plus className="w-3 h-3 text-indigo-600" />
        <span>Font</span>
      </button>

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

      {/* ADD FONT MODAL (FILE UPLOAD OR GOOGLE FONT) */}
      {addModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[10000] animate-in fade-in duration-150">
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
                      className="w-full h-9 border border-slate-300 rounded-lg px-3 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 block">
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
                    (activeAddTab === "FILE" && !selectedFile) ||
                    (activeAddTab === "GOOGLE" && !googleFontFamily.trim())
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
        </div>
      )}
    </div>
  );
}
