import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { trimToSquareDataUrl } from "../../utils/thumbnailGenerator";
import { buildClipArtInstance, rasterizeClipArtFrame } from "../../utils/clipArtInstance";

type ClipArtThumbSource = {
  id?: string;
  name?: string;
  widthPx?: number;
  heightPx?: number;
  layers?: any;
  fields?: any;
  thumbnailUrl?: string | null;
  compositeUrl?: string | null;
};

export default function ClipArtThumb({
  art,
  className = "w-full h-full object-contain",
}: {
  art: ClipArtThumbSource;
  className?: string;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setUrl("");
    setFailed(false);

    const run = async () => {
      const stored = art.thumbnailUrl || art.compositeUrl || "";
      try {
        if (stored) {
          const trimmed = await trimToSquareDataUrl(stored, 320);
          if (live) setUrl(trimmed || stored);
          return;
        }
        const frame = await rasterizeClipArtFrame(
          buildClipArtInstance({
            id: art.id || "preview",
            name: art.name,
            widthPx: art.widthPx,
            heightPx: art.heightPx,
            layers: art.layers,
            fields: art.fields,
            compositeUrl: art.compositeUrl,
          })
        );
        if (!frame) {
          if (live) setFailed(true);
          return;
        }
        const trimmed = await trimToSquareDataUrl(frame, 320);
        if (live) setUrl(trimmed || frame);
      } catch {
        if (live) setFailed(true);
      }
    };

    void run();
    return () => {
      live = false;
    };
  }, [art.id, art.thumbnailUrl, art.compositeUrl]);

  if (failed && !url) {
    return <Layers className="w-8 h-8 text-slate-300" />;
  }
  if (!url) {
    return <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-slate-400 animate-spin" />;
  }
  return <img src={url} alt={art.name || ""} className={className} draggable={false} />;
}
