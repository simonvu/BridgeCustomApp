import { isEmptyOption } from "./fieldHelpers";

export type ClipArtConditionClause = {
  sourceGroupId: string;
  operator: "EQUALS" | "NOT_EQUALS";
  /** First value; kept for older saved rules. Prefer `targetValues`. */
  targetValue: string;
  /** OR-set of option ids/labels. Skin 5 OR 6 OR 7 OR 8. */
  targetValues?: string[];
};

export type ClipArtConditionRule = {
  id: string;
  when: ClipArtConditionClause[];
  action: "SHOW_GROUP" | "HIDE_GROUP";
  targetId: string;
};

export type ClipArtPartOption = {
  id: string;
  label: string;
  value?: string;
  assetImageUrl?: string;
  swatchImageUrl?: string;
  isEmpty?: boolean;
  isVisible?: boolean;
  relX: number;
  relY: number;
  relW: number;
  relH: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  /** When set, this option is auto-picked if every clause matches. */
  showWhen?: ClipArtConditionClause[];
};

export type ClipArtInstanceGroup = {
  id: string;
  name: string;
  zIndex: number;
  activeOptionId: string;
  options: ClipArtPartOption[];
  /** Customer cannot choose this group; options follow related groups via showWhen. */
  hiddenFromCustomer?: boolean;
  /** Second draw of another group (e.g. Hair in front of Shirt, behind Hands). */
  sandwichOf?: string;
  /** Punch these groups' pixels out of this pass so they stay in front. */
  knockoutGroupIds?: string[];
};

export type ClipArtInstance = {
  clipArtId: string;
  clipArtName: string;
  sourceWidth: number;
  sourceHeight: number;
  groups: ClipArtInstanceGroup[];
  rules?: ClipArtConditionRule[];
};

