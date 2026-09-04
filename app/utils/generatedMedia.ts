/** Save/preview artifacts that should not appear in the media picker. */
export function isGeneratedMediaFile(file: {
  fileName?: string | null;
  folder?: string | null;
  key?: string | null;
}): boolean {
  const name = file.fileName || "";
  const loc = `${file.folder || ""}/${file.key || ""}`;
  if (loc.includes("_generated")) return true;
  if (name.startsWith("clipart_thumb_") || name.startsWith("opt_thumb_")) return true;
  if (name.startsWith("clipart_") && !name.startsWith("clipart_merge")) return true;
  return false;
}

export const GENERATED_MEDIA_WHERE_NOT = {
  OR: [
    { folder: { contains: "_generated" } },
    { fileName: { startsWith: "clipart_thumb_" } },
    { fileName: { startsWith: "opt_thumb_" } },
    {
      AND: [{ fileName: { startsWith: "clipart_" } }, { NOT: { fileName: { startsWith: "clipart_merge" } } }],
    },
  ],
};
