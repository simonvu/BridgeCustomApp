import React, { useState } from "react";
import { StudioFieldItem } from "./StudioFieldPanel";
import { CanvasLayerItem } from "./StudioCanvas";
import { GitBranch, Plus, Trash2, ArrowRight, ShieldAlert } from "lucide-react";

export interface StudioConditionRuleItem {
  id: string;
  sourceFieldId: string;
  operator: "EQUALS" | "NOT_EQUALS";
  targetValue: string;
  action: "SHOW_LAYER" | "HIDE_LAYER" | "SHOW_FIELD" | "HIDE_FIELD";
  targetId: string;
}

interface StudioConditionPanelProps {
  rules: StudioConditionRuleItem[];
  fields: StudioFieldItem[];
  layers: CanvasLayerItem[];
  onAddRule: (rule: Omit<StudioConditionRuleItem, "id">) => void;
  onDeleteRule: (ruleId: string) => void;
}

export default function StudioConditionPanel({
  rules,
  fields,
  layers,
  onAddRule,
  onDeleteRule,
}: StudioConditionPanelProps) {
  // Only RADIO / SELECT fields can act as Source Condition Fields
  const conditionSourceFields = fields.filter(
    (f) => f.fieldType === "RADIO" || f.fieldType === "SELECT" || f.fieldType === "FIELD_ASSET"
  );

  const [selectedSourceFieldId, setSelectedSourceFieldId] = useState<string>(
    conditionSourceFields[0]?.id || ""
  );
  const [operator, setOperator] = useState<"EQUALS" | "NOT_EQUALS">("EQUALS");
  const [targetValue, setTargetValue] = useState<string>("");
  const [action, setAction] = useState<"SHOW_LAYER" | "HIDE_LAYER" | "SHOW_FIELD" | "HIDE_FIELD">("SHOW_LAYER");
  const [targetId, setTargetId] = useState<string>(layers[0]?.id || "");

  const activeSourceField = fields.find((f) => f.id === selectedSourceFieldId);
  const sourceOptions = activeSourceField?.config?.options || [];

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSourceFieldId || !targetValue || !targetId) return;

    onAddRule({
      sourceFieldId: selectedSourceFieldId,
      operator,
      targetValue,
      action,
      targetId,
    });
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2 uppercase tracking-wider">
          <GitBranch className="w-4 h-4 text-amber-600" />
          Conditional Logic Rules ({rules.length})
        </h3>
      </div>

      {/* Create New Rule Form */}
      <form onSubmit={handleCreateRule} className="bg-white p-3 rounded-lg border border-slate-200 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          {/* 1. IF Source Field */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">IF Option Field</label>
            <select
              value={selectedSourceFieldId}
              onChange={(e) => {
                setSelectedSourceFieldId(e.target.value);
                const firstOpt = fields.find((f) => f.id === e.target.value)?.config?.options?.[0];
                if (firstOpt) setTargetValue(firstOpt.value || firstOpt.label);
              }}
              className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs"
            >
              {conditionSourceFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} ({f.fieldType})
                </option>
              ))}
            </select>
          </div>

          {/* 2. IS EQUALS Value */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">IS EQUAL TO</label>
            {sourceOptions.length > 0 ? (
              <select
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs font-medium"
              >
                {sourceOptions.map((opt: any, idx: number) => (
                  <option key={idx} value={opt.value || opt.label}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="Option Value"
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs"
              />
            )}
          </div>

          {/* 3. THEN Action */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">THEN Action</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as any)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs font-semibold text-blue-700"
            >
              <option value="SHOW_LAYER">SHOW Layer</option>
              <option value="HIDE_LAYER">HIDE Layer</option>
              <option value="SHOW_FIELD">SHOW Field</option>
              <option value="HIDE_FIELD">HIDE Field</option>
            </select>
          </div>

          {/* 4. Target Layer / Field */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Target Element</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs font-medium"
            >
              {action.includes("LAYER") ? (
                layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    Layer: {l.name}
                  </option>
                ))
              ) : (
                fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    Field: {f.label}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!selectedSourceFieldId || !targetValue || !targetId}
            className="flex items-center gap-1 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Add Condition Rule
          </button>
        </div>
      </form>

      {/* Rules List */}
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {rules.length === 0 ? (
          <div className="text-center py-4 text-slate-400 text-xs">
            No condition rules created yet.
          </div>
        ) : (
          rules.map((rule) => {
            const srcField = fields.find((f) => f.id === rule.sourceFieldId);
            const targetLayer = layers.find((l) => l.id === rule.targetId);
            const targetField = fields.find((f) => f.id === rule.targetId);
            const targetName = targetLayer?.name || targetField?.label || rule.targetId;

            return (
              <div
                key={rule.id}
                className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 text-xs shadow-2xs"
              >
                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-700 flex-1 truncate">
                  <span className="font-bold text-amber-700">IF</span>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    {srcField?.label || "Field"}
                  </span>
                  <span className="text-slate-400">==</span>
                  <span className="bg-amber-50 text-amber-900 px-1.5 py-0.5 rounded font-bold border border-amber-200">
                    "{rule.targetValue}"
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-bold text-blue-700">{rule.action.replace("_", " ")}</span>
                  <span className="bg-blue-50 text-blue-900 px-1.5 py-0.5 rounded border border-blue-200 font-bold truncate">
                    "{targetName}"
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteRule(rule.id)}
                  className="text-slate-400 hover:text-red-600 p-1 shrink-0 ml-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
