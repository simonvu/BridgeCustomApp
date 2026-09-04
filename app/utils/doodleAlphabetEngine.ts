import { loadClipArtImage } from "./clipArtInstance";

export interface DoodleLetterMapping {
  char: string;
  imageUrl: string;
}

export interface DoodleStyleItem {
  id: string;
  name: string;
  sortOrder: number;
  letters: DoodleLetterMapping[];
}

export interface DoodlePackItem {
  id: string;
  name: string;
  code: string;
  description?: string;
  thumbnailUrl?: string;
  styles: DoodleStyleItem[];
}

export interface DoodleCompositeLetter {
  char: string;
  styleName: string;
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DoodleStyleAssignment {
  char: string;
  style: DoodleStyleItem;
  imageUrl: string | null;
}

export interface DoodleLetterPlacement {
  left: number;
  top: number;
  displayW: number;
  displayH: number;
}

const TRIM_CACHE_MAX = 120;
const trimmedImageCache = new Map<string, HTMLCanvasElement>();
const trimmedPending = new Map<string, Promise<HTMLCanvasElement | null>>();

const ASSIGNMENT_CACHE_MAX = 40;
const assignmentCache = new Map<string, DoodleStyleAssignment[]>();

const styleLetterIndex = new WeakMap<DoodleStyleItem, Map<string, DoodleLetterMapping>>();

function rememberLru<K, V>(cache: Map<K, V>, key: K, value: V, max: number) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > max) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function peekLru<K, V>(cache: Map<K, V>, key: K): V | undefined {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function rowHasOpaque(data: Uint8ClampedArray, origW: number, y: number): boolean {
  const row = y * origW * 4;
  const end = row + origW * 4;
  for (let i = row + 3; i < end; i += 4) {
    if (data[i] > 10) return true;
  }
  return false;
}

function colHasOpaque(
  data: Uint8ClampedArray,
  origW: number,
  x: number,
  y0: number,
  y1: number
): boolean {
  for (let y = y0; y <= y1; y++) {
    if (data[(y * origW + x) * 4 + 3] > 10) return true;
  }
  return false;
}

/**
 * Auto-crops transparent padding around an image element/canvas
 * Returns a trimmed HTMLCanvasElement containing only the visible pixel bounding box
 */
export function trimTransparentCanvas(
  imgEl: HTMLImageElement | HTMLCanvasElement
): HTMLCanvasElement {
  const origW = imgEl.width || 100;
  const origH = imgEl.height || 100;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = origW;
  tempCanvas.height = origH;

  const ctx = tempCanvas.getContext("2d");
  if (!ctx) return tempCanvas;

  ctx.drawImage(imgEl, 0, 0);
  const data = ctx.getImageData(0, 0, origW, origH).data;

  let minY = 0;
  while (minY < origH && !rowHasOpaque(data, origW, minY)) minY++;
  let maxY = origH - 1;
  while (maxY >= minY && !rowHasOpaque(data, origW, maxY)) maxY--;

  if (minY > maxY) return tempCanvas;

  let minX = 0;
  while (minX < origW && !colHasOpaque(data, origW, minX, minY, maxY)) minX++;
  let maxX = origW - 1;
  while (maxX >= minX && !colHasOpaque(data, origW, maxX, minY, maxY)) maxX--;

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  if (cropW === origW && cropH === origH && minX === 0 && minY === 0) {
    return tempCanvas;
  }

  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = cropW;
  trimmedCanvas.height = cropH;

  const trimmedCtx = trimmedCanvas.getContext("2d");
  if (trimmedCtx) {
    trimmedCtx.drawImage(tempCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  }

  return trimmedCanvas;
}

export function getCachedTrimmedImage(url: string): HTMLCanvasElement | undefined {
  if (!url) return undefined;
  return peekLru(trimmedImageCache, url);
}

/**
 * Loads an image from URL and automatically trims transparent padding
 */
export function loadAndTrimImage(url: string): Promise<HTMLCanvasElement | null> {
  if (!url) return Promise.resolve(null);
  const cached = peekLru(trimmedImageCache, url);
  if (cached) return Promise.resolve(cached);
  const inflight = trimmedPending.get(url);
  if (inflight) return inflight;
  const p = loadClipArtImage(url)
    .then((img) => {
      const trimmed = trimTransparentCanvas(img);
      rememberLru(trimmedImageCache, url, trimmed, TRIM_CACHE_MAX);
      return trimmed;
    })
    .catch(() => null)
    .finally(() => {
      trimmedPending.delete(url);
    });
  trimmedPending.set(url, p);
  return p;
}

export function collectDoodleLetterUrls(assignments: DoodleStyleAssignment[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (let i = 0; i < assignments.length; i++) {
    const url = assignments[i].imageUrl;
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

export function preloadDoodleLetterImages(assignments: DoodleStyleAssignment[]): Promise<void> {
  const urls = collectDoodleLetterUrls(assignments);
  if (urls.length === 0) return Promise.resolve();
  return Promise.all(urls.map((url) => loadAndTrimImage(url))).then(() => undefined);
}

export function layoutDoodleAlphabetRow(
  slots: Array<{ width: number; height: number } | null>,
  opts: {
    renderWidth: number;
    renderHeight: number;
    letterSpacing: number;
    autoFitContainer: boolean;
    align?: string;
  }
): Array<DoodleLetterPlacement | null> {
  const renderWidth = opts.renderWidth;
  const renderHeight = opts.renderHeight;
  const letterSpacing = opts.letterSpacing;
  const autoFitContainer = opts.autoFitContainer;
  const align = opts.align || "center";
  const baseMaxLetterH = renderHeight * 0.85;

  const scaled: Array<{ w: number; h: number } | null> = new Array(slots.length);
  let letterCount = 0;
  let rawTotalW = 0;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot) {
      scaled[i] = null;
      rawTotalW += baseMaxLetterH * 0.5 + letterSpacing;
      continue;
    }
    const origW = slot.width || 100;
    const origH = slot.height || 100;
    const letterW = origW * (baseMaxLetterH / origH);
    scaled[i] = { w: letterW, h: baseMaxLetterH };
    rawTotalW += letterW + letterSpacing;
    letterCount++;
  }
  if (letterCount > 0) rawTotalW -= letterSpacing;

  let fitScale = 1;
  if (autoFitContainer && rawTotalW > renderWidth) {
    fitScale = renderWidth / Math.max(1, rawTotalW);
  }

  const finalLetterSpacing = letterSpacing * fitScale;
  const finalMaxLetterH = baseMaxLetterH * fitScale;

  let finalTotalW = 0;
  const fitted: Array<{ w: number; h: number } | null> = new Array(slots.length);
  for (let i = 0; i < scaled.length; i++) {
    const item = scaled[i];
    if (!item) {
      fitted[i] = null;
      finalTotalW += finalMaxLetterH * 0.5 + finalLetterSpacing;
      continue;
    }
    const w = item.w * fitScale;
    const h = item.h * fitScale;
    fitted[i] = { w, h };
    finalTotalW += w + finalLetterSpacing;
  }
  if (letterCount > 0) finalTotalW -= finalLetterSpacing;

  let startX = -finalTotalW / 2;
  if (align === "left") startX = -renderWidth / 2 + 10;
  else if (align === "right") startX = renderWidth / 2 - finalTotalW - 10;

  let currentX = startX;
  const placements: Array<DoodleLetterPlacement | null> = new Array(slots.length);
  for (let i = 0; i < fitted.length; i++) {
    const item = fitted[i];
    if (!item) {
      placements[i] = null;
      currentX += finalMaxLetterH * 0.5 + finalLetterSpacing;
      continue;
    }
    placements[i] = {
      left: currentX + item.w / 2,
      top: 0,
      displayW: item.w,
      displayH: item.h,
    };
    currentX += item.w + finalLetterSpacing;
  }

  return placements;
}

// Pseudo-random seed generator
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function firstLetterByChar(style: DoodleStyleItem): Map<string, DoodleLetterMapping> {
  let map = styleLetterIndex.get(style);
  if (map) return map;
  map = new Map();
  const letters = style.letters || [];
  for (let i = 0; i < letters.length; i++) {
    const l = letters[i];
    if (l?.char && !map.has(l.char)) {
      map.set(l.char, l);
    }
  }
  styleLetterIndex.set(style, map);
  return map;
}

export function getDoodleLetterForChar(
  char: string,
  style: DoodleStyleItem
): string | null {
  if (!style || !style.letters || style.letters.length === 0) return null;

  const byChar = firstLetterByChar(style);

  const exact = byChar.get(char);
  if (exact?.imageUrl) return exact.imageUrl;

  const isLower = char === char.toLowerCase();
  const altChar = isLower ? char.toUpperCase() : char.toLowerCase();
  const alt = byChar.get(altChar);
  if (alt?.imageUrl) return alt.imageUrl;

  const upper = byChar.get(char.toUpperCase());
  if (upper?.imageUrl) return upper.imageUrl;

  return style.letters[0]?.imageUrl || null;
}

/**
 * Builds a balanced style sequence for N characters that GUARANTEES:
 * 1. Full coverage of ALL available styles in the pack when word length >= styles.length
 * 2. Strict ZERO adjacent duplicate styles
 */
function buildBalancedStyleSequence(
  numChars: number,
  styles: DoodleStyleItem[],
  rule: "RANDOM_SHUFFLE" | "CYCLE_PATTERN" | "SEED_SHUFFLE",
  seed: number
): DoodleStyleItem[] {
  if (!styles || styles.length === 0) return [];
  if (styles.length === 1) return Array(numChars).fill(styles[0]);

  const N = styles.length;
  const sequence: DoodleStyleItem[] = [];

  if (rule === "CYCLE_PATTERN") {
    let lastId: string | null = null;
    for (let i = 0; i < numChars; i++) {
      let candidate = styles[i % N];
      if (candidate.id === lastId && N > 1) {
        candidate = styles[(i + 1) % N];
      }
      sequence.push(candidate);
      lastId = candidate.id;
    }
    return sequence;
  }

  // RANDOM_SHUFFLE or SEED_SHUFFLE:
  // Generate chunked permutations of all N styles so EVERY style MUST be used!
  let currentSeed = seed;

  const shuffleArray = (arr: DoodleStyleItem[], seedVal: number): DoodleStyleItem[] => {
    const list = [...arr];
    for (let i = list.length - 1; i > 0; i--) {
      const rnd = seededRandom(seedVal + i * 37 + list.length * 13);
      const j = Math.floor(rnd * (i + 1));
      const temp = list[i];
      list[i] = list[j];
      list[j] = temp;
    }
    return list;
  };

  let lastId: string | null = null;

  while (sequence.length < numChars) {
    let chunk = shuffleArray(styles, currentSeed);
    currentSeed += 1009;

    // Check boundary overlap with last element in sequence
    if (lastId && chunk.length > 1 && chunk[0].id === lastId) {
      const swapIdx = chunk.findIndex((s) => s.id !== lastId);
      if (swapIdx > 0) {
        const temp = chunk[0];
        chunk[0] = chunk[swapIdx];
        chunk[swapIdx] = temp;
      }
    }

    for (let k = 0; k < chunk.length && sequence.length < numChars; k++) {
      let item = chunk[k];
      if (lastId && item.id === lastId && chunk.length > 1) {
        const alt = chunk.find((s, idx) => idx > k && s.id !== lastId);
        if (alt) {
          const altIdx = chunk.indexOf(alt);
          chunk[altIdx] = item;
          item = alt;
        }
      }
      sequence.push(item);
      lastId = item.id;
    }
  }

  return sequence;
}

function assignmentCacheKey(
  text: string,
  pack: DoodlePackItem,
  rule: string,
  fixedStyleId: string | undefined,
  seed: number
): string {
  const styles = pack.styles || [];
  let styleFp = pack.id || "";
  for (let i = 0; i < styles.length; i++) {
    const s = styles[i];
    styleFp += `|${s.id}`;
    const letters = s.letters || [];
    for (let j = 0; j < letters.length; j++) {
      styleFp += `,${letters[j].char}=${letters[j].imageUrl || ""}`;
    }
  }
  return `${styleFp}\n${text}\n${rule}\n${fixedStyleId || ""}\n${seed}`;
}

export function resolveDoodleStyleAssignments(
  text: string,
  pack: DoodlePackItem,
  rule: "RANDOM_SHUFFLE" | "CYCLE_PATTERN" | "SEED_SHUFFLE" | "FIXED_STYLE",
  fixedStyleId?: string,
  seed: number = 12345
): DoodleStyleAssignment[] {
  if (!pack || !pack.styles || pack.styles.length === 0) return [];

  const key = assignmentCacheKey(text, pack, rule, fixedStyleId, seed);
  const cached = peekLru(assignmentCache, key);
  if (cached) return cached;

  const result = resolveDoodleStyleAssignmentsUncached(text, pack, rule, fixedStyleId, seed);
  rememberLru(assignmentCache, key, result, ASSIGNMENT_CACHE_MAX);
  return result;
}

function resolveDoodleStyleAssignmentsUncached(
  text: string,
  pack: DoodlePackItem,
  rule: "RANDOM_SHUFFLE" | "CYCLE_PATTERN" | "SEED_SHUFFLE" | "FIXED_STYLE",
  fixedStyleId?: string,
  seed: number = 12345
): DoodleStyleAssignment[] {
  const styles = pack.styles;
  const result: DoodleStyleAssignment[] = [];

  let nonSpaceCount = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== " ") nonSpaceCount++;
  }

  let styleSeq: DoodleStyleItem[] = [];
  if (rule !== "FIXED_STYLE") {
    styleSeq = buildBalancedStyleSequence(
      nonSpaceCount,
      styles,
      rule as "RANDOM_SHUFFLE" | "CYCLE_PATTERN" | "SEED_SHUFFLE",
      seed
    );
  }

  let seqIdx = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === " ") {
      result.push({ char: " ", style: styles[0], imageUrl: null });
      continue;
    }

    let selectedStyle: DoodleStyleItem = styles[0];

    if (rule === "FIXED_STYLE" && fixedStyleId) {
      const fixed = styles.find((s) => s.id === fixedStyleId);
      if (fixed) selectedStyle = fixed;
    } else {
      selectedStyle = styleSeq[seqIdx] || styles[0];
      seqIdx++;
    }

    const imageUrl = getDoodleLetterForChar(char, selectedStyle);
    result.push({ char, style: selectedStyle, imageUrl });
  }

  return result;
}
