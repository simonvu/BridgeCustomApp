export interface FontItem {
  id: string;
  name: string;
  family: string;
  fontType: "GOOGLE" | "CUSTOM";
  sourceUrl?: string | null;
  fileKey?: string | null;
  isDefault?: boolean;
}

const injectedFamilies = new Set<string>();
const readyFamilies = new Set<string>();
const inflight = new Map<string, Promise<boolean>>();

function injectCustomFontFace(fontFamily: string, sourceUrl: string, styleId: string) {
  if (document.getElementById(styleId)) return;
  const safeName = fontFamily.replace(/'/g, "\\'");
  const styleEl = document.createElement("style");
  styleEl.id = styleId;
  // Map the same file to regular/bold + italic so Fabric weight/style toggles resolve.
  styleEl.textContent = `
    @font-face {
      font-family: '${safeName}';
      src: url('${sourceUrl}');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: '${safeName}';
      src: url('${sourceUrl}');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: '${safeName}';
      src: url('${sourceUrl}');
      font-weight: 400;
      font-style: italic;
      font-display: swap;
    }
    @font-face {
      font-family: '${safeName}';
      src: url('${sourceUrl}');
      font-weight: 700;
      font-style: italic;
      font-display: swap;
    }
  `;
  document.head.appendChild(styleEl);
}

function injectGoogleFontStylesheet(fontFamily: string) {
  const formatted = fontFamily.trim().replace(/\s+/g, "+");
  const linkId = `google-font-${formatted}`;
  if (document.getElementById(linkId)) return;
  const linkEl = document.createElement("link");
  linkEl.id = linkId;
  linkEl.rel = "stylesheet";
  linkEl.href = `https://fonts.googleapis.com/css2?family=${formatted}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
  linkEl.onerror = () => {
    linkEl.href = `https://fonts.googleapis.com/css2?family=${formatted}&display=swap`;
  };
  document.head.appendChild(linkEl);
}

async function waitForFontVariants(fontFamily: string): Promise<void> {
  if (!document.fonts) return;
  const quoted = /[\s,]/.test(fontFamily) ? `"${fontFamily.replace(/"/g, "")}"` : fontFamily;
  const specs = [
    `400 16px ${quoted}`,
    `700 16px ${quoted}`,
    `italic 400 16px ${quoted}`,
    `italic 700 16px ${quoted}`,
    `16px ${quoted}`,
    `bold 36px ${quoted}`,
  ];
  await Promise.all(
    specs.map((spec) =>
      document.fonts.load(spec).catch(() => [] as FontFace[])
    )
  );
  try {
    await document.fonts.ready;
  } catch {
    // ignore
  }
}

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
    fontItem = availableFonts.find((f) => f.family.toLowerCase() === fontFamily.toLowerCase());
  } else {
    fontItem = fontOrFamily;
    fontFamily = fontItem.family.trim();
  }

  if (!fontFamily) return true;
  if (readyFamilies.has(fontFamily)) return true;

  const existing = inflight.get(fontFamily);
  if (existing) return existing;

  const pending = (async () => {
    if (!injectedFamilies.has(fontFamily)) {
      if (fontItem && fontItem.fontType === "CUSTOM" && fontItem.sourceUrl) {
        const styleId = `custom-font-${fontItem.id || fontFamily.replace(/\s+/g, "-")}`;
        injectCustomFontFace(fontFamily, fontItem.sourceUrl, styleId);
      } else {
        injectGoogleFontStylesheet(fontFamily);
      }
      injectedFamilies.add(fontFamily);
    }

    await waitForFontVariants(fontFamily);
    readyFamilies.add(fontFamily);
    inflight.delete(fontFamily);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("studio:font-loaded", { detail: { fontFamily } }));
    }
    return true;
  })();

  inflight.set(fontFamily, pending);
  try {
    return await pending;
  } catch (e) {
    inflight.delete(fontFamily);
    console.warn(`Font load warning for ${fontFamily}:`, e);
    return false;
  }
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
