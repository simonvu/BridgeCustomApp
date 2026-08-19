import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Khởi tạo Cloudflare R2 Client (Tương thích API S3)
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "bridge-custom-assets";
const PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN || "";

/**
 * Upload file lên Cloudflare R2
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
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body as any,
    ContentType: contentType,
  });

  await r2Client.send(command);

  const url = PUBLIC_DOMAIN ? `${PUBLIC_DOMAIN}/${key}` : key;
  return { url, key };
}

/**
 * Tạo URL tạm thời (Presigned URL) cho phép Storefront upload file trực tiếp lên R2 mà không qua App Server
 */
export async function getPresignedUploadUrl({
  key,
  contentType,
  expiresIn = 3600,
}: {
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Xóa file khỏi Cloudflare R2
 */
export async function deleteFromR2(key: string): Promise<boolean> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await r2Client.send(command);
    return true;
  } catch (error) {
    console.error("❌ Lỗi khi xóa file khỏi Cloudflare R2:", error);
    return false;
  }
}
