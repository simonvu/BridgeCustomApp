export type FieldDisplayType = "DROPDOWN" | "RADIO" | "THUMBNAIL";
export type CalendarDateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD" | "MONTH_D_YYYY";
export type StudioFieldType = "TEXT" | "CALENDAR" | "RADIO" | "SELECT" | "IMAGE_UPLOAD" | "FIELD_ASSET";

export interface StudioFieldOptionChoice {
  id: string;
  label: string;
  value: string;
  swatchImageUrl?: string;
  assetImageUrl?: string;
  hasCustomPosition?: boolean;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  isVisible?: boolean;
}

export interface StudioFieldItem {
  id: string;
  label: string;
  fieldType: StudioFieldType;
  displayType?: FieldDisplayType | "TEXT_BUTTON" | "IMAGE_SWATCH";
  sortOrder: number;
  isRequired: boolean;
  allowPersonalized?: boolean;
  activeOptionId?: string;
  config?: any;
}

export interface StudioConditionRuleItem {
  id: string;
  sourceFieldId: string;
  operator: "EQUALS" | "NOT_EQUALS";
  targetValue: string;
  action: "SHOW_LAYER" | "HIDE_LAYER" | "SHOW_FIELD" | "HIDE_FIELD";
  targetId: string;
}

export const OPTION_FIELD_TYPES = ["RADIO", "SELECT", "FIELD_ASSET"] as const;
export const TEXT_LIKE_FIELD_TYPES = ["TEXT", "CALENDAR"] as const;

export function isOptionFieldType(type?: string): boolean {
  return type === "RADIO" || type === "SELECT" || type === "FIELD_ASSET";
}

export function normalizeDisplayType(displayType?: string | null): FieldDisplayType {
  if (displayType === "RADIO" || displayType === "TEXT_BUTTON") return "RADIO";
  if (displayType === "THUMBNAIL" || displayType === "IMAGE_SWATCH") return "THUMBNAIL";
  return "DROPDOWN";
}

export function defaultDisplayType(fieldType: string): FieldDisplayType {
  if (fieldType === "RADIO") return "RADIO";
  if (fieldType === "FIELD_ASSET") return "THUMBNAIL";
  return "DROPDOWN";
}

export function getOptionValue(opt?: Partial<StudioFieldOptionChoice> | null): string {
  if (!opt) return "";
  return String(opt.value || opt.label || opt.id || "");
}

export function getOptionAssetUrl(opt?: Partial<StudioFieldOptionChoice> | null): string {
  if (!opt) return "";
  return String((opt as any).assetImageUrl || (opt as any).assetUrl || (opt as any).imageUrl || "");
}

export function getOptionSwatchUrl(opt?: Partial<StudioFieldOptionChoice> | null): string {
  if (!opt) return "";
  return String((opt as any).swatchImageUrl || getOptionAssetUrl(opt) || (opt as any).imageUrl || "");
}

export function findOptionByValue(
  field: StudioFieldItem | undefined,
  value: unknown
): StudioFieldOptionChoice | undefined {
  if (!field || value === undefined || value === null || value === "") return undefined;
  const opts: StudioFieldOptionChoice[] = field.config?.options || [];
  const raw = String(value);
  return opts.find(
    (opt) => getOptionValue(opt) === raw || opt.id === raw || opt.label === raw || getOptionAssetUrl(opt) === raw
  );
}

export function getMaxCharacters(config?: any): number {
  const n = config?.maxCharacters ?? config?.maxLength;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return Math.min(1000, Math.floor(n));
  return 50;
}

export function getMinCharacters(config?: any): number {
  const n = config?.minCharacters;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return Math.floor(n);
  return 0;
}

