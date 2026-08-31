import { useEffect, useState } from "react";
import { X, Package, Layers, Check } from "lucide-react";

export interface ClipArtRecord {
  id: string;
  name: string;
  category?: string;
  widthPx: number;
  heightPx: number;
  layers?: any;
  fields?: any;
  compositeUrl?: string | null;
  thumbnailUrl?: string | null;
  layerCount?: number;
}

interface ClipArtSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (clipart: ClipArtRecord) => void;
}

/**
 * Picker that lists reusable Clip Art objects. Selecting one hands the full
 * record (including its layers + option-group fields) back so the artwork can
 * insert it — modular (option groups become customer fields) or flat.
 */
export default function ClipArtSelectModal({ isOpen, onClose, onSelect }: ClipArtSelectModalProps) {
  const [cliparts, setCliparts] = useState<ClipArtRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ClipArtRecord | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSelected(null);
      setSearch("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/cliparts")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setCliparts(data.cliparts || []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const parseCount = (raw: any) => {
    if (!raw) return 0;
    try {
      const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(arr) ? arr.length : 0;
    } catch {
      return 0;
    }
  };

  const filtered = cliparts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.category || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Insert Clip Art</h3>
              <p className="text-[11px] text-slate-500">Pick a saved object. Modular ones add customer options automatically.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 bg-slate-50/50">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clip art…"
            className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-12 text-center text-xs text-gray-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500 space-y-1">
              <Package className="w-8 h-8 mx-auto text-gray-300" />
              <p>No clip art found. Build one in the Clip Art library.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filtered.map((c) => {
                const isSel = selected?.id === c.id;
                const optCount = parseCount(c.fields);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelected(c)}
                    className={`group relative bg-white border rounded-xl overflow-hidden transition flex flex-col text-left cursor-pointer ${
                      isSel ? "ring-2 ring-emerald-600 border-emerald-600" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className="relative aspect-square bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:18px_18px] flex items-center justify-center p-2 border-b border-gray-100">
                      {c.thumbnailUrl || c.compositeUrl ? (
                        <img src={c.thumbnailUrl || c.compositeUrl || ""} alt={c.name} className="w-full h-full object-contain" />
                      ) : (
                        <Layers className="w-7 h-7 text-slate-300" />
                      )}
                      {isSel && (
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </span>
                    <span className="p-2 space-y-1">
                      <span className="block text-xs font-bold text-slate-800 truncate">{c.name}</span>
                      {optCount > 0 ? (
                        <span className="inline-block text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          {optCount} option{optCount > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="inline-block text-[9px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                          Static
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (selected) {
                onSelect(selected);
                onClose();
              }
            }}
            className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition cursor-pointer"
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}
