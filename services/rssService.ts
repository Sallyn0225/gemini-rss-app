

import { Feed, Article, ImageProxyMode } from '../types';

const RSS2JSON_API = 'https://api.rss2json.com/v1/api.json?rss_url=';
const ALL_ORIGINS_API = 'https://api.allorigins.win/get?url=';
const ALL_ORIGINS_RAW = 'https://api.allorigins.win/raw?url=';
const CORS_PROXY = 'https://corsproxy.io/?';
const CODETABS_PROXY = 'https://api.codetabs.com/v1/proxy?quest=';
const THING_PROXY = 'https://thingproxy.freeboard.io/fetch/';

// --- Image Proxy Mode Management ---
let currentImageProxyMode: ImageProxyMode = 'all';

export const setImageProxyMode = (mode: ImageProxyMode): void => {
  currentImageProxyMode = mode;
};

export const getImageProxyMode = (): ImageProxyMode => {
  return currentImageProxyMode;
};

// Check if URL is a Twitter image
const isTwitterImage = (url: string): boolean => {
  return /twimg\.com|pbs\.twimg\.com|abs\.twimg\.com/i.test(url);
};

// Helper to proxy image URLs through our backend (respects user's proxy mode setting)
export const proxyImageUrl = (url: string, forceProxy: boolean = false): string => {
  if (!url || !url.startsWith('http')) {
    return url; // Return empty or relative URLs as is
  }

  // If force proxy is requested (e.g., for thumbnails in list view), always proxy
  if (forceProxy) {
    return `/api/image?url=${encodeURIComponent(url)}`;
  }

  // Apply user's proxy mode preference
  switch (currentImageProxyMode) {
    case 'none':
      return url; // Direct connection, no proxy
    case 'twitter-only':
      return isTwitterImage(url) ? `/api/image?url=${encodeURIComponent(url)}` : url;
    case 'all':
    default:
      return `/api/image?url=${encodeURIComponent(url)}`;
  }
};

// --- New: Fetch Feed Configuration from Server ---
export interface SystemFeedConfig {
  id: string;
  category: string;
  isSub: boolean;
  customTitle?: string;
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
  const response = await fetch('/api/feeds/list/all', {
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
  fetch('/api/history/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedId, items }),
  }).then(res => {
    if (res.ok) return res.json();
    throw new Error('Upsert failed');
  }).then(data => {
    if (data.added > 0) {
      console.log(`[History] Saved ${data.added} new items for "${feedId}", total: ${data.total}`);
    }
  }).catch(e => {
    console.warn(`[History] Failed to upsert for "${feedId}":`, e);
  });
};

// Fetch history from server
export const fetchHistory = async (feedId: string, limit?: number): Promise<Article[]> => {
  const params = new URLSearchParams({ id: feedId });
  if (limit) params.set('limit', String(limit));

  const res = await fetch(`/api/history/get?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to load history');
  const data = await res.json();
  return data.items as Article[];
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

  let image = '';
  const imgNode = channel.querySelector('image url') || channel.querySelector('icon') || channel.querySelector('logo');
  if (imgNode) image = imgNode.textContent || '';

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

    let thumbnail = '';

    const mediaNodes = entry.getElementsByTagNameNS('*', 'content');
    if (mediaNodes.length > 0) {
      for (let i = 0; i < mediaNodes.length; i++) {
        const url = mediaNodes[i].getAttribute('url');
        if (url && (url.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
          thumbnail = url; break;
        }
      }
    }

    if (!thumbnail) {
      const mediaThumb = entry.getElementsByTagNameNS('*', 'thumbnail');
      if (mediaThumb.length > 0 && mediaThumb[0].getAttribute('url')) {
        thumbnail = mediaThumb[0].getAttribute('url')!;
      }
    }

    let enclosure = { link: '', type: '' };
    const encNode = entry.querySelector('enclosure');
    if (encNode) {
      enclosure = { link: encNode.getAttribute('url') || '', type: encNode.getAttribute('type') || '' };
      if (!thumbnail && enclosure.type.startsWith('image')) {
        thumbnail = enclosure.link;
      }
    }

    if (!thumbnail) thumbnail = extractImageFromHtml(content || desc);

    items.push({
      title: entryTitle, pubDate, link, guid, author,
      thumbnail: proxyImageUrl(thumbnail), // PROXY
      description: desc, content, enclosure, feedTitle: title
    });
  });

  return {
    url, title, description,
    image: proxyImageUrl(image), // PROXY
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
        image: proxyImageUrl(data.feed.image), // PROXY
        items: data.items.map((item: any) => {
          let thumbnail = item.thumbnail;
          if (!thumbnail && item.enclosure?.type?.startsWith('image/')) thumbnail = item.enclosure.link;
          if (!thumbnail) thumbnail = extractImageFromHtml(item.content || item.description);
          return {
            ...item,
            thumbnail: proxyImageUrl(thumbnail), // PROXY
            feedTitle: data.feed.title
          };
        }),
      };
    }
  } catch (e) { console.warn(`RSS2JSON failed for ${url}`); }

  throw new Error(`All fetch methods failed for ${url}`);
};
