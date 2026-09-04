import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, ArrowRight, X } from "lucide-react";
import type { ClipArtConditionClause, ClipArtConditionRule } from "../../utils/clipArtInstance";
import { clauseValues } from "../../utils/clipArtInstance";
import { CLIP_ART_TIPS } from "../../utils/clipArtTips";
import FeatureTip from "./FeatureTip";

type GroupOpt = {
  id: string;
  label?: string;
  value?: string;
  swatchImageUrl?: string;
  assetImageUrl?: string;
  isEmpty?: boolean;
};
type GroupLike = { id: string; name: string; options: GroupOpt[] };

interface ClipArtConditionPanelProps {
  groups: GroupLike[];
  rules: ClipArtConditionRule[];
  onAddRule: (rule: Omit<ClipArtConditionRule, "id">) => void;
  onUpdateRule: (rule: ClipArtConditionRule) => void;
  onDeleteRule: (ruleId: string) => void;
}

function optionLabel(opt: GroupOpt) {
  return opt.label || opt.value || opt.id;
}

function optionValue(opt: GroupOpt) {
  return opt.id || opt.value || opt.label || "";
}

function optionThumbUrl(opt: GroupOpt) {
  if (opt.isEmpty) return "";
  return opt.swatchImageUrl || opt.assetImageUrl || "";
}

