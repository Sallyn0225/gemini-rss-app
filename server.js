
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const dns = require('dns');
const net = require('net');
const Database = require('better-sqlite3');
const { fetchWithProxy, streamWithProxy, isProxyEnabled, buildProxiedMediaUrl } = require('./proxyUtils');

// --- Configuration ---
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'feeds.json');
const HISTORY_DB_FILE = path.join(DATA_DIR, 'history.db');
const STATIC_PATH = path.join(__dirname, 'dist'); // Serve from the 'dist' folder
// 管理接口密钥：必须从环境变量读取，未设置则管理接口不可用
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

// --- Caching Configuration ---
const feedCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- Media Proxy Rate Limiting & Size Control ---
const MEDIA_PROXY_WINDOW_MS = 60 * 1000; // 1 minute window
const MEDIA_PROXY_MAX_REQUESTS = 120; // Max requests per IP per window
const MEDIA_PROXY_MAX_BYTES = 50 * 1024 * 1024; // 50MB max file size
const mediaProxyRateState = new Map();

// --- In-memory store for feeds config ---
let FEEDS_CONFIG = [];

// --- Helper: Normalize client IP ---
const normalizeClientIp = (req) => {
  const forwarded = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const raw = forwarded || req.socket.remoteAddress || '';
  if (!raw) return 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

// --- Helper: Check media proxy rate limit ---
const checkMediaProxyRateLimit = (ip) => {
  const now = Date.now();
  const entry = mediaProxyRateState.get(ip);
  if (!entry || now - entry.start >= MEDIA_PROXY_WINDOW_MS) {
    mediaProxyRateState.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MEDIA_PROXY_MAX_REQUESTS;
};

// --- SQLite Database ---
let db;

// --- Helper: Initialize Database ---
const initDatabase = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(HISTORY_DB_FILE);

  // Create history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedId TEXT NOT NULL,
      guid TEXT,
      link TEXT,
      title TEXT,
      pubDate TEXT,
      content TEXT,
      description TEXT,
      thumbnail TEXT,
      author TEXT,
      enclosure TEXT,
      feedTitle TEXT,
      lastUpdated INTEGER,
      UNIQUE(feedId, guid),
      UNIQUE(feedId, link)
    );
  `);

  // Create index for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feed_pubdate ON history (feedId, pubDate DESC);
  `);

  console.log(`[DB] Initialized SQLite database at: ${HISTORY_DB_FILE}`);
};

// --- Helper: Migrate existing JSON history to database ---
const migrateHistoryToDatabase = () => {
  const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
  if (!fs.existsSync(HISTORY_FILE)) return;

  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    if (!data.trim()) return;
    const historyData = JSON.parse(data);

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO history (feedId, guid, link, title, pubDate, content, description, thumbnail, author, enclosure, feedTitle, lastUpdated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let totalMigrated = 0;
    for (const [feedId, feedData] of Object.entries(historyData)) {
      if (!feedData.items) continue;
      for (const item of feedData.items) {
        insertStmt.run(
          feedId,
          item.guid || null,
          item.link || null,
          item.title || null,
          item.pubDate || null,
          item.content || null,
          item.description || null,
          item.thumbnail || null,
          item.author || null,
          item.enclosure ? JSON.stringify(item.enclosure) : null,
          item.feedTitle || null,
          feedData.lastUpdated || Date.now()
        );
        totalMigrated++;
      }
    }

    if (totalMigrated > 0) {
      console.log(`[Migration] Migrated ${totalMigrated} history items from JSON to database`);
      const backupFile = path.join(DATA_DIR, 'history.json.bak');
      fs.renameSync(HISTORY_FILE, backupFile);
      console.log(`[Migration] Original history.json backed up to ${backupFile}`);
    }
  } catch (e) {
    console.error('Migration error:', e);
  }
};

