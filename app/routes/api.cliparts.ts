import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { getTeamUserId } from "../services/auth.server";
import prisma from "../db.server";

// GET /api/cliparts            -> list all clip arts (newest first)
// GET /api/cliparts?id=<id>    -> one clip art (with layers JSON)
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const model = (prisma as any).clipArt;
  if (!model) return json({ cliparts: [], clipart: null });

  if (id) {
    const clipart = await model.findUnique({ where: { id } });
    if (!clipart) return json({ error: "Clip art not found" }, { status: 404 });
    return json({ clipart });
  }

  const cliparts = await model.findMany({ orderBy: { updatedAt: "desc" } });
  return json({ cliparts });
}

// POST /api/cliparts  { intent: "SAVE" | "DELETE" | "DUPLICATE", ... }
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const model = (prisma as any).clipArt;
  if (!model) return json({ error: "ClipArt model not available" }, { status: 500 });

  const userId = await getTeamUserId(request);
  const currentUser = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  const uploaderName = currentUser?.name || "Super Admin";
  const uploaderAvatar =
    currentUser?.avatarUrl ||
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const intent = body?.intent || "SAVE";

  try {
    if (intent === "DELETE") {
      if (!body.id) return json({ error: "Missing id" }, { status: 400 });
      await model.deleteMany({ where: { id: body.id } });
      return json({ success: true });
    }

    if (intent === "DUPLICATE") {
      if (!body.id) return json({ error: "Missing id" }, { status: 400 });
      const src = await model.findUnique({ where: { id: body.id } });
      if (!src) return json({ error: "Clip art not found" }, { status: 404 });
      const { id: _omit, createdAt: _c, updatedAt: _u, ...rest } = src;
      const copy = await model.create({
        data: { ...rest, name: `${src.name} (Copy)`, createdByName: uploaderName, createdByAvatar: uploaderAvatar },
      });
      return json({ success: true, clipart: copy });
    }

    // SAVE (create or update)
    const {
      id,
      name,
      category,
      tags,
      widthPx,
      heightPx,
      bgColor,
      layers,
      compositeUrl,
      compositeKey,
      thumbnailUrl,
      status,
    } = body;

    if (!name || !String(name).trim()) {
      return json({ error: "Clip art name is required" }, { status: 400 });
    }

    const layersJson = typeof layers === "object" ? JSON.stringify(layers) : layers || null;
    const layerCount = Array.isArray(layers) ? layers.length : 0;

    const data: any = {
      name: String(name).trim(),
      category: category || "General",
      tags: tags || null,
      widthPx: widthPx || 1000,
      heightPx: heightPx || 1000,
      bgColor: bgColor || null,
      layers: layersJson,
      compositeUrl: compositeUrl || null,
      compositeKey: compositeKey || null,
      thumbnailUrl: thumbnailUrl || compositeUrl || null,
      layerCount,
      status: status || "PUBLISHED",
      createdByName: uploaderName,
      createdByAvatar: uploaderAvatar,
    };

    let clipart;
    const existing = id ? await model.findUnique({ where: { id } }) : null;
    if (existing) {
      clipart = await model.update({ where: { id }, data });
    } else {
      clipart = await model.create({ data });
    }

    return json({ success: true, clipart });
  } catch (error: any) {
    console.error("API ClipArt error:", error);
    return json({ error: error.message || "Failed to save clip art" }, { status: 500 });
  }
}
