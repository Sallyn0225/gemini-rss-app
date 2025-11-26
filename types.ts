export interface Enclosure {
  link: string;
  type: string;
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
  thumbnail: string;
  description: string;
  content: string;
  enclosure: Enclosure;
  feedTitle?: string;
  aiCategory?: string; // Stored classification
}

export interface Feed {
  url: string;
  title: string;
  description: string;
  image: string;
  items: Article[];
  category?: string;
  isSub?: boolean;
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