// --- Helper: Safe URL parsing ---
const safeParseUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  // Basic hardening: reject obvious non-http(s) schemes early
  if (!/^https?:\/\//i.test(raw.trim())) return null;
  try {
    const parsed = new URL(raw.trim());
    // Disallow username/password in URLs used for proxying
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
};

// --- Helper: Check if IP is private / loopback / link-local ---
const isPrivateIp = (ip) => {
  if (!ip || typeof ip !== 'string') return true;

  // IPv6 loopback or unique local
  if (ip === '::1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // fc00::/7

  if (!net.isIP(ip)) return true;

  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true;

  const [a, b] = parts;

  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;

  return false;
};

// --- Helper: Resolve hostname and reject private/loopback targets ---
const resolveAndValidateHost = (hostname) => {
  return dns.promises.lookup(hostname, { all: false }).then((result) => {
    const ip = typeof result === 'string' ? result : result.address;
    if (isPrivateIp(ip)) {
      const err = new Error('Target host resolves to a private or loopback address');
      err.code = 'PRIVATE_HOST';
      throw err;
    }
    return ip;
  });
};

// --- Helper: Infer allowed image hosts based on RSSHub-style routes ---
const inferAllowedImageHosts = (feedUrl) => {
  const parsed = safeParseUrl(feedUrl);
  if (!parsed) return [];

  const pathname = parsed.pathname || '';
  const hosts = new Set();

  // Always allow the feed host itself for images from the same origin
  if (parsed.hostname) hosts.add(parsed.hostname.toLowerCase());

  // Twitter-style routes (rsshub /twitter/...) 日后如果要加其他订阅源，在这里维护
  if (pathname.startsWith('/twitter/')) {
    hosts.add('twimg.com');
    hosts.add('pbs.twimg.com');
    hosts.add('abs.twimg.com');
  }

  return Array.from(hosts);
};

// --- Helper: Get all allowed media hosts from feed configs ---
const getAllowedMediaHosts = () => {
  const hosts = new Set();
  for (const feed of FEEDS_CONFIG) {
    const parsed = safeParseUrl(feed.url || '');
    if (parsed?.hostname) {
      hosts.add(parsed.hostname.toLowerCase());
    }
    // Allow explicit allowedMediaHosts from feed config
    if (Array.isArray(feed.allowedMediaHosts)) {
      feed.allowedMediaHosts.forEach((host) => {
        if (typeof host === 'string' && host.trim()) {
          hosts.add(host.trim().toLowerCase());
        }
      });
    }
    // Infer hosts from feed URL patterns
    inferAllowedImageHosts(feed.url || '').forEach((host) => hosts.add(host));
  }
  return hosts;
};

// --- Security: Localhost-only check for admin APIs ---
// 管理接口安全限制：只允许本机访问（通过 SSH 隧道使用）
const isLocalRequest = (req) => {
  const ip = req.socket.remoteAddress || '';
  // 支持 IPv4 和 IPv6 的本机地址
  // IPv4: 127.0.0.1
  // IPv6: ::1 或 ::ffff:127.0.0.1 (IPv4-mapped)
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
};

// --- Default Feeds (Fallback/Initial) ---
// 示例配置：请根据自己使用的 RSS 源替换
// 实际订阅列表存储在 data/feeds.json，此处仅为首次启动时的初始化数据
const DEFAULT_FEEDS = [
  // { id: 'example_feed', url: 'https://rsshub.app/twitter/user/example', category: 'Example Category', isSub: false, customTitle: '' }
];

// --- Helper: Load Feeds into memory ---
const loadFeeds = () => {
  if (!fs.existsSync(DATA_DIR)) {
    console.log(`[Init] Data directory not found. Creating at: ${DATA_DIR}`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    console.log(`[Init] Feeds file not found. Creating with defaults at: ${DATA_FILE}`);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_FEEDS, null, 2));
    FEEDS_CONFIG = DEFAULT_FEEDS;
    return;
  }
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    if (!data.trim()) {
      console.warn(`[Warning] feeds.json is empty. Initializing with defaults.`);
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_FEEDS, null, 2));
      FEEDS_CONFIG = DEFAULT_FEEDS;
      return;
    }
    FEEDS_CONFIG = JSON.parse(data);
  } catch (e) {
    console.error("Error reading feeds.json:", e);
    const backupPath = `${DATA_FILE}.${Date.now()}.bak`;
    try {
      fs.renameSync(DATA_FILE, backupPath);
      console.log(`[Recovery] Corrupted feeds.json backed up to ${backupPath}`);
    } catch (renameErr) {
      console.error("Could not backup corrupted feeds.json", renameErr);
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_FEEDS, null, 2));
    FEEDS_CONFIG = DEFAULT_FEEDS;
  }
};

