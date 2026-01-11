import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db';
import { history, feeds } from '../../db/schema';
import { eq, and, lt, sql } from 'drizzle-orm';
import { normalizeClientIp } from '../../lib/security';

const HISTORY_UPSERT_WINDOW_MS = 60 * 1000;
const HISTORY_UPSERT_MAX_REQUESTS = parseInt(process.env.HISTORY_UPSERT_MAX_REQUESTS || '30', 10);
const HISTORY_UPSERT_MAX_ITEMS = parseInt(process.env.HISTORY_UPSERT_MAX_ITEMS || '500', 10);
const historyUpsertRateState = new Map<string, { start: number; count: number }>();

const checkHistoryUpsertRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const entry = historyUpsertRateState.get(ip);
  if (!entry || now - entry.start >= HISTORY_UPSERT_WINDOW_MS) {
    historyUpsertRateState.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > HISTORY_UPSERT_MAX_REQUESTS;
};

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

    if (items.length > HISTORY_UPSERT_MAX_ITEMS) {
      return res.status(413).json({ error: 'Too many items in a single request' });
    }

    const clientIp = normalizeClientIp(new Headers(req.headers as any));
    if (checkHistoryUpsertRateLimit(clientIp)) {
      return res.status(429).json({ error: 'Too many history upsert requests' });
    }

    const feedExists = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(eq(feeds.id, feedId))
      .limit(1);

    if (feedExists.length === 0) {
      return res.status(404).json({ error: `Feed ID '${feedId}' not found` });
    }
 
    const HISTORY_RETENTION_DAYS = 60;
    const cutoffTime = new Date(Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
 
    // Delete expired items based on insertion time
    const deleteResult = await db.delete(history)
      .where(and(
        eq(history.feedId, feedId),
        lt(history.lastUpdated, cutoffTime)
      ));

    const expiredCount = deleteResult.rowCount ?? 0;
 
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
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(history)
      .where(eq(history.feedId, feedId));
 
    const total = Number(totalResult[0]?.count ?? 0);
 
    console.log(`[History] Feed "${feedId}": +${addedCount} new, ${total} total`);
 
    return res.status(200).json({ 
      success: true, 
      added: addedCount, 
      total,
      expired: expiredCount
    });

  } catch (error: any) {
    console.error('[API Error]', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
