import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { rethrowHttpResponse } from "../services/rbac.server";
import { requireTeamPage } from "../services/team.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireTeamPage(request, "fonts:items:read");
  const fontModel = (prisma as any).font || (prisma as any).Font;
  if (!fontModel) return json({ fonts: [] });

  const fonts = await fontModel.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return json({ fonts });
}

export async function action({ request }: ActionFunctionArgs) {
  const fontModel = (prisma as any).font || (prisma as any).Font;

  if (!fontModel) {
    return json({ error: "Font model not available in database" }, { status: 500 });
  }

  const body = await request.json();
  const { action: fontAction, id, name, family, fontType, sourceUrl, fileKey } = body;
  const perm =
    fontAction === "DELETE_FONT"
      ? "fonts:items:delete"
      : fontAction === "SET_DEFAULT_FONT"
        ? "fonts:items:update"
        : "fonts:items:create";
  const { user } = await requireTeamPage(request, perm);

  try {
    if (fontAction === "ADD_GOOGLE_FONT") {
      if (!name || !family) {
        return json({ error: "Font name and family are required" }, { status: 400 });
      }

      const existing = await fontModel.findFirst({ where: { family } });
      if (existing) {
        return json({ error: `Font '${family}' is already in your library!` }, { status: 400 });
      }

      const font = await fontModel.create({
        data: {
          name: name.trim(),
          family: family.trim(),
          fontType: "GOOGLE",
          sourceUrl: sourceUrl || `https://fonts.googleapis.com/css2?family=${family.trim().replace(/\s+/g, "+")}&display=swap`,
          createdByName: user?.name || "Super Admin",
        },
      });

      return json({ success: true, font });
    }

    if (fontAction === "ADD_CUSTOM_FONT") {
      if (!name || !family || !sourceUrl) {
        return json({ error: "Font name, family, and font file URL are required" }, { status: 400 });
      }

      const font = await fontModel.create({
        data: {
          name: name.trim(),
          family: family.trim(),
          fontType: "CUSTOM",
          sourceUrl,
          fileKey: fileKey || null,
          createdByName: user?.name || "Super Admin",
        },
      });

      return json({ success: true, font });
    }

    if (fontAction === "DELETE_FONT") {
      if (!id) return json({ error: "Font ID is required" }, { status: 400 });
      await fontModel.delete({ where: { id } });
      return json({ success: true });
    }

    if (fontAction === "SET_DEFAULT_FONT") {
      if (!id) return json({ error: "Font ID is required" }, { status: 400 });
      await fontModel.updateMany({ data: { isDefault: false } });
      const font = await fontModel.update({
        where: { id },
        data: { isDefault: true },
      });
      return json({ success: true, font });
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    rethrowHttpResponse(error);
    console.error("Font API Error:", error);
    return json({ error: error.message || "Failed to process font action" }, { status: 500 });
  }
}
