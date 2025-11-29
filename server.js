
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// --- Configuration ---
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'feeds.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const STATIC_PATH = path.join(__dirname, 'dist'); // Serve from the 'dist' folder
// 管理接口密钥：必须从环境变量读取，未设置则管理接口不可用
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

// 代理配置：支持通过环境变量自定义，默认指向本地 Clash
const PROXY_CONFIG = {
  host: process.env.PROXY_HOST || '127.0.0.1',
  port: Number(process.env.PROXY_PORT) || 7890
};

// --- Caching Configuration ---
const feedCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- In-memory store for feeds config ---
let FEEDS_CONFIG = [];

// --- In-memory store for article history ---
let FEED_HISTORY = {};

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
  if (!fs.existsSync(HISTORY_FILE)) {
    console.log(`[Init] History file not found. Creating empty at: ${HISTORY_FILE}`);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({}, null, 2));
    FEED_HISTORY = {};
    return;
  }
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    if (!data.trim()) {
      FEED_HISTORY = {};
      return;
    }
    FEED_HISTORY = JSON.parse(data);
    const feedCount = Object.keys(FEED_HISTORY).length;
    const totalItems = Object.values(FEED_HISTORY).reduce((sum, f) => sum + (f.items?.length || 0), 0);
    console.log(`[Init] Loaded history: ${feedCount} feeds, ${totalItems} total items`);
  } catch (e) {
    console.error("Error reading history.json:", e);
    FEED_HISTORY = {};
  }
};

// --- Helper: Save History to disk ---
const saveHistory = () => {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(FEED_HISTORY, null, 2));
  } catch (e) {
    console.error("Error saving history.json:", e);
  }
};

// --- Helper: Merge items into history (dedup by guid/link) ---
// 历史记录保留策略：只保留最近 2 个月的消息
const HISTORY_RETENTION_DAYS = 60; // 2 个月

