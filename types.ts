
export interface Enclosure {
  link: string;
  type: string;
}

// 媒体URL双格式：支持代理和直连两种模式
export interface MediaUrl {
  original: string;   // 原始URL，用于直连模式
  proxied: string;    // 代理URL，通过服务器代理访问
}

export enum ArticleCategory {
  OFFICIAL = '官方公告与新闻发布',
  MEDIA = '内容更新与媒体宣发',
  EVENT = '线下活动与演出速报',
  COMMUNITY = '社区互动与粉丝福利',
  RETWEET = '转发&引用' // Local heuristic, not from AI directly
}

export interface Article {
  title: string;
  pubDate: string;
  link: string;
  guid: string;
  author: string;
  thumbnail: MediaUrl;       // 缩略图双URL格式
  description: string;
  content: string;
  enclosure: Enclosure;
  feedTitle?: string;
  aiCategory?: string;       // Stored classification
}

export interface Feed {
  url: string;
  title: string;
  description: string;
  image: MediaUrl;           // Feed头像双URL格式
  items: Article[];
  category?: string;
  isSub?: boolean;
}

// 订阅源配置元信息（不含文章内容，用于首屏快速渲染左侧列表）
export interface FeedMeta {
  id: string;
  category: string;
  isSub: boolean;
  customTitle?: string;
  canProxyImages?: boolean;
}

export enum Language {
  ENGLISH = 'English',
  CHINESE = 'Chinese (Simplified)',
  SPANISH = 'Spanish',
  FRENCH = 'French',
  GERMAN = 'German',
  JAPANESE = 'Japanese',
  KOREAN = 'Korean'
}

export interface FeedStats {
  feedName: string;
  articleCount: number;
}

// --- AI Settings Types ---

export type AIProviderType = 'openai' | 'gemini';

export interface AIProvider {
  id: string;
  name: string;
  type: AIProviderType;
  baseUrl: string;
  apiKey: string;
  enabledModels?: string[]; // List of model IDs enabled by the user
}

export interface AIModelConfig {
  providerId: string; // References AIProvider.id
  modelId: string;    // e.g., 'gpt-4o', 'gemini-1.5-pro'
  modelName: string;  // User's alias/remark
}

export interface AISettings {
  providers: AIProvider[];
  tasks: {
    general: AIModelConfig | null;    // Required fallback
    translation: AIModelConfig | null; // Optional
    summary: AIModelConfig | null;     // Optional
    analysis: AIModelConfig | null;    // Optional
  };
}

// --- Image Proxy Settings ---
// 代理模式：
// - 'all': 全部代理（媒体通过服务器加载，适合无法直接访问图片源的用户）
// - 'none': 不代理（媒体从用户浏览器直连，不消耗服务器流量）
export type ImageProxyMode = 'all' | 'none';

export interface UserSettings {
  imageProxyMode: ImageProxyMode;
}

// --- 媒体URL选择工具函数 ---
/**
 * 根据代理模式从MediaUrl中选择合适的URL
 * @param media - 媒体URL对象或字符串（兼容旧数据）
 * @param proxyMode - 当前代理模式
 * @returns 选择后的URL字符串
 */
export const selectMediaUrl = (
  media: MediaUrl | string | undefined,
  proxyMode: ImageProxyMode
): string => {
  if (!media) return '';
  
  // 兼容旧数据：如果是字符串，直接返回
  if (typeof media === 'string') return media;
  
  // 根据代理模式选择URL
  if (proxyMode === 'none') {
    return media.original;  // 用户直连，不消耗服务器流量
  } else {
    return media.proxied;   // 'all' 走代理
  }
};

/**
 * 构建代理URL
 * @param originalUrl - 原始媒体URL
 * @returns 代理URL路径
 */
export const buildProxiedUrl = (originalUrl: string): string => {
  if (!originalUrl || !originalUrl.startsWith('http')) {
    return originalUrl || '';
  }
  return `/api/media/proxy?url=${encodeURIComponent(originalUrl)}`;
};

/**
 * 创建MediaUrl对象
 * @param originalUrl - 原始媒体URL
 * @returns MediaUrl对象
 */
export const createMediaUrl = (originalUrl: string): MediaUrl => {
  return {
    original: originalUrl || '',
    proxied: buildProxiedUrl(originalUrl)
  };
};
