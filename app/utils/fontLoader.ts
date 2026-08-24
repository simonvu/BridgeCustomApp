export interface FontItem {
  id: string;
  name: string;
  family: string;
  fontType: "GOOGLE" | "CUSTOM";
  sourceUrl?: string | null;
  fileKey?: string | null;
  isDefault?: boolean;
}

const loadedFontsSet = new Set<string>();

/**
 * Loads a single font asynchronously into the browser document.fonts system
 */
export async function loadSingleFontOnDemand(
  fontOrFamily: FontItem | string,
  availableFonts: FontItem[] = []
): Promise<boolean> {
  if (typeof document === "undefined" || !fontOrFamily) return true;

  let fontFamily = "";
  let fontItem: FontItem | undefined;

  if (typeof fontOrFamily === "string") {
    fontFamily = fontOrFamily.trim();
    fontItem = availableFonts.find(
      (f) => f.family.toLowerCase() === fontFamily.toLowerCase()
    );
  } else {
    fontItem = fontOrFamily;
    fontFamily = fontItem.family.trim();
  }

  if (!fontFamily) return true;

  // 1. Inject font stylesheet or @font-face rule
  if (fontItem && fontItem.fontType === "CUSTOM" && fontItem.sourceUrl) {
    const styleId = `custom-font-${fontItem.id || fontFamily.replace(/\s+/g, "-")}`;
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = `
        @font-face {
          font-family: '${fontFamily}';
          src: url('${fontItem.sourceUrl}');
          font-weight: 100 900;
          font-style: normal;
          font-display: swap;
        }
      `;
      document.head.appendChild(styleEl);
    }
  } else {
    // Default / Google Font
    const formatted = fontFamily.replace(/\s+/g, "+");
    const linkId = `google-font-${formatted}`;
    if (!document.getElementById(linkId)) {
      const linkEl = document.createElement("link");
      linkEl.id = linkId;
      linkEl.rel = "stylesheet";
      linkEl.href = `https://fonts.googleapis.com/css2?family=${formatted}&display=swap`;
      document.head.appendChild(linkEl);
    }
  }

  // 2. Wait for document.fonts to resolve font face
  if (document.fonts) {
    try {
      await document.fonts.load(`16px "${fontFamily}"`);
      await document.fonts.ready;
    } catch (e) {
      console.warn(`Font load load() warning for ${fontFamily}:`, e);
    }
  }

  loadedFontsSet.add(fontFamily);

  // 3. Dispatch global ready notification
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("studio:font-loaded", { detail: { fontFamily } })
    );
  }

  return true;
}

export function injectFontStylesheets(fonts: FontItem[]) {
  if (typeof document === "undefined" || !Array.isArray(fonts)) return;
  fonts.forEach((font) => {
    loadSingleFontOnDemand(font, fonts).catch(() => {});
  });
}

export async function ensureFontLoaded(
  fontFamily: string,
  availableFonts: FontItem[] = []
): Promise<boolean> {
  return loadSingleFontOnDemand(fontFamily, availableFonts);
}
