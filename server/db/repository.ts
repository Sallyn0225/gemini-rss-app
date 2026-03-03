import { eq, and, lt, desc, sql, inArray } from 'drizzle-orm';
import type { DbClient } from './client.js';
import * as pgSchema from './schema.pg.js';
import * as d1Schema from './schema.d1.js';
import { safeParseUrl, inferAllowedImageHosts } from '../security.js';

// Module-level cache for allowed media hosts (5-minute TTL)
let _globalHostCache: { hosts: Set<string>; expiresAt: number } | null = null;
const HOST_CACHE_TTL = 5 * 60 * 1000;

// Unified types used by handlers
export interface FeedRow {
  id: string;
  url: string;
  category: string;
  isSub: boolean;
  customTitle: string | null;
  allowedMediaHosts: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryRow {
  id: number;
  feedId: string;
  guid: string | null;
  link: string | null;
  title: string | null;
  pubDate: string | null;
  content: string | null;
  description: string | null;
  thumbnail: string | null;
  author: string | null;
  enclosure: string | null;
  feedTitle: string | null;
  lastUpdated: string;
}

export interface FeedSummary {
  id: string;
  articleCount: number;
}

export interface HistoryItem {
  guid?: string | null;
  link?: string | null;
  title?: string | null;
  pubDate?: string | null;
  content?: string | null;
  description?: string | null;
  thumbnail?: string | Record<string, unknown> | null;
  author?: string | null;
  enclosure?: { link: string; type: string } | null;
  feedTitle?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeFeed(raw: Record<string, any>): FeedRow {
  return {
    id: raw.id,
    url: raw.url,
    category: raw.category,
    isSub: !!raw.isSub,
    customTitle: raw.customTitle ?? null,
    allowedMediaHosts: raw.allowedMediaHosts ?? null,
    displayOrder: raw.displayOrder ?? 0,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : String(raw.createdAt),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt.toISOString() : String(raw.updatedAt),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeHistory(raw: Record<string, any>): HistoryRow {
  return {
    id: raw.id,
    feedId: raw.feedId,
    guid: raw.guid ?? null,
    link: raw.link ?? null,
    title: raw.title ?? null,
    pubDate: raw.pubDate ?? null,
    content: raw.content ?? null,
    description: raw.description ?? null,
    thumbnail: raw.thumbnail ?? null,
    author: raw.author ?? null,
    enclosure: raw.enclosure ?? null,
    feedTitle: raw.feedTitle ?? null,
    lastUpdated: raw.lastUpdated instanceof Date ? raw.lastUpdated.toISOString() : String(raw.lastUpdated),
  };
}

export class Repository {
  constructor(private client: DbClient) {}

  // ─── Feed operations ───

  async getFeedById(id: string): Promise<FeedRow | null> {
    if (this.client.type === 'd1') {
      const rows = await this.client.d1!.select().from(d1Schema.feeds).where(eq(d1Schema.feeds.id, id)).limit(1);
      return rows.length > 0 ? normalizeFeed(rows[0]) : null;
    }
    const rows = await this.client.neon!.select().from(pgSchema.feeds).where(eq(pgSchema.feeds.id, id)).limit(1);
    return rows.length > 0 ? normalizeFeed(rows[0]) : null;
  }

  async listFeeds(): Promise<FeedRow[]> {
    if (this.client.type === 'd1') {
      const rows = await this.client.d1!.select().from(d1Schema.feeds).orderBy(d1Schema.feeds.displayOrder);
      return rows.map(normalizeFeed);
    }
    const rows = await this.client.neon!.select().from(pgSchema.feeds).orderBy(pgSchema.feeds.displayOrder);
    return rows.map(normalizeFeed);
  }

  async getFeedSummaries(): Promise<FeedSummary[]> {
    if (this.client.type === 'd1') {
      const rows = await this.client.d1!
        .select({ id: d1Schema.history.feedId, articleCount: sql<number>`count(*)` })
        .from(d1Schema.history)
        .groupBy(d1Schema.history.feedId);
      return rows.map(r => ({ id: r.id, articleCount: Number(r.articleCount ?? 0) }));
    }
    const rows = await this.client.neon!
      .select({ id: pgSchema.history.feedId, articleCount: sql<number>`count(*)` })
      .from(pgSchema.history)
      .groupBy(pgSchema.history.feedId);
    return rows.map(r => ({ id: r.id, articleCount: Number(r.articleCount ?? 0) }));
  }

  async upsertFeed(data: { id: string; url: string; category: string; isSub: boolean; customTitle: string; allowedMediaHosts: string | null }): Promise<void> {
    if (this.client.type === 'd1') {
      const existing = await this.client.d1!.select().from(d1Schema.feeds).where(eq(d1Schema.feeds.id, data.id)).limit(1);
      if (existing.length > 0) {
        await this.client.d1!.update(d1Schema.feeds).set({
          url: data.url,
          category: data.category,
          isSub: data.isSub,
          customTitle: data.customTitle,
          allowedMediaHosts: data.allowedMediaHosts,
          updatedAt: new Date().toISOString(),
        } as Partial<typeof d1Schema.feeds.$inferInsert>).where(eq(d1Schema.feeds.id, data.id));
      } else {
        await this.client.d1!.insert(d1Schema.feeds).values({
          id: data.id,
          url: data.url,
          category: data.category,
          isSub: data.isSub,
          customTitle: data.customTitle,
          allowedMediaHosts: data.allowedMediaHosts,
          displayOrder: 0,
        } as typeof d1Schema.feeds.$inferInsert);
      }
    } else {
      const existing = await this.client.neon!.select().from(pgSchema.feeds).where(eq(pgSchema.feeds.id, data.id)).limit(1);
      if (existing.length > 0) {
        await this.client.neon!.update(pgSchema.feeds).set({
          url: data.url,
          category: data.category,
          isSub: data.isSub,
          customTitle: data.customTitle,
          allowedMediaHosts: data.allowedMediaHosts,
          updatedAt: new Date(),
        } as Partial<typeof pgSchema.feeds.$inferInsert>).where(eq(pgSchema.feeds.id, data.id));
      } else {
        await this.client.neon!.insert(pgSchema.feeds).values({
          id: data.id,
          url: data.url,
          category: data.category,
          isSub: data.isSub,
          customTitle: data.customTitle,
          allowedMediaHosts: data.allowedMediaHosts,
          displayOrder: 0,
        } as typeof pgSchema.feeds.$inferInsert);
      }
    }
  }

  async deleteFeed(id: string): Promise<number> {
    if (this.client.type === 'd1') {
      const result = await this.client.d1!.delete(d1Schema.feeds).where(eq(d1Schema.feeds.id, id));
      return (result as { rowsAffected?: number }).rowsAffected ?? result.meta?.changes ?? 0;
    }
    const result = await this.client.neon!.delete(pgSchema.feeds).where(eq(pgSchema.feeds.id, id));
    return result.rowCount ?? 0;
  }

  async reorderFeeds(ids: string[]): Promise<void> {
    if (this.client.type === 'd1') {
      // Validate all ids exist
      const existing = await this.client.d1!.select({ id: d1Schema.feeds.id }).from(d1Schema.feeds).where(inArray(d1Schema.feeds.id, ids));
      if (existing.length !== ids.length) throw new Error('One or more feeds not found');
      for (let i = 0; i < ids.length; i++) {
        await this.client.d1!.update(d1Schema.feeds).set({ displayOrder: i, updatedAt: new Date().toISOString() } as Partial<typeof d1Schema.feeds.$inferInsert>).where(eq(d1Schema.feeds.id, ids[i]));
      }
    } else {
      const existing = await this.client.neon!.select({ id: pgSchema.feeds.id }).from(pgSchema.feeds).where(inArray(pgSchema.feeds.id, ids));
      if (existing.length !== ids.length) throw new Error('One or more feeds not found');
      for (let i = 0; i < ids.length; i++) {
        await this.client.neon!.update(pgSchema.feeds).set({ displayOrder: i, updatedAt: new Date() } as Partial<typeof pgSchema.feeds.$inferInsert>).where(eq(pgSchema.feeds.id, ids[i]));
      }
    }
  }

  // ─── History operations ───

  async getHistoryCount(feedId: string): Promise<number> {
    if (this.client.type === 'd1') {
      const result = await this.client.d1!.select({ count: sql<number>`count(*)` }).from(d1Schema.history).where(eq(d1Schema.history.feedId, feedId));
      return Number(result[0]?.count ?? 0);
    }
    const result = await this.client.neon!.select({ count: sql<number>`count(*)` }).from(pgSchema.history).where(eq(pgSchema.history.feedId, feedId));
    return Number(result[0]?.count ?? 0);
  }

  async getHistory(feedId: string, limit: number, offset: number): Promise<HistoryRow[]> {
    if (this.client.type === 'd1') {
      let query = this.client.d1!.select().from(d1Schema.history).where(eq(d1Schema.history.feedId, feedId)).orderBy(desc(d1Schema.history.pubDate));
      if (limit > 0) query = query.limit(limit).offset(offset) as typeof query;
      else if (offset > 0) query = query.offset(offset) as typeof query;
      const rows = await query;
      return rows.map(normalizeHistory);
    }
    let query = this.client.neon!.select().from(pgSchema.history).where(eq(pgSchema.history.feedId, feedId)).orderBy(desc(pgSchema.history.pubDate));
    if (limit > 0) query = query.limit(limit).offset(offset) as typeof query;
    else if (offset > 0) query = query.offset(offset) as typeof query;
    const rows = await query;
    return rows.map(normalizeHistory);
  }

  async feedExists(feedId: string): Promise<boolean> {
    if (this.client.type === 'd1') {
      const rows = await this.client.d1!.select({ id: d1Schema.feeds.id }).from(d1Schema.feeds).where(eq(d1Schema.feeds.id, feedId)).limit(1);
      return rows.length > 0;
    }
    const rows = await this.client.neon!.select({ id: pgSchema.feeds.id }).from(pgSchema.feeds).where(eq(pgSchema.feeds.id, feedId)).limit(1);
    return rows.length > 0;
  }

  async deleteExpiredHistory(feedId: string, retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    if (this.client.type === 'd1') {
      const cutoffStr = cutoff.toISOString();
      const result = await this.client.d1!.delete(d1Schema.history).where(
        and(eq(d1Schema.history.feedId, feedId), lt(d1Schema.history.lastUpdated, cutoffStr))
      );
      return (result as { rowsAffected?: number }).rowsAffected ?? result.meta?.changes ?? 0;
    }
    const result = await this.client.neon!.delete(pgSchema.history).where(
      and(eq(pgSchema.history.feedId, feedId), lt(pgSchema.history.lastUpdated, cutoff))
    );
    return result.rowCount ?? 0;
  }

  async upsertHistoryItems(feedId: string, items: HistoryItem[]): Promise<{ added: number }> {
    let addedCount = 0;

    for (const item of items) {
      const key = item.guid || item.link;
      if (!key) continue;

      if (this.client.type === 'd1') {
        const existing = await this.client.d1!.select().from(d1Schema.history).where(
          and(eq(d1Schema.history.feedId, feedId), item.guid ? eq(d1Schema.history.guid, item.guid) : eq(d1Schema.history.link, item.link!))
        ).limit(1);
        if (existing.length === 0) addedCount++;
        await this.client.d1!.insert(d1Schema.history).values({
          feedId,
          guid: item.guid || null,
          link: item.link || null,
          title: item.title || null,
          pubDate: item.pubDate || null,
          content: item.content || null,
          description: item.description || null,
          thumbnail: item.thumbnail ? JSON.stringify(item.thumbnail) : null,
          author: item.author || null,
          enclosure: item.enclosure ? JSON.stringify(item.enclosure) : null,
          feedTitle: item.feedTitle || null,
        } as typeof d1Schema.history.$inferInsert).onConflictDoNothing();
      } else {
        const existing = await this.client.neon!.select().from(pgSchema.history).where(
          and(eq(pgSchema.history.feedId, feedId), item.guid ? eq(pgSchema.history.guid, item.guid) : eq(pgSchema.history.link, item.link!))
        ).limit(1);
        if (existing.length === 0) addedCount++;
        await this.client.neon!.insert(pgSchema.history).values({
          feedId,
          guid: item.guid || null,
          link: item.link || null,
          title: item.title || null,
          pubDate: item.pubDate || null,
          content: item.content || null,
          description: item.description || null,
          thumbnail: item.thumbnail ? JSON.stringify(item.thumbnail) : null,
          author: item.author || null,
          enclosure: item.enclosure ? JSON.stringify(item.enclosure) : null,
          feedTitle: item.feedTitle || null,
        } as typeof pgSchema.history.$inferInsert).onConflictDoNothing();
      }
    }

    return { added: addedCount };
  }

  // ─── Media proxy helpers ───

  async getAllAllowedMediaHosts(): Promise<Set<string>> {
    // Return cached result if still valid
    if (_globalHostCache && Date.now() < _globalHostCache.expiresAt) {
      return _globalHostCache.hosts;
    }

    const allFeeds = await this.listFeeds();
    const hosts = new Set<string>();

    for (const feed of allFeeds) {
      const parsed = safeParseUrl(feed.url);
      if (parsed?.hostname) hosts.add(parsed.hostname.toLowerCase());
      if (feed.allowedMediaHosts) {
        try {
          const parsedHosts = JSON.parse(feed.allowedMediaHosts);
          if (Array.isArray(parsedHosts)) parsedHosts.forEach(h => hosts.add(String(h).toLowerCase()));
        } catch {}
      }
      inferAllowedImageHosts(feed.url).forEach(h => hosts.add(h));
    }

    _globalHostCache = { hosts, expiresAt: Date.now() + HOST_CACHE_TTL };
    return hosts;
  }
}
