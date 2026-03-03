import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const feeds = sqliteTable('feeds', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  category: text('category').notNull(),
  isSub: integer('is_sub', { mode: 'boolean' }).default(false).notNull(),
  customTitle: text('custom_title').default(''),
  allowedMediaHosts: text('allowed_media_hosts'),
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const history = sqliteTable('history', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  feedId: text('feed_id').notNull().references(() => feeds.id, { onDelete: 'cascade' }),
  guid: text('guid'),
  link: text('link'),
  title: text('title'),
  pubDate: text('pub_date'),
  content: text('content'),
  description: text('description'),
  thumbnail: text('thumbnail'),
  author: text('author'),
  enclosure: text('enclosure'),
  feedTitle: text('feed_title'),
  lastUpdated: text('last_updated').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  feedIdPubDateIdx: index('idx_history_feed_id_pub_date').on(table.feedId, table.pubDate),
  feedIdGuidIdx: uniqueIndex('idx_history_feed_id_guid').on(table.feedId, table.guid),
  feedIdLinkIdx: uniqueIndex('idx_history_feed_id_link').on(table.feedId, table.link),
}));

export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type History = typeof history.$inferSelect;
export type NewHistory = typeof history.$inferInsert;
