import type { LoaderFunctionArgs } from "@remix-run/node";
import { getFromR2 } from "../services/r2.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const key = params["*"];
  if (!key) {
    return new Response("Not Found", { status: 404 });
  }

  const file = await getFromR2(key);
  if (!file) {
    return new Response("Not Found", { status: 404 });
  }

  const generated = key.includes("_generated/");
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType || "image/png",
      "Cache-Control": generated
        ? "public, max-age=60, must-revalidate"
        : "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