function normClipArtName(s: string | undefined): string {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findMatchingGroup(
  list: ClipArtInstanceGroup[] | undefined,
  g: Pick<ClipArtInstanceGroup, "id" | "name">
): ClipArtInstanceGroup | undefined {
  const items = list || [];
  return (
    items.find((x) => x.id === g.id) ||
    items.find((x) => normClipArtName(x.name) === normClipArtName(g.name) && Boolean(normClipArtName(g.name)))
  );
}

function findMatchingOption(
  list: ClipArtPartOption[] | undefined,
  o: Pick<ClipArtPartOption, "id" | "label" | "value">
): ClipArtPartOption | undefined {
  const items = list || [];
  const label = normClipArtName(o.label || o.value);
  return (
    items.find((x) => x.id === o.id) ||
    items.find((x) => x.value && o.value && String(x.value) === String(o.value)) ||
    (label ? items.find((x) => normClipArtName(x.label || x.value) === label) : undefined)
  );
}

function parseArr(raw: any): any[] {
  if (!raw) return [];
  try {
    const a = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function asObject(raw: any): any | null {
  if (!raw) return null;
  try {
    const a = typeof raw === "string" ? JSON.parse(raw) : raw;
    return a && typeof a === "object" && !Array.isArray(a) ? a : null;
  } catch {
    return null;
  }
}

function normalizeClause(raw: any): ClipArtConditionClause | null {
  const sourceGroupId = String(raw?.sourceGroupId || "");
  const fromArr = Array.isArray(raw?.targetValues)
    ? raw.targetValues.map((v: any) => String(v || "")).filter(Boolean)
    : [];
  const single = String(raw?.targetValue ?? "");
  const targetValues = fromArr.length ? fromArr : single ? [single] : [];
  if (!sourceGroupId || targetValues.length === 0) return null;
  return {
    sourceGroupId,
    operator: raw?.operator === "NOT_EQUALS" ? "NOT_EQUALS" : "EQUALS",
    targetValue: targetValues[0],
    targetValues,
  };
}

export function clauseValues(clause: ClipArtConditionClause): string[] {
  if (Array.isArray(clause.targetValues) && clause.targetValues.length) {
    return clause.targetValues.map(String).filter(Boolean);
  }
  return clause.targetValue ? [String(clause.targetValue)] : [];
}

export function normalizeClipArtRules(raw: any): ClipArtConditionRule[] {
  return parseArr(raw)
    .map((r: any, i: number) => {
      const when = Array.isArray(r?.when)
        ? r.when.map(normalizeClause).filter(Boolean)
        : [normalizeClause(r)].filter(Boolean);
      const targetId = String(r?.targetId || "");
      if (!targetId || when.length === 0) return null;
      return {
        id: String(r?.id || `clip_rule_${i}`),
        when: when as ClipArtConditionClause[],
        action: r?.action === "SHOW_GROUP" ? "SHOW_GROUP" : "HIDE_GROUP",
        targetId,
      } as ClipArtConditionRule;
    })
    .filter((r): r is ClipArtConditionRule => Boolean(r));
}

export function parseClipArtDocument(
  rawFields: any,
  rawRules?: any
): { fields: any[]; rules: ClipArtConditionRule[] } {
  let fields: any[] = [];
  let rules: ClipArtConditionRule[] = [];
  const wrapped = asObject(rawFields);
  if (wrapped && Array.isArray(wrapped.__clipArtFields)) {
    fields = wrapped.__clipArtFields;
    rules = normalizeClipArtRules(wrapped.__clipArtRules);
  } else {
    fields = parseArr(rawFields);
  }
  const extra = normalizeClipArtRules(rawRules);
  if (extra.length) rules = extra;
  fields = fields.map((f: any) => ({
    ...f,
    config: typeof f.config === "string" ? JSON.parse(f.config) : f.config || {},
  }));
  return { fields, rules };
}

export function encodeClipArtFields(fields: any[], rules: ClipArtConditionRule[] = []) {
  if (!rules.length) return fields;
  return { __clipArtFields: fields, __clipArtRules: rules };
}

function activeOptionOf(group: ClipArtInstanceGroup | undefined) {
  if (!group) return undefined;
  return group.options.find((o) => o.id === group.activeOptionId) || group.options[0];
}

function clauseMatches(clause: ClipArtConditionClause, groups: ClipArtInstanceGroup[]): boolean {
  const opt = activeOptionOf(groups.find((g) => g.id === clause.sourceGroupId));
  if (!opt) return false;
  const keys = [opt.id, opt.value, opt.label].filter(Boolean).map(String);
  const hit = clauseValues(clause).some((v) => keys.includes(String(v)));
  return clause.operator === "NOT_EQUALS" ? !hit : hit;
}

export function isClipArtGroupVisible(
  groupId: string,
  groups: ClipArtInstanceGroup[],
  rules?: ClipArtConditionRule[] | null
): boolean {
  if (!groupId || !rules || rules.length === 0) return true;
  const targeting = rules.filter(
    (r) => (r.action === "SHOW_GROUP" || r.action === "HIDE_GROUP") && r.targetId === groupId
  );
  if (targeting.length === 0) return true;
  for (const rule of targeting) {
    const matched = rule.when.length > 0 && rule.when.every((c) => clauseMatches(c, groups));
    if (rule.action === "SHOW_GROUP" && !matched) return false;
    if (rule.action === "HIDE_GROUP" && matched) return false;
  }
  return true;
}

export function pruneClipArtRules(
  rules: ClipArtConditionRule[],
  groupIds: Iterable<string>
): ClipArtConditionRule[] {
  const ids = new Set(groupIds);
  return rules.filter(
    (r) => ids.has(r.targetId) && r.when.every((c) => ids.has(c.sourceGroupId))
  );
}

/** Artwork lists option groups opposite the clip-art editor (bottom of stack first). */
export function isClipArtGroupHiddenFromCustomer(g: ClipArtInstanceGroup | undefined): boolean {
  if (!g) return false;
  if (g.sandwichOf) return true;
  return Boolean(g.hiddenFromCustomer) || (g.options || []).some((o) => (o.showWhen || []).length > 0);
}

export function clipArtGroupsForArtworkDisplay(
  groups: ClipArtInstanceGroup[] | undefined,
  rules?: ClipArtConditionRule[] | null
): ClipArtInstanceGroup[] {
  const list = [...(groups || [])].reverse();
  return list.filter(
    (g) => !isClipArtGroupHiddenFromCustomer(g) && isClipArtGroupVisible(g.id, groups || [], rules)
  );
}

function remapClause(
  clause: ClipArtConditionClause,
  srcList: ClipArtInstanceGroup[],
  locList: ClipArtInstanceGroup[]
): ClipArtConditionClause {
  const srcGroup = srcList.find((s) => s.id === clause.sourceGroupId);
  const localGroup = srcGroup
    ? findMatchingGroup(locList, srcGroup)
    : locList.find((g) => g.id === clause.sourceGroupId);
  const sourceGroupId = localGroup?.id || clause.sourceGroupId;
  const targetValues = clauseValues(clause).map((v) => {
    if (!srcGroup || !localGroup) return v;
    const srcOpt = srcGroup.options.find(
      (o) => o.id === v || String(o.value || "") === v || String(o.label || "") === v
    );
    if (!srcOpt) return v;
    const locOpt = findMatchingOption(localGroup.options, srcOpt);
    if (locOpt) return locOpt.id;
    const srcIdx = srcGroup.options.filter((o) => !isEmptyOption(o)).findIndex((o) => o.id === srcOpt.id);
    const locVisible = localGroup.options.filter((o) => !isEmptyOption(o));
    if (srcIdx >= 0 && locVisible[srcIdx]) return locVisible[srcIdx].id;
    return v;
  });
  return {
    ...clause,
    sourceGroupId,
    targetValue: targetValues[0] || clause.targetValue,
    targetValues,
  };
}

export function overlayClipArtDrivenMeta(
  local: ClipArtInstanceGroup[] | undefined,
  source: ClipArtInstanceGroup[] | undefined
): ClipArtInstanceGroup[] {
  const loc = local || [];
  const srcList = source || [];
  return loc.map((g) => {
    const src = findMatchingGroup(srcList, g);
    if (!src) return g;
    return {
      ...g,
      hiddenFromCustomer: isClipArtGroupHiddenFromCustomer(src) || Boolean(src.hiddenFromCustomer),
      options: g.options.map((o) => {
        const so = findMatchingOption(src.options, o);
        if (!so?.showWhen?.length) return o;
        return {
          ...o,
          showWhen: so.showWhen.map((c) => remapClause(c, srcList, loc)),
        };
      }),
    };
  });
}

export function optionShowWhenMatches(
  opt: ClipArtPartOption | undefined,
  groups: ClipArtInstanceGroup[]
): boolean {
  if (!opt || isEmptyOption(opt)) return false;
  const when = opt.showWhen || [];
  if (when.length === 0) return false;
  return when.every((c) => clauseMatches(c, groups));
}

/** Pick the matching option on hidden/driven groups from related customer groups. */
export function resolveDrivenClipArtGroups(groups: ClipArtInstanceGroup[]): ClipArtInstanceGroup[] {
  const next = groups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o })) }));
  const limit = Math.max(1, next.length);
  for (let pass = 0; pass < limit; pass++) {
    let changed = false;
    for (let i = 0; i < next.length; i++) {
      const g = next[i];
      if (g.sandwichOf) continue;
      if (!isClipArtGroupHiddenFromCustomer(g)) continue;
      let match = g.options.find((o) => optionShowWhenMatches(o, next));
      if (!match) {
        const driverId =
          g.options.find((o) => o.showWhen?.[0]?.sourceGroupId)?.showWhen?.[0]?.sourceGroupId ||
          next.find((x) => /skin/i.test(x.name || "") && x.id !== g.id)?.id;
        const src = driverId ? next.find((x) => x.id === driverId) : undefined;
        if (src) {
          const srcOpts = src.options.filter((o) => !isEmptyOption(o));
          const selfOpts = g.options.filter((o) => !isEmptyOption(o));
          let idx = srcOpts.findIndex((o) => o.id === src.activeOptionId);
          if (idx < 0) idx = src.options.findIndex((o) => o.id === src.activeOptionId);
          if (idx >= 0 && selfOpts[idx]) match = selfOpts[idx];
        }
      }
      const empty = g.options.find((o) => isEmptyOption(o));
      const id = match?.id || empty?.id || g.activeOptionId;
      if (id && id !== g.activeOptionId) {
        next[i] = { ...g, activeOptionId: id };
        changed = true;
      }
    }
    if (!changed) break;
  }
  return next.map((g) => {
    if (!g.sandwichOf) return g;
    const src = next.find((x) => x.id === g.sandwichOf);
    return src ? { ...g, activeOptionId: src.activeOptionId } : g;
  });
}

