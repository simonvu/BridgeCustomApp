import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, ArrowRight, X } from "lucide-react";
import type { StudioFieldItem } from "./StudioFieldPanel";
import type { CanvasLayerItem } from "./StudioCanvas";
import {
  clauseValues,
  flattenRuleForStorage,
  getOptionSwatchUrl,
  getOptionValue,
  isListItemField,
  ruleClauses,
  type StudioConditionClause,
  type StudioConditionRuleItem,
} from "../../utils/fieldHelpers";
import FeatureTip from "./FeatureTip";

export type { StudioConditionRuleItem };

interface StudioConditionPanelProps {
  rules: StudioConditionRuleItem[];
  fields: StudioFieldItem[];
  layers: CanvasLayerItem[];
  onAddRule: (rule: Omit<StudioConditionRuleItem, "id">) => void;
  onUpdateRule: (rule: StudioConditionRuleItem) => void;
  onDeleteRule: (ruleId: string) => void;
}

const ARTWORK_CONDITION_TIP = {
  title: "Conditions",
  body: "Ẩn hoặc hiện field / layer trên screen này theo option khách chọn. Mỗi screen có bộ rule riêng. Tick nhiều option = OR. AND thêm field khác nếu cần đủ cả hai điều kiện.",
};

function emptyClause(sourceFieldId = ""): StudioConditionClause {
  return {
    sourceFieldId,
    operator: "EQUALS",
    targetValue: "",
    targetValues: [],
  };
}

