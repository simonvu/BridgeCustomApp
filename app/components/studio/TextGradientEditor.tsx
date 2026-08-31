import React from "react";
import { Plus, Trash2, Repeat } from "lucide-react";
import {
  defaultGradientPatch,
  getGradientCss,
  getNormalizedGradientStops,
  type GradientStop,
} from "../../utils/textFill";

interface TextGradientEditorProps {
  props: any;
  onChange: (patch: Record<string, any>) => void;
}

const ANGLE_PRESETS = [
  { label: "→", angle: 0, title: "Left to right" },
  { label: "↘", angle: 45, title: "Diagonal down" },
  { label: "↓", angle: 90, title: "Top to bottom" },
  { label: "↙", angle: 135, title: "Diagonal down-left" },
  { label: "←", angle: 180, title: "Right to left" },
];

export default function TextGradientEditor({ props, onChange }: TextGradientEditorProps) {
  const isGradient = props.colorMode === "GRADIENT";
  const gradientType = props.gradientType === "radial" ? "radial" : "linear";
  const angle = Number(props.gradientAngle) || 0;
  const stops = getNormalizedGradientStops(props);

  const commitStops = (nextStops: GradientStop[]) => {
    const sorted = [...nextStops].sort((a, b) => a.offset - b.offset);
    onChange({
      colorMode: "GRADIENT",
      gradientStops: sorted,
      gradientColor1: sorted[0]?.color,
      gradientColor2: sorted[sorted.length - 1]?.color,
    });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-semibold text-slate-700">Fill Color</label>
        <div className="grid grid-cols-2 gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px]">
          <button
            type="button"
            onClick={() =>
              onChange({
                colorMode: "SOLID",
                color: stops[0]?.color || props.color || "#1e293b",
              })
            }
            className={`px-2 py-1 rounded font-bold cursor-pointer transition ${
              !isGradient ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Solid
          </button>
          <button
            type="button"
            onClick={() => onChange(isGradient ? { colorMode: "GRADIENT" } : defaultGradientPatch(props.color))}
            className={`px-2 py-1 rounded font-bold cursor-pointer transition ${
              isGradient ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Gradient
          </button>
        </div>
      </div>

      {!isGradient ? (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
          <input
            type="color"
            value={props.color || "#1e293b"}
            onChange={(e) => onChange({ color: e.target.value })}
            className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0 bg-white shrink-0"
            title="Text color"
          />
          <input
            type="text"
            value={props.color || "#1e293b"}
            onChange={(e) => onChange({ color: e.target.value })}
            className="flex-1 font-mono text-xs font-bold uppercase bg-transparent border-none focus:outline-none"
          />
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2.5">
          <div
            className="h-8 rounded-lg border border-slate-200 shadow-2xs"
            style={{ background: getGradientCss(props) }}
            title="Gradient preview"
          />

          <div className="grid grid-cols-2 gap-0.5 bg-white p-0.5 rounded-lg border border-slate-200 text-[10px]">
            <button
              type="button"
              onClick={() => onChange({ gradientType: "linear" })}
              className={`py-1 rounded font-bold cursor-pointer transition ${
                gradientType === "linear" ? "bg-indigo-600 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Linear
            </button>
            <button
              type="button"
              onClick={() => onChange({ gradientType: "radial" })}
              className={`py-1 rounded font-bold cursor-pointer transition ${
                gradientType === "radial" ? "bg-indigo-600 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Radial
            </button>
          </div>

          {gradientType === "linear" ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-slate-600">Angle</span>
                <span className="font-mono font-bold text-indigo-600">{angle}°</span>
              </div>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={angle}
                onChange={(e) => onChange({ gradientAngle: Number(e.target.value) })}
                className="w-full cursor-pointer accent-indigo-600"
              />
              <div className="grid grid-cols-5 gap-1">
                {ANGLE_PRESETS.map((preset) => (
                  <button
                    key={preset.angle}
                    type="button"
                    title={preset.title}
                    onClick={() => onChange({ gradientAngle: preset.angle })}
                    className={`py-1 rounded border text-[11px] font-bold cursor-pointer transition ${
                      angle === preset.angle
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="flex items-center justify-between text-slate-600 mb-0.5">
                    <span>Center X</span>
                    <span className="font-mono font-bold text-indigo-600">
                      {Math.round((Number(props.gradientCenterX) || 0.5) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={Number(props.gradientCenterX) || 0.5}
                    onChange={(e) => onChange({ gradientCenterX: Number(e.target.value) })}
                    className="w-full cursor-pointer accent-indigo-600"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-slate-600 mb-0.5">
                    <span>Center Y</span>
                    <span className="font-mono font-bold text-indigo-600">
                      {Math.round((Number(props.gradientCenterY) || 0.5) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={Number(props.gradientCenterY) || 0.5}
                    onChange={(e) => onChange({ gradientCenterY: Number(e.target.value) })}
                    className="w-full cursor-pointer accent-indigo-600"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 mb-0.5">
                  <span>Radius</span>
                  <span className="font-mono font-bold text-indigo-600">
                    {Math.round((Number(props.gradientRadius) || 0.5) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.15}
                  max={1}
                  step={0.01}
                  value={Number(props.gradientRadius) || 0.5}
                  onChange={(e) => onChange({ gradientRadius: Number(e.target.value) })}
                  className="w-full cursor-pointer accent-indigo-600"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5 pt-1 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700">Color stops ({stops.length})</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    commitStops(
                      stops.map((s, i, arr) => ({
                        offset: s.offset,
                        color: arr[arr.length - 1 - i].color,
                      }))
                    )
                  }
                  className="text-[10px] font-bold text-slate-600 hover:text-indigo-700 px-1.5 py-0.5 rounded border border-slate-200 bg-white cursor-pointer flex items-center gap-0.5"
                  title="Reverse colors"
                >
                  <Repeat className="w-3 h-3" /> Reverse
                </button>
                <button
                  type="button"
                  disabled={stops.length >= 5}
                  onClick={() => {
                    const last = stops[stops.length - 1];
                    const prev = stops[stops.length - 2];
                    const offset = Math.min(0.99, ((prev?.offset ?? 0) + (last?.offset ?? 1)) / 2);
                    commitStops([...stops, { offset, color: last?.color || "#ffffff" }]);
                  }}
                  className="text-[10px] font-bold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-0.5 disabled:opacity-40"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            </div>

            {stops.map((stop, idx) => (
              <div key={`${idx}-${stop.offset}`} className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={stop.color}
                  onChange={(e) => {
                    const next = [...stops];
                    next[idx] = { ...stop, color: e.target.value };
                    commitStops(next);
                  }}
                  className="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0 bg-white shrink-0"
                />
                <input
                  type="text"
                  value={stop.color}
                  onChange={(e) => {
                    const next = [...stops];
                    next[idx] = { ...stop, color: e.target.value };
                    commitStops(next);
                  }}
                  className="w-20 font-mono text-[10px] font-bold uppercase border border-slate-200 rounded px-1.5 py-1 bg-white"
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(stop.offset * 100)}
                  onChange={(e) => {
                    const next = [...stops];
                    next[idx] = { ...stop, offset: Number(e.target.value) / 100 };
                    commitStops(next);
                  }}
                  className="flex-1 cursor-pointer accent-indigo-600"
                />
                <span className="w-8 text-right font-mono text-[10px] font-bold text-slate-500">
                  {Math.round(stop.offset * 100)}%
                </span>
                <button
                  type="button"
                  disabled={stops.length <= 2}
                  onClick={() => commitStops(stops.filter((_, i) => i !== idx))}
                  className="text-slate-400 hover:text-red-600 p-0.5 cursor-pointer disabled:opacity-30"
                  title="Remove stop"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