function toOption(
  opt: any,
  layer: any,
  index: number
): ClipArtPartOption {
  return {
    id: opt.id || `opt_${index}`,
    label: opt.label || opt.value || `Option ${index + 1}`,
    value: opt.value,
    assetImageUrl: opt.assetImageUrl || layer.properties?.assetUrl || "",
    swatchImageUrl: opt.swatchImageUrl || opt.assetImageUrl || layer.properties?.assetUrl || "",
    isEmpty: Boolean(opt.isEmpty),
    isVisible: opt.isVisible !== false,
    relX: opt.posX ?? layer.posX ?? 0,
    relY: opt.posY ?? layer.posY ?? 0,
    relW: opt.width ?? layer.width ?? 100,
    relH: opt.height ?? layer.height ?? 100,
    rotation: opt.rotation ?? layer.rotation ?? 0,
    flipH: Boolean(opt.flipH ?? layer.properties?.flipH),
    flipV: Boolean(opt.flipV ?? layer.properties?.flipV),
    showWhen: (() => {
      if (!Array.isArray(opt.showWhen)) return undefined;
      const when = opt.showWhen.map(normalizeClause).filter(Boolean) as ClipArtConditionClause[];
      return when.length ? when : undefined;
    })(),
  };
}

export function buildClipArtInstance(clip: {
  id: string;
  name?: string;
  widthPx?: number;
  heightPx?: number;
  layers?: any;
  fields?: any;
  rules?: any;
  compositeUrl?: string | null;
  thumbnailUrl?: string | null;
}): ClipArtInstance {
  const layers = parseArr(clip.layers).map((l: any) => ({
    ...l,
    properties: typeof l.properties === "string" ? JSON.parse(l.properties) : l.properties || {},
  }));
  const { fields, rules } = parseClipArtDocument(clip.fields, clip.rules);

  const groups: ClipArtInstanceGroup[] = [...layers]
    .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
    .map((layer, i) => {
      const field = layer.linkedFieldId ? fields.find((f: any) => f.id === layer.linkedFieldId) : null;
      const fromField = (field?.config?.options || []).filter((o: any) => o.isVisible !== false);
      const options: ClipArtPartOption[] =
        fromField.length > 0
          ? fromField.map((o: any, idx: number) => toOption(o, layer, idx))
          : [
              toOption(
                {
                  id: `solo_${layer.id || i}`,
                  label: layer.name || "Option 1",
                  assetImageUrl: layer.properties?.assetUrl || "",
                  swatchImageUrl: layer.properties?.assetUrl || "",
                },
                layer,
                0
              ),
            ];
      const preferred = field?.activeOptionId;
      const active =
        (preferred && options.some((o) => o.id === preferred) ? preferred : null) ||
        options.find((o) => !isEmptyOption(o))?.id ||
        options[0]?.id ||
        "";
      const isFront = layer.properties?.sandwichRole === "front";
      const sandwichOf = isFront
        ? String(layer.properties?.sandwichOfGroupId || field?.id || layer.properties?.sandwichSourceLayerId || "")
        : undefined;
      const knockoutGroupIds = Array.isArray(layer.properties?.knockoutGroupIds)
        ? layer.properties.knockoutGroupIds.map((id: any) => String(id || "")).filter(Boolean)
        : [];
      return {
        id: isFront ? layer.id || `front_${i}` : field?.id || layer.id || `group_${i}`,
        name: isFront
          ? `${field?.label || layer.name || "Group"} (front)`
          : field?.label || layer.name || `Group ${i + 1}`,
        zIndex: layer.zIndex || 0,
        activeOptionId: active,
        options,
        hiddenFromCustomer:
          isFront || Boolean(field?.hiddenFromCustomer || field?.allowPersonalized === false),
        sandwichOf: sandwichOf || undefined,
        knockoutGroupIds: knockoutGroupIds.length ? knockoutGroupIds : undefined,
      };
    });

  if (groups.length === 0 && clip.compositeUrl) {
    groups.push({
      id: "composite",
      name: clip.name || "Clip Art",
      zIndex: 0,
      activeOptionId: "full",
      options: [
        {
          id: "full",
          label: clip.name || "Clip Art",
          assetImageUrl: clip.compositeUrl,
          swatchImageUrl: clip.thumbnailUrl || clip.compositeUrl,
          relX: 0,
          relY: 0,
          relW: clip.widthPx || 1000,
          relH: clip.heightPx || 1000,
        },
      ],
    });
  }

  return {
    clipArtId: clip.id,
    clipArtName: clip.name || "Clip Art",
    sourceWidth: clip.widthPx || 1000,
    sourceHeight: clip.heightPx || 1000,
    groups: resolveDrivenClipArtGroups(groups),
    rules,
  };
}

