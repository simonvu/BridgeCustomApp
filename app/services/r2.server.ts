import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

/**
 * Lấy Client kết nối R2 động theo chuẩn Cloudflare R2 S3 API (BẮT BUỘC forcePathStyle: true)
 */
function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    accessKeyId === "your_r2_access_key_id"
  ) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });
}

/**
 * Upload file lên Cloudflare R2 (hoặc lưu local fallback nếu lỗi hoặc chưa cấu hình R2)
 */
export async function uploadToR2({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Buffer | Uint8Array | Blob | string;
  contentType: string;
}): Promise<{ url: string; key: string }> {
  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME || "assets";
  const rawPublicDomain = (process.env.R2_PUBLIC_DOMAIN || "").trim().replace(/\/$/, "");
  const isDefaultDevDomain = rawPublicDomain.includes(".r2.dev") || rawPublicDomain.includes("yourdomain.com");

  if (client) {
    try {
      let bufferData: Buffer;
      if (Buffer.isBuffer(body)) {
        bufferData = body;
      } else if (typeof body === "string") {
        bufferData = Buffer.from(body, "utf-8");
      } else {
        bufferData = Buffer.from(await (body as Blob).arrayBuffer());
      }

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: bufferData,
        ContentType: contentType,
      });

      console.log(`🚀 Sending file upload request directly to Cloudflare R2 bucket "${bucketName}" (Key: ${key})...`);
      await client.send(command);

      const url = rawPublicDomain && !isDefaultDevDomain
        ? `${rawPublicDomain}/${key}`
        : `/api/assets/${key}`;

      console.log(`🎉 SUCCESS: Uploaded directly to Cloudflare R2 bucket "${bucketName}"! Public URL: ${url}`);
      return { url, key };
    } catch (error: any) {
      console.error("❌ Cloudflare R2 upload error DETAILED:", error.name, error.message);
    }
  }

  // Fallback: Lưu vào thư mục public/uploads/ cục bộ nếu chưa cấu hình R2
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const safeKeyName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}_${key.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const filePath = path.join(uploadsDir, safeKeyName);

  let bufferData: Buffer;
  if (Buffer.isBuffer(body)) {
    bufferData = body;
  } else if (typeof body === "string") {
    bufferData = Buffer.from(body, "utf-8");
  } else {
    bufferData = Buffer.from(await (body as Blob).arrayBuffer());
  }

  fs.writeFileSync(filePath, bufferData);

  const localUrl = `/uploads/${safeKeyName}`;
  console.log(`📁 Local fallback saved: ${localUrl}`);
  return { url: localUrl, key: safeKeyName };
}

/**
 * Đọc file trực tiếp từ Cloudflare R2 Bucket
 */
export async function getFromR2(key: string): Promise<{ body: Buffer; contentType?: string } | null> {
  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME || "assets";

  if (client) {
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const response = await client.send(command);
      if (response.Body) {
        const byteArray = await response.Body.transformToByteArray();
        return {
          body: Buffer.from(byteArray),
          contentType: response.ContentType,
        };
      }
    } catch (error) {
      console.error("❌ Error fetching file from Cloudflare R2, checking local fallback:", error);
    }
  }

  // Fallback: Read from local public/uploads directory if file was saved locally
  try {
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (fs.existsSync(uploadsDir)) {
      const safeKeyName = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const files = fs.readdirSync(uploadsDir);
      const matchedFile = files.find(
        (f) => f.endsWith(safeKeyName) || f.includes(safeKeyName) || f.endsWith(key) || f === key
      );
      if (matchedFile) {
        const filePath = path.join(uploadsDir, matchedFile);
        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          const ext = matchedFile.split(".").pop()?.toLowerCase() || "";
          const contentType =
            ext === "jpg" || ext === "jpeg"
              ? "image/jpeg"
              : ext === "png"
              ? "image/png"
              : ext === "webp"
              ? "image/webp"
              : "application/octet-stream";
          return { body: buffer, contentType };
        }
      }
    }
  } catch (err: any) {
    console.error("⚠️ Error reading local fallback asset:", err.message);
  }

  return null;
}

/**
 * Tạo Presigned URL upload trực tiếp cho Storefront
 */
export async function getPresignedUploadUrl({
  key,
  contentType,
  expiresIn = 3600,
}: {
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<string | null> {
  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME || "assets";

  if (!client) return null;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(client, command, { expiresIn });
}

/**
 * Xóa file khỏi Cloudflare R2
 */
export async function deleteFromR2(key: string): Promise<boolean> {
  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME || "assets";

  if (!client) return false;

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    await client.send(command);
    return true;
  } catch (error) {
    console.error("❌ Error deleting file from Cloudflare R2:", error);
    return false;
  }
}