function OptionThumb({ opt }: { opt: any }) {
  const src = getOptionSwatchUrl(opt);
  if (!src) {
    return <span className="w-6 h-6 rounded bg-slate-100 border border-slate-200 shrink-0" aria-hidden />;
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

function sortedLayers(layers: CanvasLayerItem[]) {
  return [...layers].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
}

function listItemLayers(layers: CanvasLayerItem[], fields: StudioFieldItem[]) {
  return sortedLayers(layers).filter((l) => {
    const field = l.linkedFieldId ? fields.find((f) => f.id === l.linkedFieldId) : undefined;
    return Boolean(l.linkedFieldId) && isListItemField(field);
  });
}

function layerForSourceField(layers: CanvasLayerItem[], fieldId: string) {
  return layers.find((l) => l.linkedFieldId === fieldId);
}

function layerForTarget(layers: CanvasLayerItem[], targetId: string) {
  return layers.find((l) => l.id === targetId) || layers.find((l) => l.linkedFieldId === targetId);
}

export default function StudioConditionPanel({
  rules,
  fields,
  layers,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
}: StudioConditionPanelProps) {
  const listLayers = useMemo(() => listItemLayers(layers, fields), [layers, fields]);
  const firstList = listLayers[0];
  const firstSourceId = firstList?.linkedFieldId || "";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [when, setWhen] = useState<StudioConditionClause[]>(() => [emptyClause(firstSourceId)]);
  const [action, setAction] = useState<StudioConditionRuleItem["action"]>("HIDE_LAYER");
  const [targetLayerId, setTargetLayerId] = useState<string>("");

  const usedSourceFieldIds = new Set(
    when.map((c) => c.sourceFieldId || firstSourceId).filter(Boolean)
  );
  const excludedLayerIds = new Set(
    listLayers.filter((l) => l.linkedFieldId && usedSourceFieldIds.has(l.linkedFieldId)).map((l) => l.id)
  );
  const thenLayers = sortedLayers(layers).filter((l) => !excludedLayerIds.has(l.id));
  const effectiveTargetLayerId = thenLayers.some((l) => l.id === targetLayerId)
    ? targetLayerId
    : thenLayers[0]?.id || "";

  const resetForm = () => {
    setEditingId(null);
    setWhen([emptyClause(firstSourceId)]);
    setAction("HIDE_LAYER");
    setTargetLayerId(thenLayers.find((l) => l.id !== firstList?.id)?.id || thenLayers[0]?.id || "");
  };

  const loadRule = (rule: StudioConditionRuleItem) => {
    const clauses = ruleClauses(rule).map((c) => ({
      ...c,
      targetValues: clauseValues(c),
      targetValue: clauseValues(c)[0] || "",
    }));
    setEditingId(rule.id);
    setWhen(clauses.length ? clauses : [emptyClause(firstSourceId)]);
    setAction(rule.action);
    setTargetLayerId(layerForTarget(layers, rule.targetId)?.id || "");
  };

  const setClause = (index: number, patch: Partial<StudioConditionClause>) => {
    setWhen((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        const next = { ...c, ...patch };
        if (patch.sourceFieldId && patch.sourceFieldId !== c.sourceFieldId) {
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
      .filter((c) => c.sourceFieldId && clauseValues(c).length > 0);

  const formReady = Boolean(effectiveTargetLayerId && builtClauses().length);

  const sourceListName = (fieldId: string) =>
    layerForSourceField(layers, fieldId)?.name || fields.find((f) => f.id === fieldId)?.label || fieldId;
  const targetDisplayName = (id: string) =>
    layerForTarget(layers, id)?.name || fields.find((f) => f.id === id)?.label || id;
  const optionName = (fieldId: string, value: string) => {
    const opts = fields.find((f) => f.id === fieldId)?.config?.options || [];
    const opt = opts.find((o: any) => getOptionValue(o) === value || o.id === value || o.label === value);
    return opt?.label || value;
  };
  const optionNames = (clause: StudioConditionClause) =>
    clauseValues(clause)
      .map((v) => optionName(clause.sourceFieldId, v))
      .join(" or ");
  const clauseOptions = (clause: StudioConditionClause) => {
    const opts = fields.find((f) => f.id === clause.sourceFieldId)?.config?.options || [];
    return clauseValues(clause)
      .map((v) => opts.find((o: any) => getOptionValue(o) === v || o.id === v || o.label === v))
      .filter(Boolean);
  };

  const resolveStoredTarget = (layerId: string, nextAction: StudioConditionRuleItem["action"]) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return layerId;
    if (nextAction.includes("FIELD") && layer.linkedFieldId) return layer.linkedFieldId;
    return layer.id;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clauses = builtClauses();
    if (!clauses.length || !effectiveTargetLayerId) return;
    let finalAction = action;
    const targetLayer = layers.find((l) => l.id === effectiveTargetLayerId);
    if (action.includes("FIELD") && !targetLayer?.linkedFieldId) {
      finalAction = action === "SHOW_FIELD" ? "SHOW_LAYER" : "HIDE_LAYER";
    }
    const payload = flattenRuleForStorage({
      id: editingId || "",
      sourceFieldId: clauses[0].sourceFieldId,
      operator: clauses[0].operator,
      targetValue: clauses[0].targetValue || "",
      action: finalAction,
      targetId: resolveStoredTarget(effectiveTargetLayerId, finalAction),
      when: clauses,
    });
    if (editingId) {
      onUpdateRule({ ...payload, id: editingId });
    } else {
      onAddRule({
        sourceFieldId: payload.sourceFieldId,
        operator: payload.operator,
        targetValue: payload.targetValue,
        action: payload.action,
        targetId: payload.targetId,
        when: payload.when,
      });
    }
    resetForm();
  };

  const noListLayers = listLayers.length === 0;

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500 leading-snug flex items-start gap-1.5">
        <span className="flex-1">
          Tick several options for OR (Style is 01 or 02, hide a text field). Use AND to require another list too.
          Rules on this screen do not affect other screens.
        </span>
        <FeatureTip title={ARTWORK_CONDITION_TIP.title}>{ARTWORK_CONDITION_TIP.body}</FeatureTip>
      </p>

      {noListLayers ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-4 text-center text-[11px] text-slate-500">
          Add a <strong>List / Item</strong> on this screen first, then create conditions from its options.
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
              const srcLayer =
                listLayers.find((l) => l.linkedFieldId === clause.sourceFieldId) || listLayers[0];
              const srcField = fields.find((f) => f.id === (clause.sourceFieldId || srcLayer?.linkedFieldId));
              const opts = srcField?.config?.options || [];
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
                      value={clause.sourceFieldId || srcLayer?.linkedFieldId || ""}
                      onChange={(e) => setClause(idx, { sourceFieldId: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs font-medium"
                    >
                      {listLayers.map((l) => (
                        <option key={l.id} value={l.linkedFieldId || l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={clause.operator}
                      onChange={(e) =>
                        setClause(idx, { operator: e.target.value as StudioConditionClause["operator"] })
                      }
                      className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs font-semibold"
                    >
                      <option value="EQUALS">is any of</option>
                      <option value="NOT_EQUALS">is none of</option>
                    </select>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2 max-h-52 overflow-y-auto">
                    {opts.length === 0 ? (
                      <p className="text-[11px] text-slate-400">No items in this list.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {opts.map((opt: any) => {
                          const val = getOptionValue(opt);
                          const checked = clauseValues(clause).includes(val);
                          return (
                            <label
                              key={opt.id || val}
                              title={opt.label || val}
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
                              <span className="truncate max-w-[110px]">{opt.label || val}</span>
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
            {listLayers.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const used = new Set(when.map((c) => c.sourceFieldId));
                  const nextList = listLayers.find((l) => l.linkedFieldId && !used.has(l.linkedFieldId)) || listLayers[0];
                  if (!nextList?.linkedFieldId) return;
                  setWhen((prev) => [...prev, emptyClause(nextList.linkedFieldId)]);
                }}
                className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 cursor-pointer"
              >
                + AND another list
              </button>
            )}
          </div>

          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider">Then</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as StudioConditionRuleItem["action"])}
                className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs font-semibold text-blue-700"
              >
                <option value="HIDE_LAYER">Hide layer</option>
                <option value="SHOW_LAYER">Show layer</option>
                <option value="HIDE_FIELD">Hide field</option>
                <option value="SHOW_FIELD">Show field</option>
              </select>
              <select
                value={effectiveTargetLayerId}
                onChange={(e) => setTargetLayerId(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs font-medium"
              >
                {thenLayers.length === 0 ? (
                  <option value="">No other layers on this screen</option>
                ) : (
                  thenLayers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))
                )}
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
          <div className="text-center py-3 text-slate-400 text-xs">No conditions on this screen yet.</div>
        ) : (
          rules.map((rule) => {
            const targetName = targetDisplayName(rule.targetId);
            return (
              <div
                key={rule.id}
                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs shadow-2xs gap-2 ${
                  editingId === rule.id ? "bg-amber-50 border-amber-300" : "bg-white border-slate-200"
                }`}
              >
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700 flex-1 min-w-0 flex-wrap">
                  <span className="font-bold text-amber-700">IF</span>
                  {ruleClauses(rule).map((c, i) => (
                    <span key={`${rule.id}_${i}`} className="contents">
                      {i > 0 && <span className="font-bold text-amber-600">AND</span>}
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[90px]">
                        {sourceListName(c.sourceFieldId)}
                      </span>
                      <span className="text-slate-400">{c.operator === "NOT_EQUALS" ? "≠" : "="}</span>
                      <span
                        className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 px-1.5 py-0.5 rounded font-bold border border-amber-200 min-w-0 max-w-[260px]"
                        title={optionNames(c)}
                      >
                        <span className="inline-flex items-center shrink-0">
                          {clauseOptions(c)
                            .slice(0, 4)
                            .map((opt: any) =>
                              getOptionSwatchUrl(opt) ? (
                                <img
                                  key={opt.id}
                                  src={getOptionSwatchUrl(opt)}
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
                    {rule.action.replace("_", " ")}
                  </span>
                  <span className="bg-blue-50 text-blue-900 px-1.5 py-0.5 rounded border border-blue-200 font-bold truncate max-w-[100px]">
                    {targetName}
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
            );
          })
        )}
      </div>
    </div>
  );
}
