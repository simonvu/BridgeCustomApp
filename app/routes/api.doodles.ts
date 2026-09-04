import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { rethrowHttpResponse } from "../services/rbac.server";
import { requireTeamPage } from "../services/team.server";
import { uploadToR2 } from "../services/r2.server";

// Auto-parse filename to letter character preserving uppercase, lowercase, and digits
export function parseFilenameToChar(fileName: string): string {
  if (!fileName) return "";
  let cleanName = fileName.replace(/\.[^/.]+$/, "").trim();
  
  // Single letter e.g. "A.png" -> "A", "a.png" -> "a", "A_1.png" -> "A", "a_1.png" -> "a"
  const letterMatch = cleanName.match(/^([a-zA-Z])(?:[_-]|\b)/);
  if (letterMatch) {
    return letterMatch[1]; // Preserve case! 'A' or 'a'
  }

  // Pure number e.g. "1.png", "10.png", "68.png"
  const numMatch = cleanName.match(/^0*([0-9]+)(?:[_-]|\b)/);
  if (numMatch) {
    return numMatch[1];
  }

  // Fallback: take first alpha-numeric character
  const fallbackMatch = cleanName.match(/([a-zA-Z0-9])/);
  return fallbackMatch ? fallbackMatch[1] : cleanName.charAt(0);
}

// Extract 1 to 2 digit index from filename for rules 1-68
export function getFileNumberIndex(fileName: string): number | null {
  if (!fileName) return null;
  const cleanName = fileName.replace(/\.[^/.]+$/, "").trim();
  const match = cleanName.match(/(?:^|[^0-9])([0-9]{1,2})(?:[^0-9]|$)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 1 && num <= 68) return num;
  }
  return null;
}

// GET /api/doodles - List all Doodle Packs with Styles & Letters
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    await requireTeamPage(request, "doodles:packs:read");
    const url = new URL(request.url);
    const packId = url.searchParams.get("packId");

    if (packId) {
      const pack = await prisma.doodlePack.findUnique({
        where: { id: packId },
        include: {
          styles: {
            orderBy: { sortOrder: "asc" },
            include: {
              letters: true,
            },
          },
        },
      });
      return json({ pack });
    }

    const packs = await prisma.doodlePack.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        styles: {
          orderBy: { sortOrder: "asc" },
          include: {
            letters: true,
          },
        },
      },
    });

    return json({ packs });
  } catch (err: any) {
    rethrowHttpResponse(err);
    console.error("Error fetching doodle packs:", err);
    return json({ error: err.message || "Failed to load doodle packs" }, { status: 500 });
  }
}