export function clipArtActiveParts(instance: ClipArtInstance): ClipArtPartOption[] {
  return clipArtDrawPasses(instance).map((p) => p.part);
}

export type ClipArtDrawPass = {
  part: ClipArtPartOption;
  knockout: ClipArtPartOption[];
};

function activePartOf(group: ClipArtInstanceGroup | undefined): ClipArtPartOption | undefined {
  if (!group) return undefined;
  const opt = group.options.find((o) => o.id === group.activeOptionId) || group.options[0];
  if (!opt || isEmptyOption(opt) || !opt.assetImageUrl) return undefined;
  return opt;
}

export function clipArtDrawPasses(instance: ClipArtInstance): ClipArtDrawPass[] {
  const groups = instance.groups || [];
  return [...groups]
    .sort((a, b) => a.zIndex - b.zIndex)
    .filter((g) => {
      if (!isClipArtGroupVisible(g.id, groups, instance.rules)) return false;
      if (g.sandwichOf && !isClipArtGroupVisible(g.sandwichOf, groups, instance.rules)) return false;
      return true;
    })
    .map((g) => {
      const part = activePartOf(g);
      if (!part) return null;
      const knockout = (g.knockoutGroupIds || [])
        .map((id) => activePartOf(groups.find((x) => x.id === id)))
        .filter((o): o is ClipArtPartOption => Boolean(o));
      return { part, knockout };
    })
    .filter((p): p is ClipArtDrawPass => Boolean(p));
}

