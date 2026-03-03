

import { Feed, Article, FeedSummary } from '../types';
import { CORS_PROXIES } from '../src/services/corsProxy';

const RSS2JSON_API = 'https://api.rss2json.com/v1/api.json?rss_url=';

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

export const fetchFeedSummaries = async (): Promise<FeedSummary[]> => {
  try {
    const response = await fetch('/api/feeds/summary');
    if (!response.ok) throw new Error('Failed to load feed summaries');
    return await response.json();
  } catch (e) {
    console.error('Could not fetch feed summaries:', e);
    return [];
  }
};

// New admin-only function to get all feed data
export const fetchAllSystemFeeds = async (secret: string): Promise<FullSystemFeedConfig[]> => {
  // Use query param as fallback for routing
  const response = await fetch('/api/feeds/list/admin?admin=true', {
    method: 'POST',
    headers: {
      'x-admin-secret': secret
    }
  });
  if (!response.ok) {
    let errorMessage = "Failed to fetch full feed list";
    try {
      const err = await response.json() as { error?: string };
      errorMessage = err.error || errorMessage;
    } catch {
      // If it's not JSON, might be a raw error message
      const text = await response.text();
      if (text) errorMessage = text.substring(0, 100);
    }
    throw new Error(errorMessage);
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
    const err = await response.json() as { error?: string };
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
    const err = await response.json() as { error?: string };
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
    const err = await response.json() as { error?: string };
    throw new Error(err.error || "Failed to reorder feeds");
  }
};

// --- History API Functions ---

// Client-side dedup cache: feedId -> Set of article keys (guid or link)
const _upsertedKeys = new Map<string, Set<string>>();

const getArticleKey = (item: Article): string => item.guid || item.link || `${item.title}-${item.pubDate}`;

// Upload current items to server history (fire-and-forget, won't block UI)
// Filters out items already sent in previous calls to avoid redundant server work
const upsertHistory = (feedId: string, items: Article[]): void => {
  // Dedup: only send items we haven't sent before
  let knownKeys = _upsertedKeys.get(feedId);
  if (!knownKeys) {
    knownKeys = new Set();
    _upsertedKeys.set(feedId, knownKeys);
  }

  const newItems = items.filter(item => {
    const key = getArticleKey(item);
    if (knownKeys!.has(key)) return false;
    knownKeys!.add(key);
    return true;
  });

  if (newItems.length === 0) {
    console.log(`[History] No new items to upsert for "${feedId}"`);
    return;
  }

  // Strip content when it equals description to save bandwidth
  const payload = newItems.map(item => {
    if (item.content && item.content === item.description) {
      const { content: _content, ...rest } = item;
      return rest;
    }
    return item;
  });

  const maxAttempts = 3;
  const baseDelayMs = 500;

  const attemptUpsert = (attempt: number): void => {
    fetch('/api/history/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedId, items: payload }),
    }).then(res => {
      if (res.ok) return res.json();
      throw new Error(`Upsert failed with status ${res.status}`);
    }).then((data: { added?: number; total?: number }) => {
      if (data.added && data.added > 0) {
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
  const data = await res.json() as { items: Article[]; total: number };
  return { items: data.items, total: data.total };
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
  } catch {
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

  // Feed 头像
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

    // 提取缩略图URL
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

    items.push({
      title: entryTitle, pubDate, link, guid, author,
      thumbnail: thumbnailUrl || '',
      description: desc, content, enclosure, feedTitle: title
    });
  });

  return {
    url, title, description,
    image: imageUrl || '',
    items
  };
}

export const fetchRSS = async (urlOrId: string): Promise<Feed> => {
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
  const strategies = CORS_PROXIES.map(proxy => ({
    name: proxy.name,
    url: proxy.buildUrl(url),
  }));

  for (const strategy of strategies) {
    try {
      const response = await fetch(strategy.url);
      if (response.ok) {
        const xmlText = await response.text();
        return parseXML(xmlText, url);
      }
    } catch { console.warn(`${strategy.name} failed for ${url}`); }
  }

  try {
    const response = await fetch(`${RSS2JSON_API}${encodeURIComponent(url)}`);
    const data = await response.json() as { status: string; feed: { title: string; description: string; image?: string }; items: Array<Record<string, unknown>> };
    if (data.status === 'ok') {
      return {
        url: url, title: data.feed.title, description: data.feed.description,
        image: data.feed.image || '',
        items: data.items.map((item: Record<string, unknown>) => {
          const enclosure = item.enclosure as { link?: string; type?: string } | undefined;
          let thumbnailUrl = item.thumbnail as string | undefined;
          if (!thumbnailUrl && enclosure?.type?.startsWith('image/')) thumbnailUrl = enclosure.link;
          if (!thumbnailUrl) thumbnailUrl = extractImageFromHtml((item.content || item.description) as string);
          return {
            ...item,
            thumbnail: thumbnailUrl || '',
            feedTitle: data.feed.title
          } as Article;
        }),
      };
    }
  } catch { console.warn(`RSS2JSON failed for ${url}`); }

  throw new Error(`All fetch methods failed for ${url}`);
};