// POST /api/doodles - Create Pack, Create Style, Bulk Upload Letters, Delete
export async function action({ request }: ActionFunctionArgs) {
  try {
    const contentType = request.headers.get("Content-Type") || "";

    // Handle Multipart Form Data (Bulk PNG File Upload)
    if (contentType.includes("multipart/form-data")) {
      await requireTeamPage(request, "doodles:packs:update");
      const formData = await request.formData();
      const actionType = formData.get("_action") as string;

      if (actionType === "BULK_UPLOAD_LETTERS") {
        const styleId = formData.get("styleId") as string;
        const autoNamingRule = (formData.get("autoNamingRule") as string) || "AUTO_CASE";

        if (!styleId) {
          return json({ error: "Missing styleId" }, { status: 400 });
        }

        const files = formData.getAll("files") as File[];
        if (!files || files.length === 0) {
          return json({ error: "No files uploaded" }, { status: 400 });
        }

        // Auto-detect if batch consists of numbered files e.g. 1.png, 2.png...
        const numberedFilesCount = files.filter(
          (f) => f && typeof f !== "string" && /^0*([1-9]|[1-6][0-9])\.[a-zA-Z]+$/.test(f.name)
        ).length;
        const isNumberedBatch = numberedFilesCount >= 3;
        const effectiveRule = autoNamingRule === "AUTO_CASE" && isNumberedBatch ? "NUMBER" : autoNamingRule;

        const upsertedLetters: any[] = [];

        for (const file of files) {
          if (!file || typeof file === "string" || file.size === 0) continue;

          const numberIndex = getFileNumberIndex(file.name);
          let char = "";

          const useNumberRule =
            autoNamingRule === "NUMBER" ||
            (autoNamingRule === "AUTO_CASE" && numberIndex !== null) ||
            numberIndex !== null;

          if (useNumberRule && numberIndex !== null) {
            const num = numberIndex;
            if (num >= 1 && num <= 26) {
              char = String.fromCharCode(64 + num); // 1->A ... 26->Z
            } else if (num >= 28 && num <= 53) {
              char = String.fromCharCode(97 + (num - 28)); // 28->a ... 53->z
            } else if (num === 55) {
              char = "#";
            } else if (num === 56) {
              char = "@";
            } else if (num === 57) {
              char = "?";
            } else if (num === 58) {
              char = "&";
            } else if (num >= 59 && num <= 68) {
              char = String(num - 59); // 59->0 ... 68->9
            }
          }

          if (!char) {
            char = parseFilenameToChar(file.name);
          }

          if (autoNamingRule === "UPPERCASE") {
            char = char.toUpperCase();
          } else if (autoNamingRule === "LOWERCASE") {
            if (/^[a-zA-Z]$/.test(char)) char = char.toLowerCase();
          }

          if (!char) char = "A";

          // Upload image buffer to R2 or Local Storage
          const buffer = Buffer.from(await file.arrayBuffer());
          const uploadRes = await uploadToR2({
            key: `doodles/${styleId}_${char}_${Date.now()}_${file.name}`,
            body: buffer,
            contentType: file.type || "image/png",
          });

          const imageUrl = uploadRes.url;

          // Upsert letter in DB for this style
          const letter = await prisma.doodleLetter.upsert({
            where: {
              styleId_char: {
                styleId,
                char,
              },
            },
            update: {
              imageUrl,
            },
            create: {
              styleId,
              char,
              imageUrl,
            },
          });

          upsertedLetters.push(letter);
        }

        // Update pack thumbnail if not set
        const style = await prisma.doodleStyle.findUnique({
          where: { id: styleId },
          include: { pack: true },
        });

        if (style && style.pack && !style.pack.thumbnailUrl && upsertedLetters.length > 0) {
          await prisma.doodlePack.update({
            where: { id: style.pack.id },
            data: { thumbnailUrl: upsertedLetters[0].imageUrl },
          });
        }

        return json({ success: true, count: upsertedLetters.length, letters: upsertedLetters });
      }
    }

    // Handle JSON Payload Action Requests
    const body = await request.json();
    const actionType = body._action || body.action;
    const perm =
      actionType === "DELETE_PACK" || actionType === "DELETE_STYLE"
        ? "doodles:packs:delete"
        : actionType === "CREATE_PACK" || actionType === "CREATE_STYLE"
          ? "doodles:packs:create"
          : "doodles:packs:update";
    const { user } = await requireTeamPage(request, perm);
    const authorName = user?.name || "Super Admin";

    if (actionType === "CLEAR_STYLE_LETTERS") {
      const styleId = body.styleId;
      if (!styleId) return json({ error: "styleId is required" }, { status: 400 });

      await prisma.doodleLetter.deleteMany({ where: { styleId } });
      return json({ success: true, styleId });
    }

    if (actionType === "CREATE_PACK") {
      const name = (body.name || "").trim();
      if (!name) {
        return json({ error: "Pack name is required" }, { status: 400 });
      }

      const code = body.code
        ? body.code.toLowerCase().replace(/[^a-z0-9_]/g, "_")
        : name.toLowerCase().replace(/[^a-z0-9_]/g, "_") + `_${Date.now()}`;

      const pack = await prisma.doodlePack.create({
        data: {
          name,
          code,
          description: body.description || "",
          thumbnailUrl: body.thumbnailUrl || null,
          createdByName: authorName,
        },
      });

      // Default Create Style 1 for new pack
      const defaultStyle = await prisma.doodleStyle.create({
        data: {
          packId: pack.id,
          name: "Style 1 (Default)",
          sortOrder: 0,
        },
      });

      return json({ success: true, pack: { ...pack, styles: [defaultStyle] } });
    }

    if (actionType === "CREATE_STYLE") {
      const packId = body.packId;
      const name = (body.name || "").trim();
      if (!packId || !name) {
        return json({ error: "packId and style name are required" }, { status: 400 });
      }

      const existingStylesCount = await prisma.doodleStyle.count({ where: { packId } });

      const style = await prisma.doodleStyle.create({
        data: {
          packId,
          name,
          sortOrder: existingStylesCount,
        },
      });

      return json({ success: true, style });
    }

    if (actionType === "DELETE_PACK") {
      const packId = body.packId;
      if (!packId) return json({ error: "packId is required" }, { status: 400 });

      await prisma.doodlePack.delete({ where: { id: packId } });
      return json({ success: true, packId });
    }

    if (actionType === "DELETE_STYLE") {
      const styleId = body.styleId;
      if (!styleId) return json({ error: "styleId is required" }, { status: 400 });

      await prisma.doodleStyle.delete({ where: { id: styleId } });
      return json({ success: true, styleId });
    }

    if (actionType === "UPDATE_LETTER") {
      const { styleId, char, imageUrl } = body;
      if (!styleId || !char || !imageUrl) {
        return json({ error: "Missing required letter parameters" }, { status: 400 });
      }

      const letter = await prisma.doodleLetter.upsert({
        where: {
          styleId_char: {
            styleId,
            char: char.toUpperCase(),
          },
        },
        update: { imageUrl },
        create: {
          styleId,
          char: char.toUpperCase(),
          imageUrl,
        },
      });

      return json({ success: true, letter });
    }

    return json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    rethrowHttpResponse(err);
    console.error("Error in /api/doodles action:", err);
    return json({ error: err.message || "Failed to process doodle action" }, { status: 500 });
  }
}
