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

// Memory Cache for Trimmed Transparent Canvases
const trimmedImageCache = new Map<string, HTMLCanvasElement>();

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
  const imgData = ctx.getImageData(0, 0, origW, origH);
  const data = imgData.data;

  let minX = origW;
  let minY = origH;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < origH; y++) {
    for (let x = 0; x < origW; x++) {
      const alpha = data[(y * origW + x) * 4 + 3];
      if (alpha > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If entire image is empty or invalid, return original
  if (maxX < minX || maxY < minY) {
    return tempCanvas;
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = cropW;
  trimmedCanvas.height = cropH;

  const trimmedCtx = trimmedCanvas.getContext("2d");
  if (trimmedCtx) {
    trimmedCtx.drawImage(tempCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  }

  return trimmedCanvas;
}

/**
 * Loads an image from URL and automatically trims transparent padding
 */
export function loadAndTrimImage(url: string): Promise<HTMLCanvasElement | null> {
  if (!url) return Promise.resolve(null);
  if (trimmedImageCache.has(url)) {
    return Promise.resolve(trimmedImageCache.get(url)!);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const trimmed = trimTransparentCanvas(img);
        trimmedImageCache.set(url, trimmed);
        resolve(trimmed);
      } catch (err) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Pseudo-random seed generator
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function getDoodleLetterForChar(
  char: string,
  style: DoodleStyleItem
): string | null {
  if (!style || !style.letters || style.letters.length === 0) return null;

  // 1. Exact match
  const exact = style.letters.find((l) => l.char === char);
  if (exact?.imageUrl) return exact.imageUrl;

  // 2. Case fallback (uppercase for lowercase or vice-versa)
  const isLower = char === char.toLowerCase();
  const altChar = isLower ? char.toUpperCase() : char.toLowerCase();
  const alt = style.letters.find((l) => l.char === altChar);
  if (alt?.imageUrl) return alt.imageUrl;

  // 3. Uppercase A-Z fallback
  const upper = char.toUpperCase();
  const upperObj = style.letters.find((l) => l.char === upper);
  if (upperObj?.imageUrl) return upperObj.imageUrl;

  // 4. Any letter fallback in style
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

export function resolveDoodleStyleAssignments(
  text: string,
  pack: DoodlePackItem,
  rule: "RANDOM_SHUFFLE" | "CYCLE_PATTERN" | "SEED_SHUFFLE" | "FIXED_STYLE",
  fixedStyleId?: string,
  seed: number = 12345
): { char: string; style: DoodleStyleItem; imageUrl: string | null }[] {
  if (!pack || !pack.styles || pack.styles.length === 0) return [];

  const styles = pack.styles;
  const result: { char: string; style: DoodleStyleItem; imageUrl: string | null }[] = [];

  // Count non-space characters
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
