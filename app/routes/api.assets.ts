import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { GENERATED_MEDIA_WHERE_NOT } from "../utils/generatedMedia";

// GET /api/assets?page=1&limit=20&folder=ALL&category=ALL&search=...
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "20", 10)));
  const folder = url.searchParams.get("folder") || "ALL";
  const category = url.searchParams.get("category") || "ALL";
  const search = (url.searchParams.get("search") || "").trim();

  const where: any = { NOT: GENERATED_MEDIA_WHERE_NOT };

  if (folder !== "ALL") {
    where.folder = folder;
  }

  if (category !== "ALL") {
    where.category = category;
  }

  if (search) {
    where.OR = [
      { fileName: { contains: search } },
      { folder: { contains: search } },
      { altText: { contains: search } },
      { createdByName: { contains: search } },
    ];
  }

  const mediaModel = (prisma as any).mediaFile;
  if (!mediaModel) {
    return json({ files: [], pagination: { page: 1, limit, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false } });
  }

  try {
    const [files, total] = await Promise.all([
      mediaModel.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      mediaModel.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return json({
      files,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: any) {
    console.error("Error in api.assets.ts loader:", error);
    return json({ files: [], pagination: { page: 1, limit, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false } }, { status: 500 });
  }
}