function OptionThumb({ opt }: { opt: GroupOpt }) {
  const src = optionThumbUrl(opt);
  if (!src) {
    return (
      <span
        className="w-6 h-6 rounded bg-slate-100 border border-slate-200 shrink-0"
        aria-hidden
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-6 h-6 rounded object-contain bg-white border border-slate-200/80 shrink-0"
      draggable={false}
    />
  );
}

function emptyClause(sourceGroupId = ""): ClipArtConditionClause {
  return {
    sourceGroupId,
    operator: "EQUALS",
    targetValue: "",
    targetValues: [],
  };
}

export default function ClipArtConditionPanel({
  groups,
  rules,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
}: ClipArtConditionPanelProps) {
  const firstGroup = groups[0];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [when, setWhen] = useState<ClipArtConditionClause[]>(() => [emptyClause(firstGroup?.id || "")]);
  const [action, setAction] = useState<"SHOW_GROUP" | "HIDE_GROUP">("HIDE_GROUP");
  const [targetId, setTargetId] = useState<string>(groups[1]?.id || groups[0]?.id || "");

  const resetForm = () => {
    setEditingId(null);
    setWhen([emptyClause(firstGroup?.id || "")]);
    setAction("HIDE_GROUP");
    setTargetId(groups[1]?.id || groups[0]?.id || "");
  };

  const loadRule = (rule: ClipArtConditionRule) => {
    setEditingId(rule.id);
    setWhen(
      rule.when.length
        ? rule.when.map((c) => ({
            ...c,
            targetValues: clauseValues(c),
            targetValue: clauseValues(c)[0] || c.targetValue || "",
          }))
        : [emptyClause(firstGroup?.id || "")]
    );
    setAction(rule.action);
    setTargetId(rule.targetId);
  };

  const setClause = (index: number, patch: Partial<ClipArtConditionClause>) => {
    setWhen((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        const next = { ...c, ...patch };
        if (patch.sourceGroupId && patch.sourceGroupId !== c.sourceGroupId) {
          next.targetValue = "";
          next.targetValues = [];
        }
        if (patch.targetValues) {
          next.targetValue = patch.targetValues[0] || "";
        }
        return next;
      })
    );
  };

  const toggleValue = (index: number, value: string) => {
    const current = clauseValues(when[index] || emptyClause());
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    setClause(index, { targetValues: next, targetValue: next[0] || "" });
  };

  const builtClauses = () =>
    when
      .map((c) => {
        const values = clauseValues(c);
        return { ...c, targetValues: values, targetValue: values[0] || c.targetValue };
      })
      .filter((c) => c.sourceGroupId && clauseValues(c).length > 0);

  const formReady = Boolean(targetId && builtClauses().length);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clauses = builtClauses();
    if (!clauses.length || !targetId) return;
    if (editingId) {
      onUpdateRule({ id: editingId, when: clauses, action, targetId });
    } else {
      onAddRule({ when: clauses, action, targetId });
    }
    resetForm();
  };

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name || id;
  const optionName = (groupId: string, value: string) => {
    const g = groups.find((x) => x.id === groupId);
    const opt = g?.options.find((o) => o.id === value || o.value === value || o.label === value);
    return opt ? optionLabel(opt) : value;
  };
  const optionNames = (clause: ClipArtConditionClause) => {
    const values = clauseValues(clause);
    if (values.length === 0) return "";
    return values.map((v) => optionName(clause.sourceGroupId, v)).join(" or ");
  };
  const clauseOptions = (clause: ClipArtConditionClause) => {
    const g = groups.find((x) => x.id === clause.sourceGroupId);
    if (!g) return [];
    return clauseValues(clause)
      .map((v) => g.options.find((o) => o.id === v || o.value === v || o.label === v))
      .filter((o): o is GroupOpt => Boolean(o));
  };

  const noGroups = groups.length < 1;
  const targetChoices = useMemo(
    () => groups.filter((g) => !when.some((c) => c.sourceGroupId === g.id) || g.id === targetId),
    [groups, when, targetId]
  );

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500 leading-snug flex items-start gap-1.5">
        <span className="flex-1">
          Tick several options for OR (Skin is 5 or 6 or 7 or 8, hide Eyes). Use AND to require another group too.
        </span>
        <FeatureTip title={CLIP_ART_TIPS.conditions.title}>{CLIP_ART_TIPS.conditions.body}</FeatureTip>
      </p>

      {noGroups ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-4 text-center text-[11px] text-slate-500">
          Add option groups first, then create conditions between them.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
          {editingId && (
            <div className="flex items-center justify-between text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
              <span>Editing an existing condition</span>
              <button type="button" onClick={resetForm} className="text-amber-700 hover:text-amber-950 cursor-pointer">
                Cancel edit
              </button>
            </div>
          )}
          <div className="space-y-1.5">
            <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider">If</span>
            {when.map((clause, idx) => {
              const src = groups.find((g) => g.id === clause.sourceGroupId);
              const opts = src?.options || [];
              return (
                <div key={idx} className="space-y-1.5">
                  {idx > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold text-amber-600 uppercase">And</span>
                      <button
                        type="button"
                        onClick={() => setWhen((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-[10px] font-semibold text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <select
                      value={clause.sourceGroupId}
                      onChange={(e) => setClause(idx, { sourceGroupId: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs font-medium"
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={clause.operator}
                      onChange={(e) =>
                        setClause(idx, { operator: e.target.value as ClipArtConditionClause["operator"] })
                      }
                      className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs font-semibold"
                    >
                      <option value="EQUALS">is any of</option>
                      <option value="NOT_EQUALS">is none of</option>
                    </select>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2 max-h-52 overflow-y-auto">
                    {opts.length === 0 ? (
                      <p className="text-[11px] text-slate-400">No options in this group.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {opts.map((opt) => {
                          const val = optionValue(opt);
                          const checked = clauseValues(clause).includes(val);
                          return (
                            <label
                              key={opt.id}
                              title={optionLabel(opt)}
                              className={`inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-md border text-[11px] font-semibold cursor-pointer max-w-full ${
                                checked
                                  ? "bg-amber-50 border-amber-300 text-amber-900"
                                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleValue(idx, val)}
                                className="w-3 h-3 accent-amber-600 cursor-pointer shrink-0"
                              />
                              <OptionThumb opt={opt} />
                              <span className="truncate max-w-[110px]">{optionLabel(opt)}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      {clauseValues(clause).length > 1
                        ? `${clauseValues(clause).length} options (OR)`
                        : "Select one or more options"}
                    </p>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => {
                const used = new Set(when.map((c) => c.sourceGroupId));
                const nextGroup = groups.find((g) => !used.has(g.id)) || groups[0];
                if (!nextGroup) return;
                setWhen((prev) => [...prev, emptyClause(nextGroup.id)]);
              }}
              className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 cursor-pointer"
            >
              + AND another group
            </button>
          </div>

          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider">Then</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as typeof action)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs font-semibold text-blue-700"
              >
                <option value="HIDE_GROUP">Hide group</option>
                <option value="SHOW_GROUP">Show group</option>
              </select>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs font-medium"
              >
                {(targetChoices.length ? targetChoices : groups).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Cancel edit
              </button>
            )}
            <button
              type="submit"
              disabled={!formReady}
              className="flex items-center gap-1 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition cursor-pointer shadow-xs"
            >
              {editingId ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editingId ? "Update condition" : "Add condition"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {rules.length === 0 ? (
          <div className="text-center py-3 text-slate-400 text-xs">No clip art conditions yet.</div>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center justify-between p-2.5 rounded-lg border text-xs shadow-2xs gap-2 ${
                editingId === rule.id ? "bg-amber-50 border-amber-300" : "bg-white border-slate-200"
              }`}
            >
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700 flex-1 min-w-0 flex-wrap">
                <span className="font-bold text-amber-700">IF</span>
                {rule.when.map((c, i) => (
                  <span key={`${rule.id}_${i}`} className="contents">
                    {i > 0 && <span className="font-bold text-amber-600">AND</span>}
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[90px]">
                      {groupName(c.sourceGroupId)}
                    </span>
                    <span className="text-slate-400">{c.operator === "NOT_EQUALS" ? "≠" : "="}</span>
                    <span
                      className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 px-1.5 py-0.5 rounded font-bold border border-amber-200 min-w-0 max-w-[260px]"
                      title={optionNames(c)}
                    >
                      <span className="inline-flex items-center shrink-0">
                        {clauseOptions(c)
                          .slice(0, 4)
                          .map((opt) =>
                            optionThumbUrl(opt) ? (
                              <img
                                key={opt.id}
                                src={optionThumbUrl(opt)}
                                alt=""
                                className="w-4 h-4 rounded object-contain bg-white border border-amber-200 -ml-0.5 first:ml-0"
                                draggable={false}
                              />
                            ) : null
                          )}
                      </span>
                      <span className="truncate">{optionNames(c)}</span>
                    </span>
                  </span>
                ))}
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-bold text-blue-700">
                  {rule.action === "HIDE_GROUP" ? "HIDE" : "SHOW"}
                </span>
                <span className="bg-blue-50 text-blue-900 px-1.5 py-0.5 rounded border border-blue-200 font-bold truncate max-w-[100px]">
                  {groupName(rule.targetId)}
                </span>
              </div>
              <div className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => loadRule(rule)}
                  className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"
                  title="Edit condition"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editingId === rule.id) resetForm();
                    onDeleteRule(rule.id);
                  }}
                  className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                  title="Delete condition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
