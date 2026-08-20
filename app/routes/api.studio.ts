import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { getTeamUserId } from "../services/auth.server";
import prisma from "../db.server";

// GET /api/studio?id=<artworkId> or GET /api/studio (list all studio artworks)
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const artworkId = url.searchParams.get("id");

  const studioModel = (prisma as any).studioArtwork;
  if (!studioModel) {
    return json({ artworks: [], artwork: null });
  }

  if (artworkId) {
    const artwork = await studioModel.findUnique({
      where: { id: artworkId },
      include: {
        studioScreens: { orderBy: { sortOrder: "asc" } },
        layers: { orderBy: { zIndex: "asc" } },
        fields: { orderBy: { sortOrder: "asc" } },
        rules: true,
      },
    });

    if (!artwork) {
      return json({ error: "Studio Artwork not found" }, { status: 404 });
    }

    return json({ artwork });
  }

  const artworks = await studioModel.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      studioScreens: { orderBy: { sortOrder: "asc" } },
      layers: true,
      fields: true,
    },
  });

  return json({ artworks });
}

// POST /api/studio - Create or Full Save Studio Artwork (Relational 3NF & Performance Dual Sync)
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let userId = await getTeamUserId(request);
  let currentUser = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;

  if (!currentUser) {
    currentUser = await prisma.user.findFirst({ where: { email: "admin@bridgecustom.com" } });
  }

  const uploaderName = currentUser?.name || "Super Admin";
  const uploaderAvatar = currentUser?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";

  try {
    const body = await request.json();
    const {
      id,
      title,
      category,
      niche,
      widthPx,
      heightPx,
      bgUrl,
      thumbnailUrl,
      screens,
      screenFieldConfig,
      layers,
      fields,
      rules,
    } = body;

    if (!title || !title.trim()) {
      return json({ error: "Artwork title is required" }, { status: 400 });
    }

    const studioModel = (prisma as any).studioArtwork;
    if (!studioModel) {
      return json({ error: "Database model StudioArtwork not found" }, { status: 500 });
    }

    const screensJson = typeof screens === "object" ? JSON.stringify(screens) : screens || null;
    const screenFieldConfigJson = typeof screenFieldConfig === "object" ? JSON.stringify(screenFieldConfig) : screenFieldConfig || null;

    let artwork;
    const existingRecord = id ? await studioModel.findUnique({ where: { id } }) : null;

    if (existingRecord) {
      // 1. Update existing Artwork Master Record
      artwork = await studioModel.update({
        where: { id },
        data: {
          title: title.trim(),
          category: category || "Best Friends",
          niche: niche || "Quotes",
          widthPx: widthPx || 1000,
          heightPx: heightPx || 1000,
          bgUrl: bgUrl || null,
          thumbnailUrl: thumbnailUrl || null,
          enableScreenField: screenFieldConfig?.enableScreenField ?? false,
          screenCustomerLabel: screenFieldConfig?.customerLabel || "Number Of Grandkids",
          screenDisplayMode: screenFieldConfig?.displayViewMode || "BUTTON",
          screens: screensJson,
          screenFieldConfig: screenFieldConfigJson,
          createdByName: uploaderName,
          createdByAvatar: uploaderAvatar,
        },
      });

      // 2. Sync Relational StudioScreens Table
      if (Array.isArray(screens)) {
        await (prisma as any).studioScreen.deleteMany({ where: { artworkId: id } });
        if (screens.length > 0) {
          await (prisma as any).studioScreen.createMany({
            data: screens.map((s: any, idx: number) => ({
              id: s.id && !s.id.startsWith("screen_") ? s.id : undefined,
              artworkId: id,
              name: s.name || `Screen ${idx + 1}`,
              bgUrl: s.bgUrl || null,
              bgColor: s.bgColor || "#ffffff",
              iconUrl: s.iconUrl || null,
              sortOrder: s.sortOrder !== undefined ? s.sortOrder : idx,
            })),
          });
        }
      }

      // 3. Sync Relational StudioLayers Table
      if (Array.isArray(layers)) {
        await (prisma as any).studioLayer.deleteMany({ where: { artworkId: id } });
        if (layers.length > 0) {
          await (prisma as any).studioLayer.createMany({
            data: layers.map((l: any, idx: number) => ({
              id: l.id && !l.id.startsWith("layer_") ? l.id : undefined,
              artworkId: id,
              name: l.name || `Layer ${idx + 1}`,
              layerType: l.layerType || "ASSET",
              zIndex: l.zIndex !== undefined ? l.zIndex : idx,
              posX: l.posX || 0,
              posY: l.posY || 0,
              width: l.width || 200,
              height: l.height || 200,
              rotation: l.rotation || 0,
              scaleX: l.scaleX || 1,
              scaleY: l.scaleY || 1,
              isVisible: l.isVisible !== undefined ? l.isVisible : true,
              isLocked: l.isLocked !== undefined ? l.isLocked : false,
              properties: typeof l.properties === "object" ? JSON.stringify(l.properties) : l.properties || null,
              linkedFieldId: l.linkedFieldId || null,
            })),
          });
        }
      }

      // 4. Sync Relational StudioFields Table
      if (Array.isArray(fields)) {
        await (prisma as any).studioField.deleteMany({ where: { artworkId: id } });
        if (fields.length > 0) {
          await (prisma as any).studioField.createMany({
            data: fields.map((f: any, idx: number) => ({
              id: f.id && !f.id.startsWith("field_") ? f.id : undefined,
              artworkId: id,
              label: f.label || `Field ${idx + 1}`,
              fieldType: f.fieldType || "TEXT",
              sortOrder: f.sortOrder !== undefined ? f.sortOrder : idx,
              isRequired: f.isRequired !== undefined ? f.isRequired : false,
              config: typeof f.config === "object" ? JSON.stringify(f.config) : f.config || null,
            })),
          });
        }
      }

      // 5. Sync Relational StudioConditionRules Table
      if (Array.isArray(rules)) {
        await (prisma as any).studioConditionRule.deleteMany({ where: { artworkId: id } });
        if (rules.length > 0) {
          await (prisma as any).studioConditionRule.createMany({
            data: rules.map((r: any) => ({
              artworkId: id,
              sourceFieldId: r.sourceFieldId,
              operator: r.operator || "EQUALS",
              targetValue: r.targetValue || "",
              action: r.action || "SHOW_LAYER",
              targetId: r.targetId,
            })),
          });
        }
      }
    } else {
      // Create new Artwork Record
      artwork = await studioModel.create({
        data: {
          title: title.trim(),
          category: category || "Best Friends",
          niche: niche || "Quotes",
          widthPx: widthPx || 1000,
          heightPx: heightPx || 1000,
          bgUrl: bgUrl || null,
          thumbnailUrl: thumbnailUrl || null,
          enableScreenField: screenFieldConfig?.enableScreenField ?? false,
          screenCustomerLabel: screenFieldConfig?.customerLabel || "Number Of Grandkids",
          screenDisplayMode: screenFieldConfig?.displayViewMode || "BUTTON",
          screens: screensJson,
          screenFieldConfig: screenFieldConfigJson,
          createdByName: uploaderName,
          createdByAvatar: uploaderAvatar,
        },
      });

      const newId = artwork.id;

      if (Array.isArray(screens) && screens.length > 0) {
        await (prisma as any).studioScreen.createMany({
          data: screens.map((s: any, idx: number) => ({
            artworkId: newId,
            name: s.name || `Screen ${idx + 1}`,
            bgUrl: s.bgUrl || null,
            bgColor: s.bgColor || "#ffffff",
            iconUrl: s.iconUrl || null,
            sortOrder: s.sortOrder !== undefined ? s.sortOrder : idx,
          })),
        });
      }

      if (Array.isArray(layers) && layers.length > 0) {
        await (prisma as any).studioLayer.createMany({
          data: layers.map((l: any, idx: number) => ({
            artworkId: newId,
            name: l.name || `Layer ${idx + 1}`,
            layerType: l.layerType || "ASSET",
            zIndex: l.zIndex !== undefined ? l.zIndex : idx,
            posX: l.posX || 0,
            posY: l.posY || 0,
            width: l.width || 200,
            height: l.height || 200,
            rotation: l.rotation || 0,
            scaleX: l.scaleX || 1,
            scaleY: l.scaleY || 1,
            isVisible: l.isVisible !== undefined ? l.isVisible : true,
            isLocked: l.isLocked !== undefined ? l.isLocked : false,
            properties: typeof l.properties === "object" ? JSON.stringify(l.properties) : l.properties || null,
            linkedFieldId: l.linkedFieldId || null,
          })),
        });
      }

      if (Array.isArray(fields) && fields.length > 0) {
        await (prisma as any).studioField.createMany({
          data: fields.map((f: any, idx: number) => ({
            artworkId: newId,
            label: f.label || `Field ${idx + 1}`,
            fieldType: f.fieldType || "TEXT",
            sortOrder: f.sortOrder !== undefined ? f.sortOrder : idx,
            isRequired: f.isRequired !== undefined ? f.isRequired : false,
            config: typeof f.config === "object" ? JSON.stringify(f.config) : f.config || null,
          })),
        });
      }

      if (Array.isArray(rules) && rules.length > 0) {
        await (prisma as any).studioConditionRule.createMany({
          data: rules.map((r: any) => ({
            artworkId: newId,
            sourceFieldId: r.sourceFieldId,
            operator: r.operator || "EQUALS",
            targetValue: r.targetValue || "",
            action: r.action || "SHOW_LAYER",
            targetId: r.targetId,
          })),
        });
      }
    }

    // Fetch full updated artwork with normalized relations
    const fullArtwork = await studioModel.findUnique({
      where: { id: artwork.id },
      include: {
        studioScreens: { orderBy: { sortOrder: "asc" } },
        layers: { orderBy: { zIndex: "asc" } },
        fields: { orderBy: { sortOrder: "asc" } },
        rules: true,
      },
    });

    // Sync to Master Artwork Listing Table (for /app/artworks gallery)
    const masterArtworkModel = (prisma as any).artwork;
    if (masterArtworkModel) {
      const existingMaster = await masterArtworkModel.findUnique({ where: { id: artwork.id } });
      const masterData = {
        title: title.trim(),
        category: category || "Best Friends",
        niche: niche || "Quotes",
        widthPx: widthPx || 1000,
        heightPx: heightPx || 1000,
        thumbnailUrl: thumbnailUrl || bgUrl || null,
        previewUrl: bgUrl || thumbnailUrl || null,
        fieldCount: Array.isArray(fields) ? fields.length : 0,
        optionCount: Array.isArray(screens) ? screens.length : 1,
        createdBy: uploaderName,
        createdByName: uploaderName,
        createdByAvatar: uploaderAvatar,
      };

      if (existingMaster) {
        await masterArtworkModel.update({ where: { id: artwork.id }, data: masterData });
      } else {
        await masterArtworkModel.create({ data: { id: artwork.id, ...masterData } });
      }
    }

    return json({ success: true, artwork: fullArtwork });
  } catch (error: any) {
    console.error("API Studio POST Error:", error);
    return json({ error: error.message || "Failed to save artwork" }, { status: 500 });
  }
}
