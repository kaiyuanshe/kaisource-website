import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import { authorizeMediaRequest, mediaRoot } from "./media-policy.mjs";

export interface MediaActor { uid: string; permissions: string[] }

export async function requireMediaActor(req: NextApiRequest, res: NextApiResponse): Promise<{ actor: MediaActor; root: string } | null> {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  try {
    const result = await authorizeMediaRequest(req, request => getToken({
      req: request, secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NODE_ENV === "production",
    }));
    if (!result.actor) {
      res.status(result.status).json({ error: result.error });
      return null;
    }
    const root = mediaRoot();
    if (!root || !process.env.CLOUDINARY_API_SECRET ||
        !(process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) ||
        !(process.env.CLOUDINARY_API_KEY || process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY)) {
      res.status(503).json({ error: "Image storage is not configured" });
      return null;
    }
    return { actor: result.actor, root };
  } catch {
    res.status(503).json({ error: "Account verification is unavailable" });
    return null;
  }
}