export function sanitizeTextInput(text: string, config?: any): string {
  let result = String(text ?? "");
  if (!config?.allowMultiline) {
    result = result.replace(/[\r\n]+/g, " ");
  }
  if (config?.disallowSpecialChars) {
    result = result.replace(/[^a-zA-Z0-9\s.,!?'&\-]/g, "");
  }
  const max = getMaxCharacters(config);
  if (result.length > max) result = result.slice(0, max);
  return result;
}

export function formatCalendarDate(iso: string, format: CalendarDateFormat | string = "MM/DD/YYYY"): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  switch (format) {
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${yyyy}`;
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "MONTH_D_YYYY":
      return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    default:
      return `${mm}/${dd}/${yyyy}`;
  }
}

function conditionMatches(parentVal: unknown, operator: string, targetValue: string): boolean {
  const left = String(parentVal ?? "");
  const right = String(targetValue ?? "");
  if (operator === "NOT_EQUALS") return left !== right;
  if (operator === "CONTAINS") return left.includes(right);
  if (operator === "NOT_EMPTY") return Boolean(left);
  return left === right;
}

export function isFieldVisibleByRules(
  field: StudioFieldItem,
  rules: StudioConditionRuleItem[] | undefined,
  formValues: Record<string, unknown>
): boolean {
  if (field.allowPersonalized === false) return false;
  if (!rules || rules.length === 0) return true;

  const targeting = rules.filter(
    (r) => (r.action === "SHOW_FIELD" || r.action === "HIDE_FIELD") && r.targetId === field.id
  );
  if (targeting.length === 0) return true;

  for (const rule of targeting) {
    const parentVal = formValues[rule.sourceFieldId];
    const matched = conditionMatches(parentVal, rule.operator, rule.targetValue);
    if (rule.action === "SHOW_FIELD" && !matched) return false;
    if (rule.action === "HIDE_FIELD" && matched) return false;
  }
  return true;
}

export function isLayerVisibleByRules(
  layerId: string,
  rules: StudioConditionRuleItem[] | undefined,
  formValues: Record<string, unknown>
): boolean {
  if (!rules || rules.length === 0) return true;

  const targeting = rules.filter(
    (r) => (r.action === "SHOW_LAYER" || r.action === "HIDE_LAYER") && r.targetId === layerId
  );
  if (targeting.length === 0) return true;

  for (const rule of targeting) {
    const parentVal = formValues[rule.sourceFieldId];
    const matched = conditionMatches(parentVal, rule.operator, rule.targetValue);
    if (rule.action === "SHOW_LAYER" && !matched) return false;
    if (rule.action === "HIDE_LAYER" && matched) return false;
  }
  return true;
}

/**
 * True when a field is currently hidden specifically by a SHOW_FIELD / HIDE_FIELD
 * condition rule (independent of `allowPersonalized`). Used to also hide a
 * hidden field's linked canvas layer so conditions visibly affect the artwork.
 */
export function isFieldHiddenByCondition(
  fieldId: string,
  rules: StudioConditionRuleItem[] | undefined,
  formValues: Record<string, unknown>
): boolean {
  if (!fieldId || !rules || rules.length === 0) return false;

  const targeting = rules.filter(
    (r) => (r.action === "SHOW_FIELD" || r.action === "HIDE_FIELD") && r.targetId === fieldId
  );
  if (targeting.length === 0) return false;

  for (const rule of targeting) {
    const parentVal = formValues[rule.sourceFieldId];
    const matched = conditionMatches(parentVal, rule.operator, rule.targetValue);
    if (rule.action === "SHOW_FIELD" && !matched) return true;
    if (rule.action === "HIDE_FIELD" && matched) return true;
  }
  return false;
}

export function buildDefaultFieldConfig(fieldType: StudioFieldItem["fieldType"]): Record<string, unknown> {
  const stamp = Date.now();
  if (isOptionFieldType(fieldType)) {
    return {
      options: [1, 2, 3].map((n) => ({
        id: `opt_${stamp}_${n}`,
        label: `Option ${n}`,
        value: `option_${n}`,
        swatchImageUrl: "",
        assetImageUrl: "",
        hasCustomPosition: false,
      })),
    };
  }
  if (fieldType === "TEXT") {
    return {
      minCharacters: 0,
      maxCharacters: 50,
      disallowSpecialChars: false,
      allowMultiline: false,
      maxLines: 2,
      placeholder: "",
      defaultText: "",
    };
  }
  if (fieldType === "CALENDAR") {
    return {
      dateFormat: "MM/DD/YYYY" as CalendarDateFormat,
      minDate: "",
      maxDate: "",
      defaultToToday: false,
    };
  }
  if (fieldType === "IMAGE_UPLOAD") {
    return {
      helpText: "High resolution JPG or PNG recommended",
      maxFileSizeMb: 10,
    };
  }
  return {};
}

export function defaultFieldLabel(fieldType: StudioFieldItem["fieldType"]): string {
  switch (fieldType) {
    case "TEXT":
      return "Enter Name";
    case "CALENDAR":
      return "Select Date";
    case "RADIO":
      return "Choose Option";
    case "SELECT":
      return "List / Item";
    case "IMAGE_UPLOAD":
      return "Upload Photo";
    case "FIELD_ASSET":
      return "Choose Clipart";
    default:
      return "Custom Field";
  }
}
