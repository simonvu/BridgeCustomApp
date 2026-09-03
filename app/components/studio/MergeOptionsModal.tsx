import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { countMergedOptions, type MergeGroup, type OptionMergeType } from "../../utils/clipArtMerge";

const MERGE_TYPES: { id: OptionMergeType; label: string; hint: string }[] = [
  { id: "parallel", label: "Parallel", hint: "Pair options by order (1+1, 2+2, …). Same-index variants become one image." },
  { id: "combination", label: "Combination", hint: "Every option of each group with every option of the others (cartesian product)." },
  { id: "concat", label: "Concat", hint: "Put all options into one list. Images stay as they are — no compositing." },
];

export type MergeOptionsSubmit = {
  fieldName: string;
  mergeType: OptionMergeType;
  useFirstOption: boolean;
  newOptionName: string;
};

export default function MergeOptionsModal({
  open,
  groups,
  busy,
  progress,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  groups: MergeGroup[];
  busy?: boolean;
  progress?: string;
  onCancel: () => void;
  onConfirm: (payload: MergeOptionsSubmit) => void;
}) {
  const defaultName = groups.map((g) => g.layer.name).filter(Boolean).join(" + ") || "Merged";
  const [fieldName, setFieldName] = useState(defaultName);
  const [mergeType, setMergeType] = useState<OptionMergeType>("parallel");
  const [useFirstOption, setUseFirstOption] = useState(true);
  const [newOptionName, setNewOptionName] = useState("");

  useEffect(() => {
    if (!open) return;
    setFieldName(defaultName);
    setMergeType("parallel");
    setUseFirstOption(true);
    setNewOptionName("");
  }, [open, defaultName]);

  const resultCount = useMemo(() => countMergedOptions(groups, mergeType), [groups, mergeType]);
  const hint = MERGE_TYPES.find((t) => t.id === mergeType)?.hint;
  const nameOk = fieldName.trim().length > 0;
  const concatOk = mergeType !== "concat" || useFirstOption || newOptionName.trim().length > 0;
  const canSubmit = nameOk && concatOk && groups.length >= 2 && !busy;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-[15px] font-bold text-slate-900">Merge options</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5">
          <label className="block">
            <span className="text-[12px] font-semibold text-slate-700">
              New field Name <span className="text-red-500">*</span>
            </span>
            <input
              autoFocus
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              disabled={busy}
              className="mt-1 h-9 w-full px-2.5 rounded-md border border-slate-200 text-[13px] text-slate-800 focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-semibold text-slate-700">
              Merge type <span className="text-red-500">*</span>
            </span>
            <select
              value={mergeType}
              onChange={(e) => setMergeType(e.target.value as OptionMergeType)}
              disabled={busy}
              className="mt-1 h-9 w-full px-2.5 rounded-md border border-slate-200 text-[13px] text-slate-800 bg-white focus:outline-none focus:border-blue-500 cursor-pointer disabled:bg-slate-50"
            >
              {MERGE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {mergeType === "concat" && (
            <>
              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">New option name</span>
                <input
                  value={newOptionName}
                  onChange={(e) => setNewOptionName(e.target.value)}
                  disabled={busy || useFirstOption}
                  placeholder={useFirstOption ? "Using original option names" : "e.g. Style"}
                  className="mt-1 h-9 w-full px-2.5 rounded-md border border-slate-200 text-[13px] text-slate-800 focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
                />
              </label>
              <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useFirstOption}
                  onChange={(e) => setUseFirstOption(e.target.checked)}
                  disabled={busy}
                  className="w-3.5 h-3.5 accent-blue-600"
                />
                Use first option
              </label>
            </>
          )}

          <p className="text-[11px] text-slate-500 leading-relaxed">{hint}</p>
          <p className="text-[11px] font-semibold text-slate-600">
            Creates {resultCount} option{resultCount === 1 ? "" : "s"}
            {mergeType === "parallel" && groups.some((g) => g.options.length !== groups[0].options.length)
              ? " (extra options on the longer group are skipped)"
              : ""}
            {mergeType === "combination" && resultCount > 80 ? " — this may take a while" : ""}.
          </p>
          {progress ? <p className="text-[12px] font-semibold text-blue-600">{progress}</p> : null}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-8 px-3 rounded-md border border-slate-200 bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onConfirm({
                fieldName: fieldName.trim(),
                mergeType,
                useFirstOption,
                newOptionName: newOptionName.trim(),
              })
            }
            className="h-8 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
