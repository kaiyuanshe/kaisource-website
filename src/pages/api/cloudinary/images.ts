import type { NextApiRequest, NextApiResponse } from 'next';
import cloudinary from '@/server/cloudinary';
import { requireMediaActor } from '@/server/media-auth';
import { scopedFolder, mediaSearchExpression } from '@/server/media-policy.mjs';

export interface CloudinaryImage {
  public_id: string;
  secure_url: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  created_at: string;
  folder?: string;
  tags?: string[];
  context?: Record<string, string>;
}

export interface ImageListResponse {
  images: CloudinaryImage[];
  next_cursor?: string;
  total_count: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ImageListResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = await requireMediaActor(req, res);
  if (!auth) return;

  try {
    const {
      folder,
      max_results = '20',
      next_cursor,
      search,
    } = req.query;

    if ((folder !== undefined && typeof folder !== 'string') ||
        (search !== undefined && (typeof search !== 'string' || search.length > 80 || !/^[\p{L}\p{N} _.-]*$/u.test(search))) ||
        (next_cursor !== undefined && (typeof next_cursor !== 'string' || next_cursor.length > 1024))) {
      return res.status(400).json({ error: 'Invalid search parameters' });
    }
    const scoped = scopedFolder(auth.actor, auth.root, folder);
    if (!scoped) return res.status(403).json({ error: 'You cannot view this folder' });
    const limit = typeof max_results === 'string' && /^\d+$/.test(max_results) ? Number(max_results) : 0;
    if (limit < 1 || limit > 100) return res.status(400).json({ error: 'Page size must be between 1 and 100' });
    const expression = mediaSearchExpression(scoped, search);

    const result = await cloudinary.search.expression(expression)
      .sort_by('created_at', 'desc')
      .max_results(limit)
      .with_field('context')
      .with_field('tags')
      .next_cursor(next_cursor as string)
      .execute();

    const response: ImageListResponse = {
      images: (result.resources || []).filter((image: CloudinaryImage) => image.public_id?.startsWith(`${scoped}/`)).map((image: CloudinaryImage) => ({
        ...image, folder: image.public_id.slice(0, image.public_id.lastIndexOf('/')),
      })),
      total_count: result.total_count || 0,
    };

    if (result.next_cursor) {
      response.next_cursor = result.next_cursor;
    }

    res.status(200).json(response);
  } catch (error) {
    res.status(502).json({ error: 'Image storage is temporarily unavailable' });
  }
}
