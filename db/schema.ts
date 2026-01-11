import { pgTable, text, serial, timestamp, integer, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Feeds table - stores RSS feed configurations
 * Replaces the old feeds.json file
 */
export const feeds = pgTable('feeds', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  category: text('category').notNull(),
  isSub: boolean('is_sub').default(false).notNull(),
  customTitle: text('custom_title').default(''),
  allowedMediaHosts: text('allowed_media_hosts'), // JSON array stored as text
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * History table - stores article history
 * Replaces the old SQLite history.db
 */
export const history = pgTable('history', {
  id: serial('id').primaryKey(),
  feedId: text('feed_id').notNull().references(() => feeds.id, { onDelete: 'cascade' }),
  guid: text('guid'),
  link: text('link'),
  title: text('title'),
  pubDate: text('pub_date'), // Store as ISO string for consistency
  content: text('content'),
  description: text('description'),
  thumbnail: text('thumbnail'),
  author: text('author'),
  enclosure: text('enclosure'), // JSON object stored as text
  feedTitle: text('feed_title'),
  lastUpdated: timestamp('last_updated').defaultNow().notNull(),
}, (table) => ({
  feedIdPubDateIdx: index('idx_history_feed_id_pub_date').on(table.feedId, table.pubDate),
  feedIdGuidIdx: uniqueIndex('idx_history_feed_id_guid').on(table.feedId, table.guid),
  feedIdLinkIdx: uniqueIndex('idx_history_feed_id_link').on(table.feedId, table.link),
}));

export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type History = typeof history.$inferSelect;
export type NewHistory = typeof history.$inferInsert;
