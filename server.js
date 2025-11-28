
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// --- Configuration ---
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'feeds.json');
const STATIC_PATH = path.join(__dirname, 'dist'); // Serve from the 'dist' folder
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123'; // Default secret if not set

const PROXY_CONFIG = {
  host: '127.0.0.1',
  port: 7890
};

// --- Caching Configuration ---
const feedCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- In-memory store for feeds config ---
let FEEDS_CONFIG = [];

// --- Default Feeds (Fallback/Initial) ---
const DEFAULT_FEEDS = [
  { id: 'bang_dream_info', url: 'http://server.sallyn.site:1200/twitter/user/bang_dream_info?readable=1', category: 'BanG Dream Project', isSub: false, customTitle: '' },
  { id: 'bang_dream_mygo', url: 'http://server.sallyn.site:1200/twitter/user/bang_dream_mygo?readable=1', category: 'BanG Dream Project', isSub: true, customTitle: '' },
  { id: 'bdp_avemujica', url: 'http://server.sallyn.site:1200/twitter/user/BDP_AveMujica?readable=1', category: 'BanG Dream Project', isSub: true, customTitle: '' },
  { id: 'imas_official', url: 'http://server.sallyn.site:1200/twitter/user/imas_official?readable=1', category: 'iDOLM@STER Project', isSub: false, customTitle: '' },
  { id: 'shinyc_official', url: 'http://server.sallyn.site:1200/twitter/user/shinyc_official?readable=1', category: 'iDOLM@STER Project', isSub: true, customTitle: '' },
  { id: 'gkmas_official', url: 'http://server.sallyn.site:1200/twitter/user/gkmas_official?readable=1', category: 'iDOLM@STER Project', isSub: true, customTitle: '' }
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

  // === API: Get FULL Feed List (Protected) ===
  if (parsedUrl.pathname === '/api/feeds/list/all' && req.method === 'GET') {
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
    // ... (rest of the function is unchanged)
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
    // ... (rest of the function is unchanged)
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

// Load initial feed configuration at startup
loadFeeds();

server.listen(PORT, '0.0.0.0', () => {
  console.log('--- Running Updated Server Code (v2) ---');
  console.log(`[OK] Server running at http://localhost:${PORT}/`);
  console.log(`[OK] Data will be stored in: ${DATA_FILE}`);
  console.log(`[OK] Proxy target: ${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
  console.log(`[OK] Admin Secret: ${ADMIN_SECRET.substring(0, 3)}***`);
  console.log(`[OK] Feed Caching enabled with ${CACHE_TTL_MS / 60000} minute TTL.`);
});