function drawClipArtPart(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: ClipArtPartOption
) {
  ctx.save();
  ctx.translate(p.relX + p.relW / 2, p.relY + p.relH / 2);
  ctx.rotate(((p.rotation || 0) * Math.PI) / 180);
  ctx.scale(p.flipH ? -1 : 1, p.flipV ? -1 : 1);
  ctx.drawImage(img, -p.relW / 2, -p.relH / 2, p.relW, p.relH);
  ctx.restore();
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

/** Shared decode so canvas layers and sandwich knockouts don't fetch the same PNG twice. */
export function loadClipArtImage(url: string): Promise<HTMLImageElement> {
  if (!url) return Promise.reject(new Error("empty image url"));
  const hit = imageCache.get(url);
  if (hit) return hit;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      const ready = typeof img.decode === "function" ? img.decode().then(() => img).catch(() => img) : Promise.resolve(img);
      ready.then(resolve);
    };
    img.onerror = () => {
      imageCache.delete(url);
      reject(new Error(`Could not load ${url}`));
    };
    img.src = url;
  });
  imageCache.set(url, pending);
  return pending;
}

const FRAME_CACHE_MAX = 24;
const frameCanvasCache = new Map<string, HTMLCanvasElement>();

function frameCacheKey(instance: ClipArtInstance) {
  return `${clipArtFingerprint(instance)}_${instance.sourceWidth}x${instance.sourceHeight}`;
}

export async function rasterizeClipArtFrameToCanvas(
  instance: ClipArtInstance
): Promise<HTMLCanvasElement | null> {
  const key = frameCacheKey(instance);
  const cached = frameCanvasCache.get(key);
  if (cached) return cached;

  const passes = clipArtDrawPasses(instance);
  const w = Math.max(1, Math.round(instance.sourceWidth));
  const h = Math.max(1, Math.round(instance.sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (passes.length === 0) {
    rememberFrameCanvas(key, canvas);
    return canvas;
  }

  const urls = new Set<string>();
  passes.forEach((p) => {
    if (p.part.assetImageUrl) urls.add(p.part.assetImageUrl);
    p.knockout.forEach((k) => {
      if (k.assetImageUrl) urls.add(k.assetImageUrl);
    });
  });
  const loaded = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...urls].map(async (url) => {
      loaded.set(url, await loadClipArtImage(url));
    })
  );

  const punch = document.createElement("canvas");
  punch.width = w;
  punch.height = h;
  const pctx = punch.getContext("2d");
  if (!pctx) return null;

  for (const pass of passes) {
    const img = loaded.get(pass.part.assetImageUrl || "");
    if (!img) continue;
    if (pass.knockout.length === 0) {
      drawClipArtPart(ctx, img, pass.part);
      continue;
    }
    pctx.clearRect(0, 0, w, h);
    pctx.globalCompositeOperation = "source-over";
    drawClipArtPart(pctx, img, pass.part);
    pctx.globalCompositeOperation = "destination-out";
    for (const k of pass.knockout) {
      const kImg = loaded.get(k.assetImageUrl || "");
      if (kImg) drawClipArtPart(pctx, kImg, k);
    }
    pctx.globalCompositeOperation = "source-over";
    ctx.drawImage(punch, 0, 0);
  }
  rememberFrameCanvas(key, canvas);
  return canvas;
}

