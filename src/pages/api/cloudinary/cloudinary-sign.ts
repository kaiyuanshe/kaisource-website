import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'node:crypto';
import cloudinary from '@/server/cloudinary';
import { requireMediaActor } from '@/server/media-auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = await requireMediaActor(req, res);
  if (!auth) return;
  const parameters = {
    timestamp: Math.floor(Date.now() / 1000),
    public_id: `${auth.root}/users/${auth.actor.uid}/${randomUUID()}`,
    overwrite: false,
    allowed_formats: 'jpg,jpeg,png,gif,webp,avif',
  };
  const signature = cloudinary.utils.api_sign_request(parameters, process.env.CLOUDINARY_API_SECRET!);
  res.status(200).json({
    signature, ...parameters,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY || process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  });
}
