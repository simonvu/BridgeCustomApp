import * as fabric from "fabric";

export function quoteFontFamily(family?: string | null): string {
  const name = String(family || "Roboto").trim() || "Roboto";
  if (/[\s,]/.test(name)) return `"${name.replace(/"/g, "")}"`;
  return name;
}

export function isBoldFontWeight(weight?: string | number | null): boolean {
  if (weight === "bold" || weight === "bolder") return true;
  const n = Number(weight);
  return Number.isFinite(n) && n >= 700;
}

export function normalizeFontWeight(weight?: string | number | null): string | number {
  if (isBoldFontWeight(weight)) return "bold";
  if (!weight || weight === "normal" || weight === "lighter") return "normal";
  return weight;
}

export function applyTextCase(text: string, textCase?: string): string {
  if (!text) return "";
  if (textCase === "UPPERCASE") return text.toUpperCase();
  if (textCase === "LOWERCASE") return text.toLowerCase();
  if (textCase === "TITLECASE") {
    return text.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
  }
  return text;
}

export function getFitFontSize(
  textStr: string,
  fontFamily: string,
  baseFontSize: number,
  containerWidth: number,
  isAutoFit: boolean = true,
  fontWeight: string | number = "normal",
  fontStyle: string = "normal"
): number {
  if (!isAutoFit || !textStr || containerWidth <= 0) return baseFontSize;
  try {
    const targetWidth = Math.max(10, containerWidth - 6);
    let currentFontSize = baseFontSize;
    const family = quoteFontFamily(fontFamily);

    for (let pass = 0; pass < 15; pass++) {
      const tempText = new fabric.Text(textStr, {
        fontFamily: family,
        fontSize: currentFontSize,
        fontWeight: fontWeight as any,
        fontStyle: fontStyle as any,
      });
      const measuredWidth = tempText.width || 0;
      if (measuredWidth <= targetWidth || currentFontSize <= 6) break;
      const scaleFactor = targetWidth / measuredWidth;
      const nextSize = Math.floor(currentFontSize * scaleFactor);
      currentFontSize = nextSize >= currentFontSize ? currentFontSize - 1 : Math.max(6, nextSize);
    }
    return currentFontSize;
  } catch {
    return baseFontSize;
  }
}

export function layoutTextInFrame(opts: {
  isTextbox: boolean;
  isCurved: boolean;
  hAlign: string;
  vAlign: string;
  frameW: number;
  frameH: number;
  measuredW: number;
  measuredH: number;
  curveOffsetY?: number;
}): { left: number; top: number } {
  const { isTextbox, isCurved, hAlign, vAlign, frameW, frameH, measuredW, measuredH, curveOffsetY = 0 } = opts;

  if (isCurved) {
    return { left: 0, top: curveOffsetY };
  }

  let left = 0;
  let top = 0;

  // Textbox already spans the frame width, so horizontal align is textAlign — not object offset.
  if (!isTextbox) {
    if (hAlign === "left") left = -frameW / 2 + measuredW / 2;
    else if (hAlign === "right") left = frameW / 2 - measuredW / 2;
  }

  if (vAlign === "top") top = -frameH / 2 + measuredH / 2;
  else if (vAlign === "bottom") top = frameH / 2 - measuredH / 2;

  return { left, top };
}