function rememberFrameCanvas(key: string, canvas: HTMLCanvasElement) {
  if (frameCanvasCache.has(key)) return;
  if (frameCanvasCache.size >= FRAME_CACHE_MAX) {
    const oldest = frameCanvasCache.keys().next().value;
    if (oldest) frameCanvasCache.delete(oldest);
  }
  frameCanvasCache.set(key, canvas);
}

export async function rasterizeClipArtFrame(instance: ClipArtInstance): Promise<string> {
  const canvas = await rasterizeClipArtFrameToCanvas(instance);
  return canvas ? canvas.toDataURL("image/png") : "";
}

export async function rasterizePunchedPlate(args: {
  width: number;
  height: number;
  plate: ClipArtPartOption;
  knockouts: ClipArtPartOption[];
}): Promise<HTMLCanvasElement | null> {
  const w = Math.max(1, Math.round(args.width));
  const h = Math.max(1, Math.round(args.height));
  const plateUrl = args.plate.assetImageUrl || "";
  if (!plateUrl) return null;
  const urls = [plateUrl, ...args.knockouts.map((k) => k.assetImageUrl || "").filter(Boolean)];
  await Promise.all(urls.map((url) => loadClipArtImage(url)));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = await loadClipArtImage(plateUrl);
  drawClipArtPart(ctx, img, args.plate);
  if (args.knockouts.length === 0) return canvas;
  ctx.globalCompositeOperation = "destination-out";
  for (const k of args.knockouts) {
    if (!k.assetImageUrl) continue;
    const kImg = await loadClipArtImage(k.assetImageUrl);
    drawClipArtPart(ctx, kImg, k);
  }
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

/**
 * Apply a freshly fetched clip-art definition onto an artwork instance.
 * Keeps this artwork's group names and selected options when those ids still exist.
 */
function preservedCustomerActiveId(old: ClipArtInstanceGroup, g: ClipArtInstanceGroup): string {
  if (g.options.some((o) => o.id === old.activeOptionId)) return old.activeOptionId;
  const oldOpt = old.options.find((o) => o.id === old.activeOptionId);
  if (oldOpt) {
    const byMeta = findMatchingOption(g.options, oldOpt);
    if (byMeta) return byMeta.id;
    const oldVis = old.options.filter((o) => !isEmptyOption(o));
    const newVis = g.options.filter((o) => !isEmptyOption(o));
    const idx = oldVis.findIndex((o) => o.id === old.activeOptionId);
    if (idx >= 0 && newVis[idx]) return newVis[idx].id;
  }
  return g.activeOptionId;
}

export function mergeClipArtInstance(
  previous: ClipArtInstance | null | undefined,
  next: ClipArtInstance
): ClipArtInstance {
  const prevGroups = previous?.groups || [];
  const groups = next.groups.map((g) => {
    const old = findMatchingGroup(prevGroups, g);
    if (!old) return g;
    return {
      ...g,
      name: old.name || g.name,
      activeOptionId:
        g.sandwichOf || !isClipArtGroupHiddenFromCustomer(g)
          ? preservedCustomerActiveId(old, g)
          : g.activeOptionId,
    };
  });
  const synced = groups.map((g) => {
    if (!g.sandwichOf) return g;
    const src = groups.find((x) => x.id === g.sandwichOf);
    return src ? { ...g, activeOptionId: src.activeOptionId } : g;
  });
  return { ...next, groups: resolveDrivenClipArtGroups(synced), rules: next.rules || previous?.rules || [] };
}

export function clipArtFingerprint(instance: ClipArtInstance): string {
  const hidden = instance.groups
    .filter((g) => !isClipArtGroupVisible(g.id, instance.groups, instance.rules))
    .map((g) => g.id)
    .join(",");
  return (
    instance.groups
      .map(
        (g) =>
          `${g.id}:${g.name}:${g.activeOptionId}:${g.zIndex}:${g.sandwichOf || ""}:${(g.knockoutGroupIds || []).join(",")}:${g.options
            .map((o) => `${o.id}:${o.assetImageUrl || ""}`)
            .join(",")}`
      )
      .join("|") + `|${instance.sourceWidth}x${instance.sourceHeight}|h:${hidden}`
  );
}
