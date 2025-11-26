
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// --- 1. 配置 RSS 映射 (前端不可见) ---
const FEED_MAP = {
  'bang_dream_info': 'http://server.sallyn.site:1200/twitter/user/bang_dream_info?readable=1',
  'bang_dream_mygo': 'http://server.sallyn.site:1200/twitter/user/bang_dream_mygo?readable=1',
  'bdp_avemujica': 'http://server.sallyn.site:1200/twitter/user/BDP_AveMujica?readable=1',
  'imas_official': 'http://server.sallyn.site:1200/twitter/user/imas_official?readable=1',
  'shinyc_official': 'http://server.sallyn.site:1200/twitter/user/shinyc_official?readable=1',
  'gkmas_official': 'http://server.sallyn.site:1200/twitter/user/gkmas_official?readable=1'
};

// --- 2. 代理配置 (宿主机 Clash) ---
const PROXY_CONFIG = {
  host: '127.0.0.1',
  port: 7890
};

const PORT = 3000;
const STATIC_PATH = path.join(__dirname, 'dist');

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // === API 路由: /api/feed 或 /api/feed/ ===
  if (parsedUrl.pathname.startsWith('/api/feed')) {
    const feedId = parsedUrl.query.id;
    const targetUrl = FEED_MAP[feedId];

    if (!targetUrl) {
      console.error(`[Server Error] ID Not Found: ${feedId}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Feed ID '${feedId}' not found on server` }));
      return;
    }

    const targetUrlObj = url.parse(targetUrl);
    
    const proxyOptions = {
      hostname: PROXY_CONFIG.host,
      port: PROXY_CONFIG.port,
      path: targetUrl,
      method: 'GET',
      headers: {
        'Host': targetUrlObj.host,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      },
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
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/xml',
        'Access-Control-Allow-Origin': '*'
      });
      proxyRes.pipe(res);
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

  // === NEW API 路由: /api/image ===
  if (parsedUrl.pathname.startsWith('/api/image')) {
    const imageUrl = parsedUrl.query.url;
    if (!imageUrl || typeof imageUrl !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image URL parameter is required' }));
      return;
    }

    const targetUrlObj = url.parse(imageUrl);
    const proxyOptions = {
      hostname: PROXY_CONFIG.host,
      port: PROXY_CONFIG.port,
      path: imageUrl,
      method: 'GET',
      headers: {
        'Host': targetUrlObj.host,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Referer': targetUrlObj.protocol + '//' + targetUrlObj.host
      },
      timeout: 20000 // Longer timeout for images
    };

    const proxyReq = http.request(proxyOptions, (proxyRes) => {
      if (proxyRes.statusCode >= 400) {
        console.error(`[Image Proxy] Upstream error for ${imageUrl}: ${proxyRes.statusCode}`);
        res.writeHead(proxyRes.statusCode);
        res.end();
        return;
      }
      // Set cache headers to allow browsers to cache images for 1 day
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400'
      });
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

  // === 静态文件服务 ===
  let filePath = path.join(STATIC_PATH, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
  if (!fs.existsSync(filePath)) {
      filePath = path.join(STATIC_PATH, 'index.html');
  }
  const extname = path.extname(filePath);
  const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(500); res.end('Internal Server Error');
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[extname] || 'application/octet-stream', 'Cache-Control': extname === '.html' ? 'no-cache' : 'public, max-age=86400' });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Proxy target: ${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
});
