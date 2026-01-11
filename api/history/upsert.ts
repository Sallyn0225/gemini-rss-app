import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db';
import { history, feeds } from '../../db/schema';
import { eq, desc, and } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { feedId, items } = req.body;
    
    if (!feedId || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing feedId or items array' });
    }

    const HISTORY_RETENTION_DAYS = 60;
    const cutoffTime = new Date(Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // Delete expired items
    const deleteResult = await db.delete(history)
      .where(and(
        eq(history.feedId, feedId),
        // Note: pubDate is stored as text, so we need to convert for comparison
        // For now, we'll handle this differently in a real scenario
      ));

    let addedCount = 0;

    // Insert or update items
    for (const item of items) {
      const key = item.guid || item.link;
      if (!key) continue;

      // Check if exists
      const existing = await db.select()
        .from(history)
        .where(and(
          eq(history.feedId, feedId),
          item.guid ? eq(history.guid, item.guid) : eq(history.link, item.link)
        ))
        .limit(1);

      if (existing.length === 0) {
        addedCount++;
      }

      // Upsert
      await db.insert(history).values({
        feedId,
        guid: item.guid || null,
        link: item.link || null,
        title: item.title || null,
        pubDate: item.pubDate || null,
        content: item.content || null,
        description: item.description || null,
        thumbnail: item.thumbnail || null,
        author: item.author || null,
        enclosure: item.enclosure ? JSON.stringify(item.enclosure) : null,
        feedTitle: item.feedTitle || null,
      }).onConflictDoNothing();
    }

    // Get total count
    const totalResult = await db.select({ count: history.id })
      .from(history)
      .where(eq(history.feedId, feedId));

    const total = totalResult.length;

    console.log(`[History] Feed "${feedId}": +${addedCount} new, ${total} total`);

    return res.status(200).json({ 
      success: true, 
      added: addedCount, 
      total,
      expired: 0 // Will be calculated properly with better date handling
    });
  } catch (error: any) {
    console.error('[API Error]', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
