import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { rethrowHttpResponse } from "../services/rbac.server";
import { requireAnyPage, requireTeamPage } from "../services/team.server";
import prisma from "../db.server";

// GET /api/folders - List all media folders
export async function loader({ request }: LoaderFunctionArgs) {
  await requireAnyPage(request, [
    "media:files:read",
    "artworks:items:read",
    "cliparts:items:read",
  ]);
  let foldersFromDb: any[] = [];
  try {
    foldersFromDb = await prisma.mediaFolder.findMany({
      orderBy: { label: "asc" },
    });
  } catch (err: any) {
    console.warn("MediaFolder query warning:", err.message);
  }

  let foldersFromMedia: any[] = [];
  try {
    const distinctMediaFolders = await prisma.mediaFile.findMany({
      select: { folder: true },
      distinct: ["folder"],
    });
    foldersFromMedia = distinctMediaFolders.map((f: any) => ({
      id: `media-${f.folder}`,
      name: f.folder,
      label: f.folder.charAt(0).toUpperCase() + f.folder.slice(1),
    }));
  } catch (err: any) {
    console.warn("MediaFile folder query warning:", err.message);
  }

  // Mặc định các folder chính của ứng dụng
  const defaultFolders = [
    { id: "def-1", name: "general", label: "General" },
    { id: "def-2", name: "artworks", label: "Artworks" },
    { id: "def-3", name: "cliparts", label: "Cliparts" },
    { id: "def-4", name: "fonts", label: "Fonts" },
    { id: "def-5", name: "mockups", label: "Mockups" },
    { id: "def-6", name: "avatars", label: "Avatars" },
  ];

  const mergedMap = new Map();
  defaultFolders.forEach((f) => mergedMap.set(f.name, f));
  foldersFromMedia.forEach((f: any) => {
    if (!mergedMap.has(f.name)) mergedMap.set(f.name, f);
  });
  foldersFromDb.forEach((f: any) => mergedMap.set(f.name, f));

  return json({ folders: Array.from(mergedMap.values()) });
}

// POST /api/folders - Create new folder
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { user: currentUser } = await requireTeamPage(request, "media:files:upload");

  const uploaderEmail = currentUser?.email || "admin@bridgecustom.com";
  const uploaderName = currentUser?.name || "Super Admin";
  const uploaderAvatar = currentUser?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";

  try {
    const body = await request.json();
    const folderLabel = (body.label || "").trim();

    if (!folderLabel) {
      return json({ error: "Folder name is required" }, { status: 400 });
    }

    const folderName = folderLabel.toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_");

    try {
      const existing = await prisma.mediaFolder.findFirst({
        where: { OR: [{ name: folderName }, { label: folderLabel }] },
      });

      if (existing) {
        return json({ success: true, folder: existing });
      }

      const newFolder = await prisma.mediaFolder.create({
        data: {
          name: folderName,
          label: folderLabel,
          createdBy: uploaderEmail,
          createdByName: uploaderName,
          createdByAvatar: uploaderAvatar,
        },
      });

      return json({ success: true, folder: newFolder });
    } catch (dbErr: any) {
      console.error("❌ DB Error creating MediaFolder:", dbErr);
      return json({ error: dbErr.message || "Database error creating folder" }, { status: 500 });
    }
  } catch (error: any) {
    rethrowHttpResponse(error);
    console.error("Error creating folder in api.folders.ts:", error);
    return json({ error: error.message || "Failed to create folder" }, { status: 500 });
  }
}
