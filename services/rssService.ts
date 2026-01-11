

import { Feed, Article, ImageProxyMode, MediaUrl, createMediaUrl, selectMediaUrl } from '../types';

const RSS2JSON_API = 'https://api.rss2json.com/v1/api.json?rss_url=';
const ALL_ORIGINS_RAW = 'https://api.allorigins.win/raw?url=';

const CORS_PROXY = 'https://corsproxy.io/?';
const CODETABS_PROXY = 'https://api.codetabs.com/v1/proxy?quest=';
const THING_PROXY = 'https://thingproxy.freeboard.io/fetch/';

// --- Image Proxy Mode Management ---
// 代理模式：
// - 'all': 全部代理（RSS内容 + 媒体都通过服务器加载）
// - 'media_only': 仅代理媒体（RSS内容直连，图片/视频通过服务器加载）
// - 'none': 不代理（全部从用户浏览器直连，不消耗服务器流量）
let currentImageProxyMode: ImageProxyMode = 'all';
let currentFeedCanProxyImages: boolean = true;

export const setImageProxyMode = (mode: ImageProxyMode): void => {
  currentImageProxyMode = mode;
};

export const getImageProxyMode = (): ImageProxyMode => {
  return currentImageProxyMode;
};

export const setCurrentFeedCanProxyImages = (canProxy: boolean): void => {
  currentFeedCanProxyImages = canProxy;
};

/**
 * 根据当前代理模式从MediaUrl中选择合适的URL
 * @param media - MediaUrl对象
 * @returns 选择后的URL字符串
 */
export const getMediaUrl = (media: MediaUrl | string | undefined): string => {
  return selectMediaUrl(media, currentImageProxyMode);
};

/**
 * @deprecated 请使用 selectMediaUrl 或 getMediaUrl 代替
 * 保留此函数用于向后兼容，处理富文本等需要运行时选择的场景
 */
export const proxyImageUrl = (url: string, _forceProxy: boolean = false): string => {
  if (!url || !url.startsWith('http')) {
    return url;
  }

  // 如果当前 feed 不在服务器图片代理白名单中，始终直连
  if (!currentFeedCanProxyImages) {
    return url;
  }

  // 根据用户代理模式偏好处理
  if (currentImageProxyMode === 'none') {
    return url;
  } else {
    return `/api/media/proxy?url=${encodeURIComponent(url)}`;
  }
};

// --- New: Fetch Feed Configuration from Server ---
export interface SystemFeedConfig {
  id: string;
  category: string;
  isSub: boolean;
  customTitle?: string;
  canProxyImages?: boolean;
  // URL is hidden by server
}

// New type for admin panel, includes the URL
export interface FullSystemFeedConfig extends SystemFeedConfig {
  url: string;
}

export const fetchSystemFeeds = async (): Promise<SystemFeedConfig[]> => {
  try {
    const response = await fetch('/api/feeds/list');
    if (!response.ok) throw new Error("Failed to load feed configuration");
    return await response.json();
  } catch (e) {
    console.error("Could not fetch system feeds:", e);
    return [];
  }
};

// New admin-only function to get all feed data
export const fetchAllSystemFeeds = async (secret: string): Promise<FullSystemFeedConfig[]> => {
  const response = await fetch('/api/feeds/list/admin', {
    method: 'POST',
    headers: {
      'x-admin-secret': secret
    }
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Failed to fetch full feed list");
  }
  return await response.json();
};


export const addSystemFeed = async (
  id: string,
  url: string,
  category: string,
  isSub: boolean,
  customTitle: string,
  secret: string
): Promise<void> => {
  const response = await fetch('/api/feeds/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': secret
    },
    body: JSON.stringify({ id, url, category, isSub, customTitle })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Failed to add or update feed");
  }
};

// New admin-only function to delete a feed
export const deleteSystemFeed = async (id: string, secret: string): Promise<void> => {
  const response = await fetch('/api/feeds/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': secret
    },
    body: JSON.stringify({ id })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Failed to delete feed");
  }
};

