/**
 * Naming helpers for clip-art option groups.
 * Defaults come from imported filenames; bulk rename infers unique parts.
 */

const JUNK = new Set([
  "copy",
  "final",
  "export",
  "img",
  "image",
  "asset",
  "layer",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "psd",
]);

export function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function tokenize(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !JUNK.has(t));
}

export function slugValue(label: string, fallbackIndex = 1): string {
  const s = String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || `option_${fallbackIndex}`;
}

/** Clean an imported filename into a human option title. */
export function cleanImportedName(fileName?: string, fallback = "Option"): string {
  if (!fileName) return fallback;
  let n = fileName.replace(/\.[^/.]+$/, "");
  n = n.replace(/[@+](\d+x)?/gi, " ");
  n = n.replace(/\d{2,5}\s*[x×]\s*\d{2,5}/gi, " ");
  n = n.replace(/[-_]+/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  n = n
    .split(/\s+/)
    .filter((w) => w && !JUNK.has(w.toLowerCase()))
    .join(" ");
  if (!n) return fallback;
  return titleCase(n);
}

function commonTokens(lists: string[][]): string[] {
  if (lists.length === 0) return [];
  return lists[0].filter((t) => lists.every((list) => list.includes(t)));
}

/** Infer a group name from a set of option labels / filenames. */
export function guessGroupName(labels: string[]): string {
  const lists = labels.map(tokenize).filter((l) => l.length > 0);
  const shared = commonTokens(lists).filter((t) => !/^\d+$/.test(t));
  if (shared.length === 0) return "";
  return titleCase(shared.join(" "));
}

export type BulkRenameMode = "smart" | "sequential";

export interface SequentialRenameOptions {
  prefix: string;
  start: number;
  pad: number;
}

function dedupe(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
    if (count === 0) return name;
    return `${name} ${count + 1}`;
  });
}

/**
 * Smart: keep the distinctive part of each name, prefixed with the group.
 * "dog_ghost_red", "dog_ghost_blue" + group "Shirt" → "Shirt Red", "Shirt Blue"
 * "part_01", "part_02" + group "Hair" → "Hair 1", "Hair 2"
 * Generic "Option Group 1" uses the shared filename stem instead.
 */
export function smartRenameOptions(groupName: string, labels: string[]): string[] {
  const cleaned = labels.map((l, i) => cleanImportedName(l, `Option ${i + 1}`));
  const inferred = guessGroupName(cleaned);
  const rawGroup = (groupName || "").trim();
  const generic = !rawGroup || /^option\s*group(\s+\d+)?$/i.test(rawGroup);
  const group = (!generic && rawGroup) || inferred || rawGroup || "Option";

  if (generic && !inferred) {
    return dedupe(cleaned.map((label, i) => label || `${group} ${i + 1}`));
  }

  const lists = cleaned.map(tokenize);
  const shared = commonTokens(lists);
  const groupTokens = new Set(tokenize(group));

  const next = cleaned.map((label, i) => {
    const leftover = lists[i].filter((t) => !shared.includes(t) && !groupTokens.has(t));
    const distinctive = leftover.filter((t) => !/^\d+$/.test(t));
    const num = leftover.find((t) => /^\d+$/.test(t));
    if (distinctive.length > 0) {
      return `${group} ${titleCase(distinctive.join(" "))}`.trim();
    }
    if (num) return `${group} ${parseInt(num, 10)}`;
    return `${group} ${i + 1}`;
  });
  return dedupe(next);
}

export function sequentialRenameOptions(count: number, opts: SequentialRenameOptions): string[] {
  const prefix = (opts.prefix || "").trim();
  const start = Number.isFinite(opts.start) ? opts.start : 1;
  const pad = Math.max(0, opts.pad || 0);
  return Array.from({ length: count }, (_, i) => {
    const n = start + i;
    const num = pad > 0 ? String(n).padStart(pad, "0") : String(n);
    return prefix ? `${prefix} ${num}`.trim() : num;
  });
}