const mergeHistoryItems = (feedId, newItems) => {
  const existing = FEED_HISTORY[feedId]?.items || [];
  
  // Build a map keyed by guid (fallback to link)
  const itemMap = new Map();
  for (const item of existing) {
    const key = item.guid || item.link;
    if (key) itemMap.set(key, item);
  }
  
  // Merge new items (newer data overwrites)
  let addedCount = 0;
  for (const item of newItems) {
    const key = item.guid || item.link;
    if (key) {
      if (!itemMap.has(key)) addedCount++;
      itemMap.set(key, item);
    }
  }
  
  // Convert back to array and sort by pubDate (newest first)
  let merged = Array.from(itemMap.values());
  merged.sort((a, b) => {
    const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return dateB - dateA; // Descending
  });
  
  // 过滤：只保留最近 2 个月的消息
  const cutoffTime = Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const beforeFilter = merged.length;
  merged = merged.filter(item => {
    const pubTime = item.pubDate ? new Date(item.pubDate).getTime() : 0;
    // 如果没有发布时间，保守起见保留（避免误删）
    return pubTime === 0 || pubTime >= cutoffTime;
  });
  const expiredCount = beforeFilter - merged.length;
  
  FEED_HISTORY[feedId] = {
    items: merged,
    lastUpdated: Date.now()
  };
  
  return { total: merged.length, added: addedCount, expired: expiredCount };
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
  const parsedUrl = url.parse(req.url, true);

  // === API: Get Feed List (Public - Hides URL) ===
  if (parsedUrl.pathname === '/api/feeds/list' && req.method === 'GET') {
    const safeFeeds = FEEDS_CONFIG.map(f => ({
      id: f.id,
      category: f.category,
      isSub: f.isSub || false,
      customTitle: f.customTitle || ''
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(safeFeeds));
    return;
  }

  // === API: Get FULL Feed List (Protected + Localhost Only) ===
  if (parsedUrl.pathname === '/api/feeds/list/all' && req.method === 'GET') {
    // 安全限制：只允许本机访问
    if (!isLocalRequest(req)) {
      console.log(`[Security] Blocked external access to /api/feeds/list/all from ${req.socket.remoteAddress}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Admin API is only accessible from localhost' }));
      return;
    }
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

  // === API: Add/Update Feed (Protected + Localhost Only) ===
  if (parsedUrl.pathname === '/api/feeds/add' && req.method === 'POST') {
    // 安全限制：只允许本机访问
    if (!isLocalRequest(req)) {
      console.log(`[Security] Blocked external access to /api/feeds/add from ${req.socket.remoteAddress}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Admin API is only accessible from localhost' }));
      return;
    }
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

  // === API: Delete Feed (Protected + Localhost Only) ===
  if (parsedUrl.pathname === '/api/feeds/delete' && req.method === 'POST') {
    // 安全限制：只允许本机访问
    if (!isLocalRequest(req)) {
      console.log(`[Security] Blocked external access to /api/feeds/delete from ${req.socket.remoteAddress}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Admin API is only accessible from localhost' }));
      return;
    }
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

  // === API: Reorder Feeds (Protected + Localhost Only) ===
  if (parsedUrl.pathname === '/api/feeds/reorder' && req.method === 'POST') {
    // 安全限制：只允许本机访问
    if (!isLocalRequest(req)) {
      console.log(`[Security] Blocked external access to /api/feeds/reorder from ${req.socket.remoteAddress}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Admin API is only accessible from localhost' }));
      return;
    }
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
        saveHistory();
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

    if (!feedId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing id parameter' }));
      return;
    }

    const history = FEED_HISTORY[feedId];
    if (!history) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ feedId, items: [], lastUpdated: null }));
      return;
    }

    let items = history.items || [];
    if (limit > 0) {
      items = items.slice(0, limit);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      feedId,
      items,
      lastUpdated: history.lastUpdated
    }));
    return;
  }

  // === API: RSS Proxy with Caching ===
  if (parsedUrl.pathname.startsWith('/api/feed')) {
    const feedId = parsedUrl.query.id;

    const cached = feedCache.get(feedId);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      console.log(`[Cache HIT] ID: ${feedId}`);
      res.writeHead(200, { 'Content-Type': cached.contentType, 'Access-Control-Allow-Origin': '*' });
      res.end(cached.content);
      return;
    }
    console.log(`[Cache MISS] ID: ${feedId}`);

    const feedConfig = FEEDS_CONFIG.find(f => f.id === feedId);
    const targetUrl = feedConfig ? feedConfig.url : (feedId.startsWith('http') ? feedId : null);

    if (!targetUrl) {
      console.error(`[Server Error] ID Not Found: ${feedId}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Feed ID '${feedId}' not found on server` }));
      return;
    }

    const targetUrlObj = url.parse(targetUrl);
    const proxyOptions = {
      hostname: PROXY_CONFIG.host, port: PROXY_CONFIG.port, path: targetUrl, method: 'GET',
      headers: { 'Host': targetUrlObj.host, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
      timeout: 15000
    };

    const proxyReq = http.request(proxyOptions, (proxyRes) => {
      console.log(`[Proxy Success] ID: ${feedId} | Upstream Status: ${proxyRes.statusCode}`);
      if (proxyRes.statusCode >= 400) {
        let body = '';
        proxyRes.on('data', chunk => body += chunk);
        proxyRes.on('end', () => {
          res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Upstream error for ID '${feedId}'`, status: proxyRes.statusCode, body: body.substring(0, 200) }));
        });
        return;
      }

      const chunks = [];
      proxyRes.on('data', chunk => chunks.push(chunk));
      proxyRes.on('end', () => {
        const content = Buffer.concat(chunks);
        const contentType = proxyRes.headers['content-type'] || 'application/xml';

        feedCache.set(feedId, {
          content: content,
          contentType: contentType,
          timestamp: Date.now()
        });

        res.writeHead(proxyRes.statusCode, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
        res.end(content);
      });
    });

    proxyReq.on('error', (e) => {
      console.error(`[Proxy Error] ID: ${feedId} | ${e.message}`);
      if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Proxy fetch failed', details: e.message })); }
    });
    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) { res.writeHead(504, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Proxy timeout' })); }
    });
    proxyReq.end();
    return;
  }

  // === API: Image Proxy ===
  if (parsedUrl.pathname.startsWith('/api/image')) {
    // ... (rest of the function is unchanged)
    const imageUrl = parsedUrl.query.url;
    if (!imageUrl || typeof imageUrl !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image URL parameter is required' }));
      return;
    }

    const targetUrlObj = url.parse(imageUrl);
    const proxyOptions = {
      hostname: PROXY_CONFIG.host, port: PROXY_CONFIG.port, path: imageUrl, method: 'GET',
      headers: { 'Host': targetUrlObj.host, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', 'Referer': targetUrlObj.protocol + '//' + targetUrlObj.host },
      timeout: 20000
    };

    const proxyReq = http.request(proxyOptions, (proxyRes) => {
      if (proxyRes.statusCode >= 400) {
        console.error(`[Image Proxy] Upstream error for ${imageUrl}: ${proxyRes.statusCode}`);
        res.writeHead(proxyRes.statusCode); res.end(); return;
      }
      res.writeHead(proxyRes.statusCode, { 'Content-Type': proxyRes.headers['content-type'] || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      console.error(`[Image Proxy] Error fetching ${imageUrl}: ${e.message}`);
      if (!res.headersSent) { res.writeHead(502); res.end(); }
    });
    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) { res.writeHead(504); res.end(); }
    });
    proxyReq.end();
    return;
  }

  // === Static Files ===
  let filePath = path.join(STATIC_PATH, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
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
loadHistory();

server.listen(PORT, '0.0.0.0', () => {
  console.log('--- Running Updated Server Code (v2) ---');
  console.log(`[OK] Server running at http://localhost:${PORT}/`);
  console.log(`[OK] Data will be stored in: ${DATA_FILE}`);
  console.log(`[OK] Proxy target: ${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
  console.log(`[OK] Admin Secret: ${ADMIN_SECRET ? '(已配置)' : '(未配置，管理接口不可用)'}`);
  console.log(`[Security] Admin APIs restricted to localhost only (use SSH tunnel for remote access)`);
  console.log(`[OK] Feed Caching enabled with ${CACHE_TTL_MS / 60000} minute TTL.`);
});
