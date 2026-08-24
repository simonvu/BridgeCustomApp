import React, { useState, useRef } from "react";
import {
  Upload,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Palette,
  Check,
  Image as ImageIcon,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";

export interface PhotoCustomizationData {
  imageUrl: string;
  zoom: number; // 1 to 3
  rotation: number; // 0, 90, 180, 270
  flipH: boolean;
  flipV: boolean;
  filter: "NONE" | "GRAYSCALE" | "SEPIA" | "CONTRAST";
  panX: number; // offset in px
  panY: number; // offset in px
}

interface StudioPhotoUploadModalProps {
  isOpen: boolean;
  title?: string;
  helpText?: string;
  maskShape?: string;
  maskAssetUrl?: string;
  aspectRatio?: number; // width / height
  currentData?: Partial<PhotoCustomizationData>;
  allowedTools?: {
    zoom?: boolean;
    rotate?: boolean;
    flip?: boolean;
    filters?: boolean;
  };
  onClose: () => void;
  onApply: (data: PhotoCustomizationData) => void;
  onOpenMediaPicker?: () => void;
}

export default function StudioPhotoUploadModal({
  isOpen,
  title = "Upload & Customise Your Photo",
  helpText = "Upload a high-resolution JPG or PNG for the best print quality.",
  maskShape = "RECTANGLE",
  maskAssetUrl,
  aspectRatio = 1,
  currentData,
  allowedTools = { zoom: true, rotate: true, flip: true, filters: true },
  onClose,
  onApply,
  onOpenMediaPicker,
}: StudioPhotoUploadModalProps) {
  const [imageUrl, setImageUrl] = useState<string>(currentData?.imageUrl || "");
  const [zoom, setZoom] = useState<number>(currentData?.zoom || 1);
  const [rotation, setRotation] = useState<number>(currentData?.rotation || 0);
  const [flipH, setFlipH] = useState<boolean>(currentData?.flipH || false);
  const [flipV, setFlipV] = useState<boolean>(currentData?.flipV || false);
  const [filter, setFilter] = useState<PhotoCustomizationData["filter"]>(currentData?.filter || "NONE");
  const [panX, setPanX] = useState<number>(currentData?.panX || 0);
  const [panY, setPanY] = useState<number>(currentData?.panY || 0);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      setZoom(1);
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setPanX(0);
      setPanY(0);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageUrl) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - panX, y: e.clientY - panY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanX(e.clientX - dragStartRef.current.x);
    setPanY(e.clientY - dragStartRef.current.y);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const getFilterStyle = () => {
    switch (filter) {
      case "GRAYSCALE":
        return "grayscale(100%)";
      case "SEPIA":
        return "sepia(80%) contrast(110%)";
      case "CONTRAST":
        return "contrast(140%) saturate(120%)";
      default:
        return "none";
    }
  };

  const handleApply = () => {
    if (!imageUrl) return;
    onApply({
      imageUrl,
      zoom,
      rotation,
      flipH,
      flipV,
      filter,
      panX,
      panY,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Upload className="w-4 h-4 text-purple-600" />
              {title}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{helpText}</p>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Interactive Photo Frame Viewport */}
          <div className="relative w-full aspect-square max-h-72 bg-slate-100 rounded-xl border border-slate-300 overflow-hidden flex items-center justify-center m-auto shadow-inner">
            {imageUrl ? (
              <div
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className={`relative w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing ${
                  maskShape === "CIRCLE"
                    ? "rounded-full"
                    : maskShape === "ROUNDED"
                    ? "rounded-2xl"
                    : "rounded-none"
                }`}
              >
                <img
                  src={imageUrl}
                  alt="Customer Upload Preview"
                  className="max-w-none transition-transform duration-75 pointer-events-none"
                  style={{
                    transform: `translate(${panX}px, ${panY}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${
                      flipH ? -1 : 1
                    }) scaleY(${flipV ? -1 : 1})`,
                    filter: getFilterStyle(),
                  }}
                />
              </div>
            ) : (
              <div className="text-center space-y-3 p-6">
                <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto border border-purple-200 shadow-xs">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">Select or Drag Photo Here</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Supports JPG, PNG, WEBP, SVG</p>
                </div>

                <div className="flex items-center justify-center gap-2 pt-1">
                  <label className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5">
                    <Upload className="w-4 h-4" /> Choose File
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {onOpenMediaPicker && (
                    <button
                      type="button"
                      onClick={onOpenMediaPicker}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl border border-slate-300 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-600" /> Media Library
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Shape Overlay Guide */}
            {imageUrl && (
              <div className="absolute inset-0 pointer-events-none border-2 border-purple-500/40 rounded-xl" />
            )}
          </div>

          {/* Amazon Custom Photo Editing Toolbar */}
          {imageUrl && (
            <div className="space-y-3 pt-2">
              {/* Zoom Slider */}
              {allowedTools.zoom && (
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center gap-3 text-xs">
                  <span className="font-bold text-slate-700 flex items-center gap-1 text-[11px] shrink-0">
                    <ZoomIn className="w-3.5 h-3.5 text-purple-600" /> Zoom
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.1) * 10) / 10))}
                    className="p-1 hover:bg-slate-200 rounded text-slate-600"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 accent-purple-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10))}
                    className="p-1 hover:bg-slate-200 rounded text-slate-600"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-[11px] font-bold text-purple-700 w-10 text-right">
                    {Math.round(zoom * 100)}%
                  </span>
                </div>
              )}

              {/* Rotation & Flip Controls */}
              {(allowedTools.rotate || allowedTools.flip) && (
                <div className="flex items-center gap-2">
                  {allowedTools.rotate && (
                    <button
                      type="button"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                      className="flex-1 py-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer text-xs"
                    >
                      <RotateCw className="w-3.5 h-3.5 text-blue-600" /> Rotate 90°
                    </button>
                  )}

                  {allowedTools.flip && (
                    <>
                      <button
                        type="button"
                        onClick={() => setFlipH((f) => !f)}
                        className={`flex-1 py-1.5 px-2 border rounded-xl font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer text-xs ${
                          flipH
                            ? "bg-purple-100 text-purple-900 border-purple-300"
                            : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                        }`}
                      >
                        <FlipHorizontal className="w-3.5 h-3.5 text-purple-600" /> Flip H
                      </button>
                      <button
                        type="button"
                        onClick={() => setFlipV((f) => !f)}
                        className={`flex-1 py-1.5 px-2 border rounded-xl font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer text-xs ${
                          flipV
                            ? "bg-purple-100 text-purple-900 border-purple-300"
                            : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                        }`}
                      >
                        <FlipVertical className="w-3.5 h-3.5 text-purple-600" /> Flip V
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Filter Presets */}
              {allowedTools.filters && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    <Palette className="w-3.5 h-3.5 text-amber-600" /> Photo Filter Presets
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: "NONE", label: "Original" },
                        { id: "GRAYSCALE", label: "B & W" },
                        { id: "SEPIA", label: "Sepia" },
                        { id: "CONTRAST", label: "Vibrant" },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFilter(f.id)}
                        className={`py-1.5 px-1 rounded-xl text-[11px] font-bold border transition cursor-pointer text-center ${
                          filter === f.id
                            ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {imageUrl && (
              <label className="text-[11px] font-semibold text-purple-700 hover:underline cursor-pointer">
                Change Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl border border-slate-300 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!imageUrl}
              onClick={handleApply}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Apply Photo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
