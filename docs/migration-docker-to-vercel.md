# Migration Guide: Docker → Vercel + Neon

This guide will help you migrate your existing Gemini RSS Translator deployment from Docker/Node.js to Vercel + Neon serverless architecture.

## Prerequisites

- Existing deployment with `data/feeds.json` and `data/history.db`
- [Neon](https://neon.tech) account (free tier available)
- [Vercel](https://vercel.com) account (free tier available)
- Node.js 18+ installed locally

## Step 1: Backup Your Data

Before starting, create a backup of your data directory:

```bash
cd /path/to/gemini-rss-app
cp -r data data_backup_$(date +%Y%m%d)
```

## Step 2: Set Up Neon Database

1. Go to [Neon Dashboard](https://console.neon.tech)
2. Click "Create Project"
3. Choose a region close to your users
4. Copy the connection string (format: `postgresql://user:password@host.neon.tech/dbname?sslmode=require`)

## Step 3: Create Database Schema

You have two options:

### Option A: Using Drizzle Kit (Recommended)

```bash
# Set your Neon connection string
export DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require"

# Generate and push schema
npx drizzle-kit push
```

### Option B: Manual SQL Execution

Open Neon SQL Editor and run:

```sql
-- Feeds table
CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  category TEXT NOT NULL,
  is_sub BOOLEAN DEFAULT false NOT NULL,
  custom_title TEXT DEFAULT '',
  allowed_media_hosts TEXT,
  display_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- History table
CREATE TABLE history (
  id SERIAL PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  guid TEXT,
  link TEXT,
  title TEXT,
  pub_date TEXT,
  content TEXT,
  description TEXT,
  thumbnail TEXT,
  author TEXT,
  enclosure TEXT,
  feed_title TEXT,
  last_updated TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_history_feed_id_pub_date ON history (feed_id, pub_date);
CREATE UNIQUE INDEX idx_history_feed_id_guid ON history (feed_id, guid);
CREATE UNIQUE INDEX idx_history_feed_id_link ON history (feed_id, link);
```

## Step 4: Migrate Your Data

Run the migration script:

```bash
# Make sure DATABASE_URL is set
export DATABASE_URL="your-neon-connection-string"

# Run migration
node scripts/migrate-to-neon.cjs
```

Expected output:
```
🚀 Starting migration to Neon PostgreSQL...

📋 Migrating feeds from feeds.json...
  ✓ Migrated feed: feed1
  ✓ Migrated feed: feed2
✅ Feeds migration complete: 2 feeds processed

📚 Migrating history from SQLite...
  Found 1523 history items
  Migrated 100/1523...
  Migrated 200/1523...
  ...
✅ History migration complete: 1523 items migrated, 0 skipped

🎉 Migration complete!
```

## Step 5: Deploy to Vercel

### Via GitHub (Recommended)

1. Push your code to GitHub:
```bash
git add .
git commit -m "Migrate to Vercel + Neon serverless architecture"
git push origin main
```

2. Go to [Vercel Dashboard](https://vercel.com/new)
3. Click "Import Project"
4. Select your GitHub repository
5. Configure environment variables:
   - `DATABASE_URL`: Your Neon connection string
   - `ADMIN_SECRET`: Your admin password (keep it secure!)
   - (Optional) `MEDIA_PROXY_MAX_BYTES`: Default is 50MB
6. Click "Deploy"

### Via Vercel CLI

```bash
# Install Vercel CLI globally
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Add environment variables
vercel env add DATABASE_URL production
# Paste your Neon connection string

vercel env add ADMIN_SECRET production
# Enter your admin password

# Production deployment
vercel --prod
```

## Step 6: Verify Deployment

1. Visit your Vercel deployment URL: `https://your-project.vercel.app`
2. Check that the frontend loads correctly
3. Test API endpoints:
   - `https://your-project.vercel.app/api/feeds/list` - Should return feed list
4. Access settings and verify feed management works with your ADMIN_SECRET

## Step 7: Update Frontend Configuration (if needed)

If you had hardcoded API URLs in your frontend:

1. Remove any references to `http://localhost:3000` or your old server IP
2. All API calls should use relative paths like `/api/feed?id=xxx`
3. Vercel automatically routes these to the serverless functions

## Troubleshooting

### Database Connection Errors

**Error**: `Connection timeout` or `Connection refused`

**Solution**: 
- Verify your DATABASE_URL is correct
- Check that Neon project is active (not suspended)
- Ensure connection string includes `?sslmode=require`

### API Errors (500 Internal Server Error)

**Solution**:
- Check Vercel Function logs: `vercel logs`
- Verify environment variables are set: `vercel env ls`
- Check Neon query logs in dashboard

### Missing Data After Migration

**Solution**:
- Re-run migration script: `node scripts/migrate-to-neon.cjs`
- Check Neon SQL editor to verify tables have data:
  ```sql
  SELECT COUNT(*) FROM feeds;
  SELECT COUNT(*) FROM history;
  ```

### Media Proxy Timeouts

**Issue**: Large media files cause 504 errors

**Solution**:
- Vercel functions have execution time limits (10s on free tier)
- Recommend users set image proxy mode to "none" for large files
- Or upgrade to Vercel Pro for 60s timeout

## Rollback Plan

If you need to rollback to Docker:

1. Your `data_backup_YYYYMMDD` folder still has original data
2. Restore it: `cp -r data_backup_YYYYMMDD/* data/`
3. Start Docker: `docker-compose up -d`

## Cost Estimation

### Free Tier Limits

**Vercel**:
- 100 GB bandwidth/month
- Unlimited serverless function invocations
- 100 GB-hours of function execution

**Neon**:
- 0.5 GB storage
- 1 GB data transfer/month
- Automatic suspension after 5 minutes of inactivity

### Typical Usage (Small/Medium Site)

- **Feeds**: ~10 KB (very small)
- **History**: 1,000 articles × 5 KB = ~5 MB
- **Monthly traffic**: 10,000 requests = Well within free tier

Most personal deployments will stay within free tier limits.

## Next Steps

1. **Archive old server**: Once verified, you can decommission your Docker server
2. **Set up monitoring**: Use Vercel Analytics to track usage
3. **Configure custom domain**: Add your domain in Vercel dashboard
4. **Enable auto-deployments**: Push to GitHub automatically deploys to Vercel

## Support

If you encounter issues:
1. Check Vercel function logs: `vercel logs --follow`
2. Check Neon logs in dashboard
3. Open an issue on GitHub with error details
