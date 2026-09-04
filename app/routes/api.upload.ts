import { json, type ActionFunctionArgs } from "@remix-run/node";
import { uploadToR2 } from "../services/r2.server";
import { getTeamUserId } from "../services/auth.server";
import { generateThumbnail } from "../services/thumbnail.server";
import prisma from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Lấy thông tin user hiện tại đang thao tác
  let userId = await getTeamUserId(request);
  let currentUser = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;

  if (!currentUser) {
    currentUser = await prisma.user.findFirst({ where: { email: "admin@bridgecustom.com" } });
  }

  const uploaderEmail = currentUser?.email || "admin@bridgecustom.com";
  const uploaderName = currentUser?.name || "Super Admin";
  const uploaderAvatar = currentUser?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "general";
    const skipLibrary = String(formData.get("skipLibrary") || "") === "1";
    const requestedKey = String(formData.get("key") || "").replace(/^\/+/, "");
    const safeRequestedKey =
      requestedKey &&
      !requestedKey.includes("..") &&
      requestedKey.startsWith("cliparts/_generated/") &&
      /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(requestedKey)
        ? requestedKey
        : "";

    if (!file || typeof file === "string") {
      return json({ error: "No file uploaded" }, { status: 400 });
    }

    // Giới hạn dung lượng (tối đa 25MB)
    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return json({ error: "File size exceeds 25MB limit" }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "bin";
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const uniqueKey = safeRequestedKey || `${folder}/${timestamp}-${randomSuffix}.${fileExtension}`;

    // Upload file gốc lên Cloudflare R2 / Local
    const result = await uploadToR2({
      key: uniqueKey,
      body: fileBuffer,
      contentType: file.type || "application/octet-stream",
    });

    // Phân loại Category
    let category = "IMAGE";
    if (
      file.type.startsWith("font/") ||
      ["ttf", "otf", "woff", "woff2"].includes(fileExtension)
    ) {
      category = "FONT";
    } else if (
      file.type.includes("pdf") ||
      ["pdf", "doc", "docx", "csv", "json", "ai", "eps", "txt"].includes(fileExtension)
    ) {
      category = "DOCUMENT";
    }

    // Tự động tạo ảnh thu nhỏ (Thumbnail WebP) nếu là file ảnh đưa vào thư viện media
    let thumbnailUrl: string | null = null;
    let thumbnailKey: string | null = null;

    if (!skipLibrary && (category === "IMAGE" || file.type.startsWith("image/"))) {
      const thumb = await generateThumbnail(fileBuffer);
      if (thumb) {
        const thumbKey = `${folder}/thumbnails/${timestamp}-${randomSuffix}_thumb.${thumb.extension}`;
        const thumbResult = await uploadToR2({
          key: thumbKey,
          body: thumb.buffer,
          contentType: thumb.contentType,
        });
        thumbnailUrl = thumbResult.url;
        thumbnailKey = thumbResult.key;
        console.log(`🖼️ Generated & uploaded optimized thumbnail: ${thumbnailUrl}`);
      }
    }

    // Tự động tạo bản ghi lưu vào cơ sở dữ liệu MediaFile với cơ chế an toàn 100%
    const mediaModel = (prisma as any).mediaFile;
    let fileRecord = null;
    if (!skipLibrary && mediaModel) {
      const createData: any = {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || "application/octet-stream",
        category,
        url: result.url,
        key: result.key,
        folder,
        uploadedBy: uploaderEmail,
        createdByName: uploaderName,
        createdByAvatar: uploaderAvatar,
      };

      if (thumbnailUrl) createData.thumbnailUrl = thumbnailUrl;
      if (thumbnailKey) createData.thumbnailKey = thumbnailKey;

      try {
        fileRecord = await mediaModel.create({ data: createData });
      } catch (dbErr: any) {
        console.warn("⚠️ Prisma insert retry without thumbnail fields:", dbErr.message);
        delete createData.thumbnailUrl;
        delete createData.thumbnailKey;
        fileRecord = await mediaModel.create({ data: createData });
      }
    }

    return json({
      success: true,
      url: result.url,
      thumbnailUrl: thumbnailUrl || result.url,
      key: result.key,
      fileName: file.name,
      fileRecord,
    });
  } catch (error: any) {
    console.error("❌ Error uploading file in api.upload.ts:", error);
    return json({ error: error.message || "Failed to upload file" }, { status: 500 });
  }
}
