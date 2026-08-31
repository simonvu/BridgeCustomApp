export interface GradientStop {
  offset: number;
  color: string;
}

export function getNormalizedGradientStops(props: any): GradientStop[] {
  const fromArray = Array.isArray(props?.gradientStops) ? props.gradientStops : null;
  const raw =
    fromArray && fromArray.length >= 2
      ? fromArray
      : [
          { offset: 0, color: props?.gradientColor1 || props?.color || "#3b82f6" },
          { offset: 1, color: props?.gradientColor2 || "#ec4899" },
        ];

  return raw
    .map((stop: any) => ({
      offset: Math.max(0, Math.min(1, Number(stop?.offset) || 0)),
      color: String(stop?.color || "#000000"),
    }))
    .sort((a: GradientStop, b: GradientStop) => a.offset - b.offset);
}

export function getLinearGradientCoords(angleDeg: number): { x1: number; y1: number; x2: number; y2: number } {
  const rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
  return {
    x1: 0.5 - Math.cos(rad) / 2,
    y1: 0.5 - Math.sin(rad) / 2,
    x2: 0.5 + Math.cos(rad) / 2,
    y2: 0.5 + Math.sin(rad) / 2,
  };
}

export function getGradientCss(props: any): string {
  const stops = getNormalizedGradientStops(props);
  const stopCss = stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(", ");
  if (props?.gradientType === "radial") {
    const cx = Math.round((Number(props?.gradientCenterX) || 0.5) * 100);
    const cy = Math.round((Number(props?.gradientCenterY) || 0.5) * 100);
    return `radial-gradient(circle at ${cx}% ${cy}%, ${stopCss})`;
  }
  const cssAngle = (Number(props?.gradientAngle) || 0) + 90;
  return `linear-gradient(${cssAngle}deg, ${stopCss})`;
}

export function buildFabricGradientOptions(props: any) {
  const stops = getNormalizedGradientStops(props);
  if (props?.gradientType === "radial") {
    const cx = Math.max(0, Math.min(1, Number(props?.gradientCenterX) || 0.5));
    const cy = Math.max(0, Math.min(1, Number(props?.gradientCenterY) || 0.5));
    const r = Math.max(0.1, Math.min(1, Number(props?.gradientRadius) || 0.5));
    return {
      type: "radial" as const,
      gradientUnits: "percentage" as const,
      coords: { x1: cx, y1: cy, r1: 0, x2: cx, y2: cy, r2: r },
      colorStops: stops,
    };
  }
  return {
    type: "linear" as const,
    gradientUnits: "percentage" as const,
    coords: getLinearGradientCoords(Number(props?.gradientAngle) || 0),
    colorStops: stops,
  };
}

export function defaultGradientPatch(currentColor?: string) {
  const start = currentColor || "#3b82f6";
  return {
    colorMode: "GRADIENT",
    gradientType: "linear",
    gradientAngle: 0,
    gradientCenterX: 0.5,
    gradientCenterY: 0.5,
    gradientRadius: 0.5,
    gradientColor1: start,
    gradientColor2: "#ec4899",
    gradientStops: [
      { offset: 0, color: start },
      { offset: 1, color: "#ec4899" },
    ],
  };
}