// --- Helper: Save/Update Feeds ---
const saveFeed = (newFeed) => {
  const index = FEEDS_CONFIG.findIndex(f => f.id === newFeed.id);
  if (index >= 0) {
    FEEDS_CONFIG[index] = { ...FEEDS_CONFIG[index], ...newFeed };
  } else {
    FEEDS_CONFIG.push(newFeed);
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(FEEDS_CONFIG, null, 2));
};

// --- Helper: Load History into memory ---
const loadHistory = () => {
  // No longer needed, using database
  console.log(`[Init] History now uses SQLite database`);
};

// --- Helper: Save History to disk ---
const saveHistory = () => {
  // No longer needed, using database
};

// --- Helper: Merge items into history (dedup by guid/link) ---
// 历史记录保留策略：只保留最近 2 个月的消息
const HISTORY_RETENTION_DAYS = 60; // 2 个月

const mergeHistoryItems = (feedId, newItems) => {
  const cutoffTime = Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  // First, delete expired items
  const deleteExpired = db.prepare('DELETE FROM history WHERE feedId = ? AND pubDate < ?');
  const expiredCount = deleteExpired.run(feedId, new Date(cutoffTime).toISOString()).changes;

  // Prepare statements
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO history (feedId, guid, link, title, pubDate, content, description, thumbnail, author, enclosure, feedTitle, lastUpdated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const checkExists = db.prepare('SELECT id FROM history WHERE feedId = ? AND (guid = ? OR link = ?) LIMIT 1');

  let addedCount = 0;
  let total = 0;

  // Get current total for this feed
  const totalStmt = db.prepare('SELECT COUNT(*) as count FROM history WHERE feedId = ?');
  total = totalStmt.get(feedId).count;

  for (const item of newItems) {
    const key = item.guid || item.link;
    if (!key) continue;

    // Check if exists
    const exists = checkExists.get(feedId, item.guid || null, item.link || null);
    if (!exists) {
      addedCount++;
    }

    // Insert or replace
    insertStmt.run(
      feedId,
      item.guid || null,
      item.link || null,
      item.title || null,
      item.pubDate || null,
      item.content || null,
      item.description || null,
      item.thumbnail || null,
      item.author || null,
      item.enclosure ? JSON.stringify(item.enclosure) : null,
      item.feedTitle || null,
      Date.now()
    );
  }

  // Update total after insert
  total = totalStmt.get(feedId).count;

  return { total, added: addedCount, expired: expiredCount };
};

// --- Helper: Delete Feed ---
const deleteFeed = (feedId) => {
  const initialLength = FEEDS_CONFIG.length;
  FEEDS_CONFIG = FEEDS_CONFIG.filter(f => f.id !== feedId);
  if (FEEDS_CONFIG.length === initialLength) {
    return false; // Not found
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(FEEDS_CONFIG, null, 2));
  return true;
};

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const parsedUrl = { pathname: urlObj.pathname, query: Object.fromEntries(urlObj.searchParams) };

  // === API: Get Feed List (Public - Hides URL) ===
  if (parsedUrl.pathname === '/api/feeds/list' && req.method === 'GET') {
    const safeFeeds = FEEDS_CONFIG.map(f => ({
      id: f.id,
      category: f.category,
      isSub: f.isSub || false,
      customTitle: f.customTitle || '',
      // Derived flag: whether this feed is eligible for server-side image proxy
      canProxyImages: inferAllowedImageHosts(f.url || '').length > 0
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(safeFeeds));
    return;
  }

  // === API: Get FULL Feed List (Protected) ===
  if (parsedUrl.pathname === '/api/feeds/list/all' && req.method === 'GET') {
    if (!ADMIN_SECRET) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Admin secret is not configured on server.' }));
      return;
    }
    const secret = req.headers['x-admin-secret'];
    if (secret !== ADMIN_SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid Admin Secret' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(FEEDS_CONFIG));
    return;
  }

  // === API: Add/Update Feed (Protected) ===
  if (parsedUrl.pathname === '/api/feeds/add' && req.method === 'POST') {
    if (!ADMIN_SECRET) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Admin secret is not configured on server.' }));
      return;
    }
    const secret = req.headers['x-admin-secret'];
    if (secret !== ADMIN_SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid Admin Secret' }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { id, url, category, isSub, customTitle } = JSON.parse(body);
        if (!id || !url) throw new Error("Missing ID or URL");
        saveFeed({ id, url, category, isSub: !!isSub, customTitle });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: Delete Feed (Protected) ===
  if (parsedUrl.pathname === '/api/feeds/delete' && req.method === 'POST') {
    if (!ADMIN_SECRET) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Admin secret is not configured on server.' }));
      return;
    }
    const secret = req.headers['x-admin-secret'];
    if (secret !== ADMIN_SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid Admin Secret' }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        if (!id) throw new Error("Missing ID");
        const deleted = deleteFeed(id);
        if (deleted) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Feed with id '${id}' not found.` }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: Reorder Feeds (Protected) ===
  if (parsedUrl.pathname === '/api/feeds/reorder' && req.method === 'POST') {
    if (!ADMIN_SECRET) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Admin secret is not configured on server.' }));
      return;
    }
    const secret = req.headers['x-admin-secret'];
    if (secret !== ADMIN_SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid Admin Secret' }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { ids } = JSON.parse(body); // Expecting array of IDs in desired order
        if (!Array.isArray(ids)) throw new Error("Invalid input: ids must be an array");

        // Create a map for quick lookup
        const feedMap = new Map(FEEDS_CONFIG.map(f => [f.id, f]));
        const newOrder = [];

        // Add feeds in the order specified by ids
        ids.forEach(id => {
          if (feedMap.has(id)) {
            newOrder.push(feedMap.get(id));
            feedMap.delete(id);
          }
        });

        // Append any remaining feeds (that were not in the ids list)
        feedMap.forEach(feed => newOrder.push(feed));

        FEEDS_CONFIG = newOrder;
        fs.writeFileSync(DATA_FILE, JSON.stringify(FEEDS_CONFIG, null, 2));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: History Upsert (Save article history) ===
  if (parsedUrl.pathname === '/api/history/upsert' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { feedId, items } = JSON.parse(body);
        if (!feedId || !Array.isArray(items)) {
          throw new Error('Missing feedId or items array');
        }
        const result = mergeHistoryItems(feedId, items);
        const expiredMsg = result.expired > 0 ? `, -${result.expired} expired` : '';
        console.log(`[History] Feed "${feedId}": +${result.added} new${expiredMsg}, ${result.total} total`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, added: result.added, total: result.total, expired: result.expired }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: History Get (Retrieve article history) ===
  if (parsedUrl.pathname === '/api/history/get' && req.method === 'GET') {
    const feedId = parsedUrl.query.id;
    const limit = parseInt(parsedUrl.query.limit) || 0;
    const offset = parseInt(parsedUrl.query.offset) || 0;

    if (!feedId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing id parameter' }));
      return;
    }

    try {
      // Get total count
      const totalStmt = db.prepare('SELECT COUNT(*) as count FROM history WHERE feedId = ?');
      const total = totalStmt.get(feedId).count;

      if (total === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ feedId, items: [], lastUpdated: null, total: 0 }));
        return;
      }

      // Get items with pagination
      let query = 'SELECT * FROM history WHERE feedId = ? ORDER BY pubDate DESC';
      const params = [feedId];

      if (limit > 0) {
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
      } else if (offset > 0) {
        query += ' OFFSET ?';
        params.push(offset);
      }

      const stmt = db.prepare(query);
      const rows = stmt.all(...params);

      // Convert rows back to Article format
      const items = rows.map(row => ({
        title: row.title,
        pubDate: row.pubDate,
        link: row.link,
        guid: row.guid,
        author: row.author,
        description: row.description,
        content: row.content,
        thumbnail: row.thumbnail,
        enclosure: row.enclosure ? JSON.parse(row.enclosure) : null,
        feedTitle: row.feedTitle
      }));

      const lastUpdated = rows.length > 0 ? rows[0].lastUpdated : null;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        feedId,
        items,
        lastUpdated,
        total
      }));
    } catch (e) {
      console.error('Database query error:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database error' }));
    }
    return;
  }

  // === API: RSS Proxy with Caching ===
  if (parsedUrl.pathname.startsWith('/api/feed')) {
    const feedId = parsedUrl.query.id;

    if (!feedId || typeof feedId !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing id parameter' }));
      return;
    }

    const feedConfig = FEEDS_CONFIG.find(f => f.id === feedId);
    if (!feedConfig || !feedConfig.url) {
      console.error(`[Server Error] ID Not Found or URL missing: ${feedId}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Feed ID '${feedId}' not found on server` }));
      return;
    }

    const parsedTarget = safeParseUrl(feedConfig.url);
    if (!parsedTarget || !parsedTarget.hostname) {
      console.error(`[Server Error] Invalid target URL for ID: ${feedId}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid upstream URL for this feed' }));
      return;
    }

    const cacheKey = feedId;
    const cached = feedCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      console.log(`[Cache HIT] ID: ${feedId}`);
      res.writeHead(200, { 'Content-Type': cached.contentType, 'Access-Control-Allow-Origin': '*' });
      res.end(cached.content);
      return;
    }
    console.log(`[Cache MISS] ID: ${feedId}`);

    resolveAndValidateHost(parsedTarget.hostname).then(async () => {
      try {
        const result = await fetchWithProxy(parsedTarget.toString(), { timeout: 15000 });
        console.log(`[Feed Fetch] ID: ${feedId} | Status: ${result.statusCode}`);
        
        if (result.statusCode >= 400) {
          res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: `Upstream error for ID '${feedId}'`, 
            status: result.statusCode, 
            body: result.body.toString().substring(0, 200) 
          }));
          return;
        }

        const contentType = result.headers['content-type'] || 'application/xml';

        feedCache.set(cacheKey, {
          content: result.body,
          contentType: contentType,
          timestamp: Date.now()
        });

        res.writeHead(result.statusCode, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
        res.end(result.body);
      } catch (e) {
        console.error(`[Feed Fetch Error] ID: ${feedId} | ${e.message}`);
        if (!res.headersSent) {
          const isTimeout = e.message.includes('超时');
          res.writeHead(isTimeout ? 504 : 502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: isTimeout ? 'Fetch timeout' : 'Fetch failed', details: e.message }));
        }
      }
    }).catch((err) => {
      console.error(`[Feed Validation Error] ID: ${feedId} | ${err.message}`);
      if (!res.headersSent) {
        const status = err.code === 'PRIVATE_HOST' ? 403 : 502;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    return;
  }

  // === API: Image Proxy ===
  if (parsedUrl.pathname.startsWith('/api/image')) {
    const imageUrl = parsedUrl.query.url;
    if (!imageUrl || typeof imageUrl !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image URL parameter is required' }));
      return;
    }

    const parsedImage = safeParseUrl(imageUrl);
    if (!parsedImage || !parsedImage.hostname) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid image URL' }));
      return;
    }

    const imageHost = parsedImage.hostname.toLowerCase();

    // Build a set of all allowed image hosts based on configured feeds
    const allowedHosts = new Set();
    for (const feed of FEEDS_CONFIG) {
      const hosts = inferAllowedImageHosts(feed.url || '');
      hosts.forEach(h => allowedHosts.add(h));
    }

    if (!allowedHosts.has(imageHost)) {
      console.error(`[Image Proxy] Blocked image host: ${imageHost}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image host is not allowed by server configuration' }));
      return;
    }

    resolveAndValidateHost(parsedImage.hostname).then(() => {
      streamWithProxy(parsedImage.toString(), { timeout: 20000 }, res, (statusCode, errMsg) => {
        console.error(`[Image Proxy] Error for ${imageUrl}: ${statusCode} ${errMsg || ''}`);
        if (!res.headersSent) {
          res.writeHead(statusCode || 502);
          res.end();
        }
      });
    }).catch((err) => {
      console.error(`[Image Proxy Validation Error] URL: ${imageUrl} | ${err.message}`);
      if (!res.headersSent) {
        const status = err.code === 'PRIVATE_HOST' ? 403 : 502;
        res.writeHead(status);
        res.end();
      }
    });

    return;
  }

  // === API: Media Proxy (通用媒体代理，支持图片/视频等) ===
  if (parsedUrl.pathname === '/api/media/proxy') {
    const mediaUrl = parsedUrl.query.url;
    if (!mediaUrl || typeof mediaUrl !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'URL parameter is required' }));
      return;
    }

    const parsedMedia = safeParseUrl(mediaUrl);
    if (!parsedMedia || !parsedMedia.hostname) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid media URL' }));
      return;
    }

    // 协议限制：仅允许 http/https
    if (parsedMedia.protocol !== 'http:' && parsedMedia.protocol !== 'https:') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Only http/https URLs can be proxied' }));
      return;
    }

    // 限流检查
    const clientIp = normalizeClientIp(req);
    if (checkMediaProxyRateLimit(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many media proxy requests' }));
      return;
    }

    // 域名白名单检查
    const allowedMediaHosts = getAllowedMediaHosts();
    const mediaHost = parsedMedia.hostname.toLowerCase();
    if (!allowedMediaHosts.has(mediaHost)) {
      console.error(`[Media Proxy] Blocked media host: ${mediaHost}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Media host is not allowed by server configuration' }));
      return;
    }

    // 安全检查：验证主机不是私有地址，并获取解析后的IP
    resolveAndValidateHost(parsedMedia.hostname).then((resolvedIp) => {
      streamWithProxy(parsedMedia.toString(), { 
        timeout: 30000,
        cacheControl: 'public, max-age=86400',
        resolvedAddress: resolvedIp,
        maxBytes: MEDIA_PROXY_MAX_BYTES
      }, res, (statusCode, errMsg) => {
        console.error(`[Media Proxy] Error for ${mediaUrl}: ${statusCode} ${errMsg || ''}`);
        if (!res.headersSent) {
          const status = statusCode || 502;
          res.writeHead(status, status === 413 ? { 'Content-Type': 'application/json' } : undefined);
          if (status === 413) {
            res.end(JSON.stringify({ error: 'Media exceeds configured size limit' }));
          } else {
            res.end();
          }
        }
      });
    }).catch((err) => {
      console.error(`[Media Proxy Validation Error] URL: ${mediaUrl} | ${err.message}`);
      if (!res.headersSent) {
        const status = err.code === 'PRIVATE_HOST' ? 403 : 502;
        res.writeHead(status);
        res.end();
      }
    });

    return;
  }

  // === Static Files ===
  let filePath = path.join(STATIC_PATH, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(STATIC_PATH) + path.sep)) {
    filePath = path.join(STATIC_PATH, 'index.html');
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(STATIC_PATH, 'index.html');
  }
  const extname = path.extname(filePath);
  const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.tsx': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code == 'ENOENT') {
        const index_path = path.join(STATIC_PATH, 'index.html');
        fs.readFile(index_path, (err, c) => {
          if (err) {
            res.writeHead(500); res.end('Internal Server Error');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
            res.end(c, 'utf-8');
          }
        });
      }
      else {
        res.writeHead(500); res.end('Internal Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[extname] || 'application/octet-stream', 'Cache-Control': extname === '.html' ? 'no-cache' : 'public, max-age=86400' });
      res.end(content, 'utf-8');
    }
  });
});

// Load initial feed configuration and history at startup
loadFeeds();
initDatabase();
migrateHistoryToDatabase();
loadHistory();

server.listen(PORT, '0.0.0.0', () => {
  console.log('--- Running Updated Server Code (v3 - 可选代理架构) ---');
  console.log('[OK] Server running at http://localhost:' + PORT + '/');
  console.log('[OK] Data will be stored in: ' + DATA_FILE);
  console.log('[OK] History database: ' + HISTORY_DB_FILE);
  console.log('[OK] Upstream Proxy: ' + (isProxyEnabled() ? '(已配置，通过代理访问外部资源)' : '(未配置，直接连接)'));
  console.log('[OK] Admin Secret: ' + (ADMIN_SECRET ? '(已配置)' : '(未配置，管理接口不可用)'));
  console.log('[Security] Admin APIs restricted to localhost only (use SSH tunnel for remote access)');
  console.log('[OK] Feed Caching enabled with ' + (CACHE_TTL_MS / 60000) + ' minute TTL.');
});
