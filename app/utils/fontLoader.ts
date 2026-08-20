export interface FontItem {
  id: string;
  name: string;
  family: string;
  fontType: "GOOGLE" | "CUSTOM";
  sourceUrl?: string | null;
  fileKey?: string | null;
  isDefault?: boolean;
}

/**
 * Dynamically injects Google Fonts <link> tags and Custom Font @font-face rules into document <head>
 */
export function injectFontStylesheets(fonts: FontItem[]) {
  if (typeof document === "undefined" || !Array.isArray(fonts)) return;

  const googleFamilies: string[] = [];

  fonts.forEach((font) => {
    if (font.fontType === "GOOGLE" && font.family) {
      // Format Google Font family name for Google Fonts API
      const formatted = font.family.trim().replace(/\s+/g, "+");
      if (!googleFamilies.includes(formatted)) {
        googleFamilies.push(formatted);
      }
    } else if (font.fontType === "CUSTOM" && font.sourceUrl) {
      // Inject @font-face CSS for Custom Font (supporting both normal and bold)
      const styleId = `custom-font-style-${font.id}`;
      if (!document.getElementById(styleId)) {
        const styleEl = document.createElement("style");
        styleEl.id = styleId;
        styleEl.textContent = `
          @font-face {
            font-family: '${font.family}';
            src: url('${font.sourceUrl}');
            font-weight: 400;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: '${font.family}';
            src: url('${font.sourceUrl}');
            font-weight: 700;
            font-style: normal;
            font-display: swap;
          }
        `;
        document.head.appendChild(styleEl);
      }

      // Explicitly load FontFace object into document.fonts for HTML5 Canvas compatibility
      if (typeof FontFace !== "undefined") {
        try {
          const fontFace = new FontFace(font.family, `url("${font.sourceUrl}")`);
          fontFace.load().then((loadedFace) => {
            document.fonts.add(loadedFace);
          }).catch((err) => {
            console.warn(`Font load warning for ${font.family}:`, err);
          });
        } catch (e) {}
      }
    }
  });

  if (googleFamilies.length > 0) {
    const googleFontUrl = `https://fonts.googleapis.com/css2?${googleFamilies
      .map((f) => `family=${f}:ital,wght@0,400;0,700;1,400;1,700`)
      .join("&")}&display=swap`;

    const linkId = "google-fonts-dynamic-stylesheet";
    let linkEl = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!linkEl) {
      linkEl = document.createElement("link");
      linkEl.id = linkId;
      linkEl.rel = "stylesheet";
      document.head.appendChild(linkEl);
    }
    linkEl.href = googleFontUrl;
  }
}
