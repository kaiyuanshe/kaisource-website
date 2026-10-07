import type { NextApiRequest, NextApiResponse } from "next";
import snapshot from "@/data/preview-content.json";
import { resolvePreviewResponse } from "@/lib/preview-content.mjs";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NEXT_PUBLIC_SITE_PREVIEW_MODE !== "true")
    return res.status(404).json({ code: 404, message: "Not found" });
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res
      .status(405)
      .json({ code: 405, message: "This preview is read-only." });
  }
  const path = Array.isArray(req.query.path) ? req.query.path : [];
  const query = Object.fromEntries(
    Object.entries(req.query)
      .filter(([key]) => key !== "path")
      .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const result = resolvePreviewResponse(snapshot, path, query);
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600");
  return res.status(result.code).json(result);
}
