import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db';
import { feeds } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { validateAdminSecret } from '../../lib/security';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET /api/feeds/list - Public endpoint (hides URL)
    if (req.method === 'GET') {
      const allFeeds = await db.select().from(feeds).orderBy(feeds.displayOrder);
      
      const safeFeeds = allFeeds.map(f => ({
        id: f.id,
        category: f.category,
        isSub: f.isSub || false,
        customTitle: f.customTitle || '',
        canProxyImages: true, // Can be calculated based on allowedMediaHosts
      }));

      return res.status(200).json(safeFeeds);
    }

    // POST /api/feeds/list/admin - Admin endpoint (returns full feed data including URLs)
    // Supports both direct URL check and query param for reliability
    if (req.method === 'POST' && (req.url?.includes('/admin') || req.query.admin === 'true')) {
      if (!validateAdminSecret(req.headers)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Admin Secret' });
      }

      const allFeeds = await db.select().from(feeds).orderBy(feeds.displayOrder);
      return res.status(200).json(allFeeds);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[API Error]', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
