/**
 * Migration script to transfer data from SQLite/JSON to Neon PostgreSQL
 * 
 * Usage:
 * 1. Set DATABASE_URL environment variable to your Neon connection string
 * 2. Run: node scripts/migrate-to-neon.js
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-http');
const schema = require('../db/schema');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FEEDS_FILE = path.join(DATA_DIR, 'feeds.json');
const HISTORY_DB_FILE = path.join(DATA_DIR, 'history.db');

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    console.error('Please set it to your Neon PostgreSQL connection string');
    process.exit(1);
  }

  console.log('🚀 Starting migration to Neon PostgreSQL...\n');

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql, { schema });

  // Migrate feeds from feeds.json
  console.log('📋 Migrating feeds from feeds.json...');
  if (fs.existsSync(FEEDS_FILE)) {
    const feedsData = JSON.parse(fs.readFileSync(FEEDS_FILE, 'utf8'));
    
    for (let i = 0; i < feedsData.length; i++) {
      const feed = feedsData[i];
      try {
        await db.insert(schema.feeds).values({
          id: feed.id,
          url: feed.url,
          category: feed.category || '',
          isSub: feed.isSub || false,
          customTitle: feed.customTitle || '',
          allowedMediaHosts: feed.allowedMediaHosts ? JSON.stringify(feed.allowedMediaHosts) : null,
          displayOrder: i,
        }).onConflictDoNothing();
        
        console.log(`  ✓ Migrated feed: ${feed.id}`);
      } catch (error) {
        console.error(`  ✗ Failed to migrate feed ${feed.id}:`, error.message);
      }
    }
    console.log(`✅ Feeds migration complete: ${feedsData.length} feeds processed\n`);
  } else {
    console.log('  ⚠ feeds.json not found, skipping...\n');
  }

  // Migrate history from history.db
  console.log('📚 Migrating history from SQLite...');
  if (fs.existsSync(HISTORY_DB_FILE)) {
    const sqlite = new Database(HISTORY_DB_FILE, { readonly: true });
    
    try {
      const rows = sqlite.prepare('SELECT * FROM history').all();
      console.log(`  Found ${rows.length} history items`);

      let migrated = 0;
      let skipped = 0;

      for (const row of rows) {
        try {
          await db.insert(schema.history).values({
            feedId: row.feedId,
            guid: row.guid,
            link: row.link,
            title: row.title,
            pubDate: row.pubDate,
            content: row.content,
            description: row.description,
            thumbnail: row.thumbnail,
            author: row.author,
            enclosure: row.enclosure,
            feedTitle: row.feedTitle,
          }).onConflictDoNothing();
          
          migrated++;
          if (migrated % 100 === 0) {
            console.log(`  Migrated ${migrated}/${rows.length}...`);
          }
        } catch (error) {
          skipped++;
          if (skipped <= 5) {
            console.error(`  ✗ Failed to migrate item: ${error.message}`);
          }
        }
      }

      console.log(`✅ History migration complete: ${migrated} items migrated, ${skipped} skipped\n`);
    } catch (error) {
      console.error('  ✗ Error reading SQLite database:', error.message);
    } finally {
      sqlite.close();
    }
  } else {
    console.log('  ⚠ history.db not found, skipping...\n');
  }

  console.log('🎉 Migration complete!\n');
  console.log('Next steps:');
  console.log('1. Verify data in your Neon dashboard');
  console.log('2. Update your Vercel project environment variables:');
  console.log('   - DATABASE_URL=<your-neon-connection-string>');
  console.log('   - ADMIN_SECRET=<your-admin-password>');
  console.log('3. Deploy to Vercel: vercel --prod');
  console.log('4. Backup and archive your local data/ directory');
}

migrate().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
