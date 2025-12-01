/**
 * proxyUtils.js - 统一的代理配置和HTTP请求工具
 * 
 * 通过环境变量 UPSTREAM_PROXY 控制是否使用代理：
 * - 设置时（如 http://127.0.0.1:7890）：所有外部请求通过该代理
 * - 不设置时：直接连接，适用于海外服务器
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// --- 从环境变量读取代理配置 ---
// 格式: http://host:port 或 http://user:pass@host:port
const UPSTREAM_PROXY = process.env.UPSTREAM_PROXY || null;

let proxyConfig = null;

if (UPSTREAM_PROXY) {
  try {
    const proxyUrl = new URL(UPSTREAM_PROXY);
    proxyConfig = {
      host: proxyUrl.hostname,
      port: parseInt(proxyUrl.port, 10) || (proxyUrl.protocol === 'https:' ? 443 : 80),
      protocol: proxyUrl.protocol,
      auth: proxyUrl.username ? `${proxyUrl.username}:${proxyUrl.password}` : null
    };
    console.log(`[ProxyUtils] 代理已配置: ${proxyConfig.host}:${proxyConfig.port}`);
  } catch (e) {
    console.error(`[ProxyUtils] 无效的代理URL: ${UPSTREAM_PROXY}`, e.message);
  }
} else {
  console.log('[ProxyUtils] 未配置代理，将直接连接');
}

/**
 * 检查是否启用了代理
 */
function isProxyEnabled() {
  return proxyConfig !== null;
}

/**
 * 获取代理配置（如果有）
 */
function getProxyConfig() {
  return proxyConfig;
}

/**
 * 构建HTTP请求选项
 * @param {string} targetUrl - 目标URL
 * @param {object} options - 额外选项 (method, headers, timeout, resolvedAddress等)
 * @returns {object} - 可用于 http.request 的选项对象
 */
function buildRequestOptions(targetUrl, options = {}) {
  const target = new URL(targetUrl);
  const isHttps = target.protocol === 'https:';
  const {
    method = 'GET',
    headers = {},
    timeout = 15000,
    userAgent,
    resolvedAddress
  } = options;

  const normalizedHeaders = {
    'Host': target.host,
    'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    ...headers
  };

  if (proxyConfig) {
    // 通过代理请求
    return {
      hostname: proxyConfig.host,
      port: proxyConfig.port,
      path: targetUrl,
      method,
      headers: normalizedHeaders,
      timeout
    };
  }

  // 直连模式：使用解析后的IP地址（防止DNS重绑定攻击）
  const destinationHost = resolvedAddress || target.hostname;
  const directOptions = {
    hostname: destinationHost,
    port: target.port || (isHttps ? 443 : 80),
    path: target.pathname + target.search,
    method,
    headers: normalizedHeaders,
    timeout
  };

  // HTTPS直连时需要设置SNI
  if (isHttps && resolvedAddress) {
    directOptions.servername = target.hostname;
  }

  return directOptions;
}

/**
 * 发起HTTP请求（支持代理和直连）
 * @param {string} targetUrl - 目标URL
 * @param {object} options - 请求选项
 * @returns {Promise<{statusCode: number, headers: object, body: Buffer}>}
 */
function fetchWithProxy(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const isHttps = target.protocol === 'https:';
    
    const requestOptions = buildRequestOptions(targetUrl, options);
    
    // 选择协议：代理模式统一用 http（代理服务器处理 HTTPS），直连根据目标协议
    const protocol = proxyConfig ? http : (isHttps ? https : http);
    
    const req = protocol.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });

    req.on('error', (e) => {
      reject(new Error(`请求失败: ${e.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * 发起流式HTTP请求（用于媒体代理，直接pipe到响应）
 * @param {string} targetUrl - 目标URL
 * @param {object} options - 请求选项 (timeout, cacheControl, resolvedAddress, maxBytes)
 * @param {object} res - Express/http响应对象，用于pipe
 * @param {function} onError - 错误回调
 */
function streamWithProxy(targetUrl, options = {}, res, onError) {
  const target = new URL(targetUrl);
  const isHttps = target.protocol === 'https:';
  const { maxBytes, resolvedAddress, ...restOptions } = options;
  
  const requestOptions = buildRequestOptions(targetUrl, {
    ...restOptions,
    resolvedAddress,
    timeout: options.timeout || 30000
  });
  
  // 添加 Referer 头以防止防盗链
  if (!requestOptions.headers.Referer) {
    requestOptions.headers.Referer = `${target.protocol}//${target.host}`;
  }
  
  const protocol = proxyConfig ? http : (isHttps ? https : http);
  
  const proxyReq = protocol.request(requestOptions, (proxyRes) => {
    if (proxyRes.statusCode >= 400) {
      if (onError) onError(proxyRes.statusCode);
      return;
    }

    // 检查 Content-Length 是否超过限制
    const declaredLength = parseInt(proxyRes.headers['content-length'] || '0', 10);
    if (maxBytes && declaredLength && declaredLength > maxBytes) {
      proxyReq.destroy();
      proxyRes.resume(); // 清空响应流
      if (onError) onError(413, 'Media exceeds configured size limit');
      return;
    }

    // 设置响应头
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
      'Content-Length': proxyRes.headers['content-length'],
      'Cache-Control': options.cacheControl || 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });

    // 流式传输时监控累计大小
    let transferred = 0;
    let exceeded = false;
    if (maxBytes) {
      proxyRes.on('data', (chunk) => {
        if (exceeded) return;
        transferred += chunk.length;
        if (transferred > maxBytes) {
          exceeded = true;
          proxyReq.destroy();
          proxyRes.destroy();
          if (!res.headersSent) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Media exceeds configured size limit' }));
          } else {
            res.destroy();
          }
          if (onError) onError(413, 'Media exceeds configured size limit');
        }
      });
    }
    
    // 流式传输
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error(`[streamWithProxy] 错误: ${e.message}`);
    if (onError) onError(502, e.message);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (onError) onError(504, '请求超时');
  });

  proxyReq.end();
}

/**
 * 生成媒体代理URL
 * @param {string} originalUrl - 原始媒体URL
 * @returns {string} - 代理URL路径
 */
function buildProxiedMediaUrl(originalUrl) {
  if (!originalUrl || !originalUrl.startsWith('http')) {
    return originalUrl;
  }
  return `/api/media/proxy?url=${encodeURIComponent(originalUrl)}`;
}

module.exports = {
  isProxyEnabled,
  getProxyConfig,
  buildRequestOptions,
  fetchWithProxy,
  streamWithProxy,
  buildProxiedMediaUrl,
  UPSTREAM_PROXY
};