// New admin-only function to reorder feeds
export const reorderSystemFeeds = async (ids: string[], secret: string): Promise<void> => {
  const response = await fetch('/api/feeds/reorder', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': secret
    },
    body: JSON.stringify({ ids })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Failed to reorder feeds");
  }
};

// --- History API Functions ---

// Upload current items to server history (fire-and-forget, won't block UI)
const upsertHistory = (feedId: string, items: Article[]): void => {
  const maxAttempts = 3;
  const baseDelayMs = 500;

  const attemptUpsert = (attempt: number): void => {
    fetch('/api/history/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedId, items }),
    }).then(res => {
      if (res.ok) return res.json();
      throw new Error(`Upsert failed with status ${res.status}`);
    }).then(data => {
      if (data.added > 0) {
        console.log(`[History] Saved ${data.added} new items for "${feedId}", total: ${data.total}`);
      }
    }).catch(e => {
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        setTimeout(() => attemptUpsert(attempt + 1), delay);
        return;
      }
      console.warn(`[History] Failed to upsert for "${feedId}" after ${maxAttempts} attempts:`, e);
    });
  };

  attemptUpsert(1);
};


// Fetch history from server
export const fetchHistory = async (feedId: string, limit?: number, offset?: number): Promise<{items: Article[], total: number}> => {
  const params = new URLSearchParams({ id: feedId });
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));

  const res = await fetch(`/api/history/get?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to load history');
  const data = await res.json();
  return { items: data.items as Article[], total: data.total };
};

// Helper to extract image from HTML content safely and robustly
const extractImageFromHtml = (html: string): string => {
  if (!html) return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const imgs = doc.querySelectorAll('img[src]');
    for (let i = 0; i < imgs.length; i++) {
      const src = imgs[i].getAttribute('src');
      if (src && !src.includes('pixel') && !src.includes('smilies') && !src.includes('emoji')) {
        return src;
      }
    }

    const video = doc.querySelector('video[poster]');
    if (video) return video.getAttribute('poster') || '';

    return '';
  } catch (e) {
    const match = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
    return match ? match[1] : '';
  }
};

const parseXML = (xmlText: string, url: string): Feed => {
  if (xmlText.trim().toLowerCase().startsWith('<!doctype html>')) {
    throw new Error('Received HTML instead of XML (likely blocked)');
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");

  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) throw new Error('XML Parse Error');

  const channel = xmlDoc.querySelector('channel') || xmlDoc.querySelector('feed');
  if (!channel) throw new Error('Invalid RSS/Atom feed structure');

  const title = channel.querySelector('title')?.textContent || 'Untitled Feed';
  const description = channel.querySelector('description, subtitle')?.textContent || '';

  // Feed 头像：生成双URL格式
  let imageUrl = '';
  const imgNode = channel.querySelector('image url') || channel.querySelector('icon') || channel.querySelector('logo');
  if (imgNode) imageUrl = imgNode.textContent || '';

  const items: Article[] = [];
  const entries = xmlDoc.querySelectorAll('item, entry');

  entries.forEach((entry) => {
    const entryTitle = entry.querySelector('title')?.textContent || 'No Title';
    const pubDate = entry.querySelector('pubDate, updated, published')?.textContent || '';
    const link = entry.querySelector('link')?.textContent || entry.querySelector('link')?.getAttribute('href') || '';
    const guid = entry.querySelector('guid, id')?.textContent || link;
    const author = entry.querySelector('author name, creator')?.textContent || '';

    const desc = entry.querySelector('description, summary')?.textContent || '';
    const contentEncoded = entry.getElementsByTagNameNS('*', 'encoded')[0]?.textContent;
    const content = contentEncoded || entry.querySelector('content')?.textContent || desc;

    // 提取缩略图原始URL
    let thumbnailUrl = '';

    const mediaNodes = entry.getElementsByTagNameNS('*', 'content');
    if (mediaNodes.length > 0) {
      for (let i = 0; i < mediaNodes.length; i++) {
        const nodeUrl = mediaNodes[i].getAttribute('url');
        if (nodeUrl && (nodeUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
          thumbnailUrl = nodeUrl; break;
        }
      }
    }

    if (!thumbnailUrl) {
      const mediaThumb = entry.getElementsByTagNameNS('*', 'thumbnail');
      if (mediaThumb.length > 0 && mediaThumb[0].getAttribute('url')) {
        thumbnailUrl = mediaThumb[0].getAttribute('url')!;
      }
    }

    let enclosure = { link: '', type: '' };
    const encNode = entry.querySelector('enclosure');
    if (encNode) {
      enclosure = { link: encNode.getAttribute('url') || '', type: encNode.getAttribute('type') || '' };
      if (!thumbnailUrl && enclosure.type.startsWith('image')) {
        thumbnailUrl = enclosure.link;
      }
    }

    if (!thumbnailUrl) thumbnailUrl = extractImageFromHtml(content || desc);

    // 生成双URL格式的缩略图
    items.push({
      title: entryTitle, pubDate, link, guid, author,
      thumbnail: createMediaUrl(thumbnailUrl),  // 双URL格式
      description: desc, content, enclosure, feedTitle: title
    });
  });

  return {
    url, title, description,
    image: createMediaUrl(imageUrl),  // 双URL格式
    items
  };
}

export const fetchRSS = async (urlOrId: string): Promise<Feed> => {
  const timestamp = Date.now(); // Cache buster

  // Check if it's a known System ID (no protocol) or a raw URL
  if (!urlOrId.startsWith('http')) {
    try {
      // Pass the ID to the proxy
      const response = await fetch(`/api/feed?id=${encodeURIComponent(urlOrId)}`);
      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(`Backend fetch failed: ${response.status} - ${errorJson.error || errorText}`);
        } catch { throw new Error(`Backend fetch failed: ${response.status} - ${errorText}`); }
      }
      const xmlText = await response.text();
      const feed = parseXML(xmlText, urlOrId);
      
      // Upload items to history (fire-and-forget)
      upsertHistory(urlOrId, feed.items);
      
      return feed;
    } catch (error) {
      console.error(`Internal Proxy failed for ID: ${urlOrId}`, error);
      throw error;
    }
  }

  const url = urlOrId;
  const strategies = [
    { name: 'CodeTabs', url: `${CODETABS_PROXY}${encodeURIComponent(url)}&_t=${timestamp}` },
    { name: 'AllOriginsRaw', url: `${ALL_ORIGINS_RAW}${encodeURIComponent(url)}&_t=${timestamp}` },
    { name: 'ThingProxy', url: `${THING_PROXY}${url}` },
    { name: 'CORSProxy', url: `${CORS_PROXY}${url}` },
  ];

  for (const strategy of strategies) {
    try {
      const response = await fetch(strategy.url);
      if (response.ok) {
        const xmlText = await response.text();
        return parseXML(xmlText, url);
      }
    } catch (e) { console.warn(`${strategy.name} failed for ${url}`); }
  }

  try {
    const response = await fetch(`${RSS2JSON_API}${encodeURIComponent(url)}`);
    const data = await response.json();
    if (data.status === 'ok') {
      return {
        url: url, title: data.feed.title, description: data.feed.description,
        image: createMediaUrl(data.feed.image || ''),  // 双URL格式
        items: data.items.map((item: any) => {
          let thumbnailUrl = item.thumbnail;
          if (!thumbnailUrl && item.enclosure?.type?.startsWith('image/')) thumbnailUrl = item.enclosure.link;
          if (!thumbnailUrl) thumbnailUrl = extractImageFromHtml(item.content || item.description);
          return {
            ...item,
            thumbnail: createMediaUrl(thumbnailUrl || ''),  // 双URL格式
            feedTitle: data.feed.title
          };
        }),
      };
    }
  } catch (e) { console.warn(`RSS2JSON failed for ${url}`); }

  throw new Error(`All fetch methods failed for ${url}`);
};
