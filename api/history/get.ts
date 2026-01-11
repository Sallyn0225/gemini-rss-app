import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db/index.js';
import { history } from '../../db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const feedId = req.query.id as string;
    const limit = parseInt(req.query.limit as string) || 0;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!feedId) {
      return res.status(400).json({ error: 'Missing id parameter' });
    }

    // Get total count without loading all rows
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(history)
      .where(eq(history.feedId, feedId));
    
    const total = Number(totalResult[0]?.count ?? 0);
 
    if (total === 0) {
      return res.status(200).json({ feedId, items: [], lastUpdated: null, total: 0 });
    }


    // Get paginated items
    let query = db.select()
      .from(history)
      .where(eq(history.feedId, feedId))
      .orderBy(desc(history.pubDate));

    if (limit > 0) {
      query = query.limit(limit).offset(offset) as any;
    } else if (offset > 0) {
      query = query.offset(offset) as any;
    }

    const rows = await query;

    // Convert to Article format
    const items = rows.map(row => ({
      title: row.title,
      pubDate: row.pubDate,
      link: row.link,
      guid: row.guid,
      author: row.author,
      description: row.description,
       content: row.content,
       thumbnail: row.thumbnail ? JSON.parse(row.thumbnail) : null,
       enclosure: row.enclosure ? JSON.parse(row.enclosure) : null,
      feedTitle: row.feedTitle,
    }));

    const lastUpdated = rows.length > 0 ? rows[0].lastUpdated?.getTime() : null;

    return res.status(200).json({
      feedId,
      items,
      lastUpdated,
      total,
    });
  } catch (error: any) {
    if (res.headersSent) {
      console.error('[Server Error] [API Error] Headers already sent:', error);
      return;
    }
    console.error('[Server Error] [API Error]', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
}
