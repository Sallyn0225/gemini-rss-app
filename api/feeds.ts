import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../db/index.js';
import { feeds, NewFeed } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { validateAdminSecret } from '../lib/security.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const action = req.query.action as string | undefined;

    // ============================================
    // GET: List feeds (public or admin)
    // ============================================
    if (req.method === 'GET') {
      // Admin list (requires secret via query param check - POST preferred for admin)
      if (action === 'admin') {
        if (!validateAdminSecret(req.headers)) {
          return res.status(401).json({ error: 'Unauthorized: Invalid Admin Secret' });
        }
        const allFeeds = await db.select().from(feeds).orderBy(feeds.displayOrder);
        return res.status(200).json(allFeeds);
      }

      // Public list (hides URL)
      const allFeeds = await db.select().from(feeds).orderBy(feeds.displayOrder);
      
      const safeFeeds = allFeeds.map(f => ({
        id: f.id,
        category: f.category,
        isSub: f.isSub || false,
        customTitle: f.customTitle || '',
        canProxyImages: true,
      }));

      return res.status(200).json(safeFeeds);
    }

    // ============================================
    // POST: Manage feeds (requires admin secret)
    // ============================================
    if (req.method === 'POST') {
      // Validate admin secret for all POST operations
      if (!process.env.ADMIN_SECRET) {
        return res.status(503).json({ error: 'Admin secret is not configured on server.' });
      }

      if (!validateAdminSecret(req.headers)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Admin Secret' });
      }

      // Admin list via POST (more secure)
      if (action === 'admin') {
        const allFeeds = await db.select().from(feeds).orderBy(feeds.displayOrder);
        return res.status(200).json(allFeeds);
      }

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

        // NOTE: Drizzle neon-http driver does NOT support transactions.
        // We'll use sequential updates with error handling.
        for (let i = 0; i < uniqueIds.length; i++) {
          await db.update(feeds)
            .set({ displayOrder: i, updatedAt: new Date() } as any)
            .where(eq(feeds.id, uniqueIds[i]));
        }
 
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Invalid action parameter' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (res.headersSent) {
      console.error('[Server Error] [API Error] Headers already sent:', error);
      return;
    }
    console.error('[Server Error] [API Error]', error);
    return res.status(500).json({ error: 'Internal server error', details: errorMessage });
  }
}
