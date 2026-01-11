import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db';
import { feeds } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { validateAdminSecret } from '../../lib/security';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate admin secret
  if (!process.env.ADMIN_SECRET) {
    return res.status(503).json({ error: 'Admin secret is not configured on server.' });
  }

  if (!validateAdminSecret(new Headers(req.headers as any))) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin Secret' });
  }

  try {
    const action = req.query.action as string;

    // Add or Update Feed
    if (action === 'add' || action === 'update') {
      const { id, url, category, isSub, customTitle, allowedMediaHosts } = req.body;
      
      if (!id || !url) {
        return res.status(400).json({ error: 'Missing ID or URL' });
      }

      // Check if feed exists
      const existing = await db.select().from(feeds).where(eq(feeds.id, id)).limit(1);

      if (existing.length > 0) {
        // Update existing feed
        await db.update(feeds)
          .set({
            url,
            category,
            isSub: !!isSub,
            customTitle: customTitle || '',
            allowedMediaHosts: allowedMediaHosts ? JSON.stringify(allowedMediaHosts) : null,
            updatedAt: new Date(),
          } as any)
          .where(eq(feeds.id, id));
      } else {
        // Insert new feed
        await db.insert(feeds).values({
          id,
          url,
          category,
          isSub: !!isSub,
          customTitle: customTitle || '',
          allowedMediaHosts: allowedMediaHosts ? JSON.stringify(allowedMediaHosts) : null,
          displayOrder: 0,
        } as any);
      }

      return res.status(200).json({ success: true });
    }

    // Delete Feed
    if (action === 'delete') {
      const { id } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'Missing ID' });
      }

      const result = await db.delete(feeds).where(eq(feeds.id, id));
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: `Feed with id '${id}' not found.` });
      }

      return res.status(200).json({ success: true });
    }

    // Reorder Feeds
    if (action === 'reorder') {
      const { ids } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Invalid input: ids must be a non-empty array' });
      }

      const uniqueIds = Array.from(new Set(ids));
      if (uniqueIds.length !== ids.length) {
        return res.status(400).json({ error: 'Duplicate feed ids are not allowed' });
      }

      const existingIds = await db
        .select({ id: feeds.id })
        .from(feeds)
        .where(inArray(feeds.id, uniqueIds));

      if (existingIds.length !== uniqueIds.length) {
        return res.status(404).json({ error: 'One or more feeds not found' });
      }

      await db.transaction(async (tx) => {
        for (let i = 0; i < uniqueIds.length; i++) {
          await tx.update(feeds)
            .set({ displayOrder: i, updatedAt: new Date() } as any)
            .where(eq(feeds.id, uniqueIds[i]));
        }
      });
 
      return res.status(200).json({ success: true });
    }


    return res.status(400).json({ error: 'Invalid action parameter' });
  } catch (error: any) {
    console.error('[API Error]', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
