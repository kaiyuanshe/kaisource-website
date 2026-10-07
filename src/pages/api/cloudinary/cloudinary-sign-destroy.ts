import type { NextApiRequest, NextApiResponse } from 'next';
import cloudinary from '@/server/cloudinary';
import { requireMediaActor } from '@/server/media-auth';
import { canMutateMedia } from '@/server/media-policy.mjs';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const auth = await requireMediaActor(req, res);
  if (!auth) return;
  const { publicId } = req.body || {};
  const timestamp = Math.floor(Date.now() / 1000);
  if (!canMutateMedia(auth.actor, auth.root, publicId)) {
    return res.status(403).json({ error: 'You cannot delete this image' });
  }

  const signature = cloudinary.utils.api_sign_request(
    { invalidate: true, public_id: publicId, timestamp }, process.env.CLOUDINARY_API_SECRET!
  );

  return res.status(200).json({
    signature,
    timestamp,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY || process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  });
}
