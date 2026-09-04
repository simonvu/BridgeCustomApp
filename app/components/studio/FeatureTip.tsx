import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

export const FEATURE_TIP_ATTR = "data-feature-tip";

interface FeatureTipProps {
  title: string;
  children: ReactNode;
  /** Compact icon for badges / tight headers */
  compact?: boolean;
  className?: string;
}

export default function FeatureTip({ title, children, compact, className = "" }: FeatureTipProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setRect(null);
      return;
    }
    const update = () => setRect(btnRef.current?.getBoundingClientRect() || null);
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(`[${FEATURE_TIP_ATTR}]`)) return;
      setOpen(false);
    };
    const timer = window.setTimeout(() => window.addEventListener("click", close), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("click", close);
    };
  }, [open]);

  const width = 272;
  let left = 8;
  let top = 8;
  if (rect) {
    left = rect.left - width - 8;
    if (left < 8) left = Math.min(rect.right + 8, window.innerWidth - width - 8);
    top = Math.min(rect.top, window.innerHeight - 220);
    if (top < 8) top = 8;
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-feature-tip=""
        aria-label={`Hướng dẫn: ${title}`}
        title="Xem hướng dẫn"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`rounded text-slate-400 hover:text-sky-700 hover:bg-sky-50 cursor-pointer shrink-0 ${
          compact ? "p-0" : "p-0.5"
        } ${className}`}
      >
        <Info className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
      </button>
      {open && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              data-feature-tip=""
              role="tooltip"
              className="rounded-lg border border-slate-200 bg-white shadow-xl p-3 text-left"
              style={{ position: "fixed", zIndex: 130, width, left, top }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[11px] font-bold text-slate-900 mb-1">{title}</p>
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line">{children}</p>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
