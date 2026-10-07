import type { NextApiRequest, NextApiResponse } from 'next';
import cloudinary from '@/server/cloudinary';
import { requireMediaActor } from '@/server/media-auth';
import { canMutateMedia } from '@/server/media-policy.mjs';

interface UpdateImageRequest {
  public_id: string;
  tags?: string[];
  context?: Record<string, string>;
}

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

  try {
    const { public_id, tags, context }: UpdateImageRequest = req.body || {};

    if (!canMutateMedia(auth.actor, auth.root, public_id)) {
      return res.status(403).json({ error: 'You cannot edit this image' });
    }
    if ((tags !== undefined && (!Array.isArray(tags) || tags.length > 20 || tags.some(tag => typeof tag !== 'string' || tag.length > 64 || !/^[\p{L}\p{N} _.-]+$/u.test(tag)))) ||
        (context !== undefined && (!context || typeof context !== 'object' || Array.isArray(context) || Object.keys(context).length > 20 || Object.entries(context).some(([key, value]) => !/^[a-zA-Z0-9_-]{1,64}$/.test(key) || typeof value !== 'string' || value.length > 500)))) {
      return res.status(400).json({ error: 'Invalid image metadata' });
    }

    const updateOptions: any = {};

    if (tags) {
      updateOptions.tags = tags;
    }

    if (context) {
      updateOptions.context = context;
    }

    const result = await cloudinary.uploader.explicit(public_id, {
      type: 'upload',
      ...updateOptions,
    });

    res.status(200).json({ 
      success: true, 
      public_id: result.public_id,
      tags: result.tags,
      context: result.context 
    });
  } catch (error) {
    res.status(502).json({ error: 'Image storage is temporarily unavailable' });
  }
}
