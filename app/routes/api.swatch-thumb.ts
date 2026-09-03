import fs from "fs";
import path from "path";
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { getTeamUserId } from "../services/auth.server";
import { generateTrimmedSquarePng } from "../services/thumbnail.server";
import { getFromR2, uploadToR2 } from "../services/r2.server";

function isAllowedImageUrl(url: string, origin: string): boolean {
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("/uploads/") || url.startsWith("/api/assets/")) return true;
  try {
    const parsed = new URL(url, origin);
    if (parsed.origin === origin) return true;
    const r2 = (process.env.R2_PUBLIC_DOMAIN || "").trim();
    if (r2) {
      const host = new URL(r2).host;
      if (parsed.host === host) return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function loadImageBuffer(url: string, origin: string): Promise<Buffer | null> {
  if (url.startsWith("data:image/")) {
    const comma = url.indexOf(",");
    if (comma < 0) return null;
    return Buffer.from(url.slice(comma + 1), "base64");
  }

  let pathname = url;
  try {
    const parsed = new URL(url, origin);
    pathname = parsed.pathname;
  } catch {
    pathname = url;
  }

  if (pathname.startsWith("/uploads/")) {
    const filePath = path.join(process.cwd(), "public", pathname);
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
  }

  if (pathname.startsWith("/api/assets/")) {
    const key = decodeURIComponent(pathname.slice("/api/assets/".length));
    const file = await getFromR2(key);
    if (file) return file.body;
  }

  if (pathname.startsWith("/uploads/")) {
    const key = pathname.slice("/uploads/".length);
    const file = await getFromR2(key);
    if (file) return file.body;
  }

  try {
    const res = await fetch(url.startsWith("http") ? url : `${origin}${pathname}`);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const userId = await getTeamUserId(request);
  if (!userId) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const url = String(body?.url || "");
    const size = Math.max(64, Math.min(512, Number(body?.size) || 256));
    const origin = new URL(request.url).origin;

    if (!isAllowedImageUrl(url, origin)) {
      return json({ error: "Invalid image url" }, { status: 400 });
    }

    const source = await loadImageBuffer(url, origin);
    if (!source) {
      return json({ error: "Could not load image" }, { status: 404 });
    }

    const png = await generateTrimmedSquarePng(source, size);
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const uploaded = await uploadToR2({
      key: `cliparts/swatches/${stamp}-${rand}.png`,
      body: png,
      contentType: "image/png",
    });

    return json({ success: true, url: uploaded.url });
  } catch (error: any) {
    console.error("swatch-thumb failed:", error);
    return json({ error: error.message || "Failed to generate thumbnail" }, { status: 500 });
  }
}
