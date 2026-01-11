import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchRSS, proxyImageUrl, fetchSystemFeeds, setImageProxyMode, getImageProxyMode, fetchHistory, setCurrentFeedCanProxyImages, getMediaUrl } from './services/rssService';
import { translateContent, analyzeFeedContent } from './services/geminiService';
import { Feed, Article, Language, ArticleCategory, AISettings, ImageProxyMode, FeedMeta, selectMediaUrl } from './types';
import { StatsChart } from './components/StatsChart';
import { ArticleCard } from './components/ArticleCard';
import { CalendarWidget } from './components/CalendarWidget';
import { SettingsModal } from './components/SettingsModal';
import { easeStandard, easeDecelerate, easeOutBack } from './components/animations';

type SidebarViewMode = 'list' | 'grid';

type RouteState = { feedId: string | null; articleId: string | null };

const getArticleId = (article: Article): string => {
  return article.guid || article.link || `${article.title}-${article.pubDate}`;
};

const buildFeedPath = (feedId: string): string => `/feed/${encodeURIComponent(feedId)}`;
const buildArticlePath = (feedId: string, articleId: string): string =>
  `${buildFeedPath(feedId)}/article/${encodeURIComponent(articleId)}`;

const parseRoute = (): RouteState => {
  if (typeof window === 'undefined') return { feedId: null, articleId: null };

  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'feed' || !parts[1]) return { feedId: null, articleId: null };

  const feedId = decodeURIComponent(parts[1]);
  if (parts[2] === 'article' && parts[3]) {
    return { feedId, articleId: decodeURIComponent(parts[3]) };
  }

  return { feedId, articleId: null };
};


// --- New Helper Function to Proxy Media in HTML ---
const proxyHtmlImages = (html: string | null | undefined): string => {
  if (!html) return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Proxy images
    doc.querySelectorAll('img').forEach(img => {
      const originalSrc = img.getAttribute('src');
      if (originalSrc && originalSrc.startsWith('http')) {
        img.setAttribute('src', proxyImageUrl(originalSrc));
      }
    });

    // Proxy video posters
    doc.querySelectorAll('video').forEach(video => {
      const posterSrc = video.getAttribute('poster');
      if (posterSrc && posterSrc.startsWith('http')) {
        video.setAttribute('poster', proxyImageUrl(posterSrc));
      }
    });

    // Sanitize the HTML content to prevent XSS
    return DOMPurify.sanitize(doc.body.innerHTML);
  } catch (e) {
    console.error("Failed to parse and proxy HTML content:", e);
    return DOMPurify.sanitize(html || ''); // Fallback with sanitization
  }
};

// --- Extracted FeedItem Component ---
interface FeedItemProps {
  feedMeta: FeedMeta;
  feedContent?: Feed | null; // 可选，有内容时显示文章数，无内容时显示骨架
  mode: SidebarViewMode;
  isSelected: boolean;
  isLoading?: boolean; // 当前是否正在加载该源
  onSelect: (feedMeta: FeedMeta) => void;
}

const FeedItem: React.FC<FeedItemProps> = React.memo(({ feedMeta, feedContent, mode, isSelected, isLoading, onSelect }) => {
  const displayTitle = feedMeta.customTitle || feedContent?.title || feedMeta.id;
  const fallbackAvatar = useMemo(() => proxyImageUrl(`https://ui-avatars.com/api/?name=${encodeURIComponent(displayTitle)}&background=3b82f6&color=fff&size=128`), [displayTitle]);

  const handleClick = useCallback(() => {
    onSelect(feedMeta);
  }, [onSelect, feedMeta]);

  if (mode === 'grid') {
    return (
      <motion.div 
        className="relative group w-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <motion.button
          onClick={handleClick}
          className={`relative aspect-square rounded-none overflow-hidden border w-full block transition-colors duration-200 ${isSelected ? 'border-accent ring-1 ring-accent bg-flat-100' : 'border-flat-200 dark:border-slate-700 hover:bg-flat-50'}`}
          title={displayTitle}
        >
          <img 
            src={getMediaUrl(feedContent?.image) || fallbackAvatar} 
            alt={displayTitle} 
            className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300" 
            onError={(e) => { (e.target as HTMLImageElement).src = fallbackAvatar; }}
          />
          <div className="absolute inset-0 bg-flat-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
            <p className="text-white text-[10px] font-medium line-clamp-2 leading-tight text-left">{displayTitle}</p>
          </div>
          {isSelected && (
            <div className="absolute top-0 right-0 w-4 h-4 bg-accent flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 bg-white/20 dark:bg-slate-950/20 backdrop-blur-none flex items-center justify-center">
              <div className="h-4 w-4 border-2 border-accent border-t-transparent animate-spin"></div>
            </div>
          )}
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className={`relative group w-full ${feedMeta.isSub ? 'pl-4' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {feedMeta.isSub && <div className="absolute left-2 top-0 bottom-1/2 w-2 border-l border-b border-flat-300 dark:border-slate-700 -z-10"></div>}
      <motion.button
        onClick={handleClick}
        className={`flex items-center gap-3 w-full p-2 rounded-none text-left pr-8 relative transition-colors duration-200 ${isSelected ? 'bg-accent text-white' : 'text-flat-700 hover:bg-flat-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
      >
        {feedContent ? (
          <img 
            src={getMediaUrl(feedContent.image) || fallbackAvatar} 
            alt="" 
            className={`w-8 h-8 rounded-none object-cover shrink-0 border ${isSelected ? 'border-white/20' : 'border-flat-200 dark:border-slate-700'}`} 
            onError={(e) => { (e.target as HTMLImageElement).src = fallbackAvatar; }}
          />
        ) : (
          <div className="w-8 h-8 bg-flat-200 dark:bg-slate-700 shrink-0" />
        )}
        <div className="flex-1 overflow-hidden">
          <p className={`font-semibold text-sm truncate ${isSelected ? 'text-white' : 'text-flat-900 dark:text-stone-200'}`}>{displayTitle}</p>
          {feedContent ? (
            <p className={`text-[10px] truncate ${isSelected ? 'text-white/80' : 'text-flat-500'}`}>{feedContent.items.length} Articles</p>
          ) : (
            <div className="h-2 w-12 bg-flat-100 dark:bg-slate-700 mt-1" />
          )}
        </div>
        {isLoading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className={`h-3 w-3 border-2 ${isSelected ? 'border-white' : 'border-accent'} border-t-transparent animate-spin`}></div>
          </div>
        )}
      </motion.button>
    </motion.div>
  );
});

// --- Filter Bar Component ---
interface FilterBarProps {
  activeFilters: string[]; onToggleFilter: (filter: string) => void; onReset: () => void;
  onAnalyze: () => void; isAnalyzing: boolean; analysisSuccess: boolean; selectedDate: Date | null;
}
const FilterBar: React.FC<FilterBarProps> = React.memo(({ activeFilters, onToggleFilter, onReset, onAnalyze, isAnalyzing, analysisSuccess, selectedDate }) => {
  const filters = [ArticleCategory.OFFICIAL, ArticleCategory.MEDIA, ArticleCategory.EVENT, ArticleCategory.COMMUNITY, ArticleCategory.RETWEET,];
  return (
    <div className="flex justify-center sticky top-0 z-20 py-2 pointer-events-none">
      <div className="flex items-center gap-0 bg-white dark:bg-slate-800 border border-flat-200 dark:border-slate-700 pointer-events-auto mx-4 overflow-hidden">
        <button 
          onClick={onAnalyze} 
          disabled={isAnalyzing || !selectedDate} 
          className={`shrink-0 flex items-center gap-2 px-4 py-2 text-xs font-bold transition-colors ${isAnalyzing ? 'bg-flat-100 text-flat-400 cursor-wait' : analysisSuccess ? 'bg-green-500 text-white' : !selectedDate ? 'bg-flat-100 text-flat-300 cursor-not-allowed' : 'bg-accent text-white hover:bg-accent-dark'}`}
          title={!selectedDate ? "Please select a date first" : undefined}
        >
          {isAnalyzing ? (
            <>
              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Analyzing...</span>
            </>
          ) : analysisSuccess ? (
            <span>Success</span>
          ) : (
            <span>AI Analysis</span>
          )}
        </button>
        <div className="w-px h-8 bg-flat-200 dark:bg-slate-700 shrink-0"></div>
        <button 
          onClick={onReset} 
          className={`shrink-0 px-4 py-2 text-xs font-bold transition-colors ${activeFilters.length === 0 ? 'bg-flat-100 text-accent' : 'text-flat-600 hover:bg-flat-50 dark:text-slate-300 dark:hover:bg-slate-700'}`}
        >
          All
        </button>
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide">
          {filters.map((filter) => (
            <button 
              key={filter} 
              onClick={() => onToggleFilter(filter)} 
              disabled={isAnalyzing && !activeFilters.includes(filter)} 
              className={`shrink-0 px-4 py-2 text-xs font-bold whitespace-nowrap border-l border-flat-200 dark:border-slate-700 transition-colors ${activeFilters.includes(filter) ? 'bg-flat-200 text-flat-900' : 'text-flat-600 hover:bg-flat-50 dark:text-slate-300 dark:hover:bg-slate-700'} ${isAnalyzing ? 'opacity-50' : ''}`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

interface CategoryNode {
  name: string;
  path: string;
  feeds: FeedMeta[];
  children: Map<string, CategoryNode>;
  depth: number;
}

const getNodeByPath = (groupedFeeds: Map<string, CategoryNode>, path: string): CategoryNode | null => {
  const parts = path.split('/').filter(Boolean);
  let current: Map<string, CategoryNode> = groupedFeeds;
  let node: CategoryNode | null = null;
  for (const part of parts) {
    node = current.get(part) || null;
    if (!node) return null;
    current = node.children;
  }
  return node;
};

const getFolderPreviews = (node: CategoryNode, feedContentCache: Record<string, Feed>): string[] => {
  const previews: string[] = [];
  for (const meta of node.feeds) {
    if (previews.length >= 4) break;
    const content = feedContentCache[meta.id];
    previews.push(getMediaUrl(content?.image) || `https://ui-avatars.com/api/?name=${encodeURIComponent(meta.customTitle || meta.id)}&background=3b82f6&color=fff&size=64`);
  }
  if (previews.length < 4) {
    for (const child of node.children.values()) {
      const childPreviews = getFolderPreviews(child, feedContentCache);
      for (const preview of childPreviews) {
        if (previews.length >= 4) break;
        previews.push(preview);
      }
      if (previews.length >= 4) break;
    }
  }
  return previews;
};

const countAllFeeds = (node: CategoryNode): number => {
  let count = node.feeds.length;
  node.children.forEach(child => { count += countAllFeeds(child); });
  return count;
};

const renderSubfolder = (
  node: CategoryNode,
  setOpenFolderPath: React.Dispatch<React.SetStateAction<string | null>>
): React.ReactElement => {
  const totalCount = countAllFeeds(node);
  return (
    <button
      key={node.path}
      onClick={() => setOpenFolderPath(node.path)}
      className="relative aspect-square border border-flat-200 dark:border-slate-700 bg-flat-100 dark:bg-slate-800 flex flex-col items-center justify-center gap-1 hover:bg-flat-200 transition-colors"
    >
      <div className="w-10 h-10 bg-accent flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="white" className="w-6 h-6">
          <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
        </svg>
      </div>
      <span className="text-[10px] font-bold text-flat-700 dark:text-slate-300 truncate w-full text-center px-1 uppercase tracking-tighter">{node.name}</span>
      <span className="text-[9px] text-flat-400 dark:text-slate-500 font-bold">{totalCount}</span>
    </button>
  );
};

const renderFolder = (
  node: CategoryNode,
  setOpenFolderPath: React.Dispatch<React.SetStateAction<string | null>>,
  feedContentCache: Record<string, Feed>
): React.ReactElement => {
  const previews = getFolderPreviews(node, feedContentCache);
  const totalCount = countAllFeeds(node);
  return (
    <div key={node.path} className="w-full">
      <button
        onClick={() => setOpenFolderPath(node.path)}
        className="w-full p-2 bg-white dark:bg-slate-800 border border-flat-200 dark:border-slate-700 hover:bg-flat-50 transition-colors"
      >
        <div className="grid grid-cols-2 gap-1 mb-2 grayscale opacity-70">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="aspect-square bg-flat-100 dark:bg-slate-900">
              {previews[i] ? <img src={proxyImageUrl(previews[i])} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-flat-900 dark:text-slate-200 truncate uppercase tracking-widest">{node.name}</span>
          <span className="text-[9px] text-flat-400 dark:text-slate-500 font-bold">{totalCount}</span>
        </div>
      </button>
    </div>
  );
};

const countFeeds = (node: CategoryNode): number => {
  let count = node.feeds.length;
  node.children.forEach((child) => { count += countFeeds(child); });
  return count;
};

const renderCategoryNode = (
  node: CategoryNode,
  isFirst: boolean,
  collapsedCategories: Set<string>,
  toggleCategoryCollapse: (path: string) => void,
  feedContentCache: Record<string, Feed>,
  selectedFeedMeta: FeedMeta | null,
  loadingFeedId: string | null,
  handleFeedSelect: (feed: FeedMeta) => void
): React.ReactNode => {
  const isCollapsed = collapsedCategories.has(node.path);
  const hasChildren = node.children.size > 0 || node.feeds.length > 0;
  const childrenArray = Array.from(node.children.values());
  const totalFeeds = countFeeds(node);

  return (
    <div key={node.path} className="w-full">
      {node.name && (
        <button
          onClick={() => toggleCategoryCollapse(node.path)}
          className={`w-full flex items-center gap-2 px-4 py-2 border-b border-flat-200 dark:border-slate-800 hover:bg-flat-100 dark:hover:bg-slate-800 transition-colors ${isFirst ? '' : ''}`}
          style={{ paddingLeft: `${(node.depth) * 8 + 16}px` }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3.5 h-3.5 text-flat-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
          >
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
          <span className="text-[10px] font-black text-flat-600 dark:text-slate-400 uppercase tracking-widest truncate flex-1 text-left">
            {node.name}
          </span>
          <span className="text-[9px] text-flat-400 dark:text-slate-500 font-bold">
            {totalFeeds}
          </span>
        </button>
      )}

      {(!node.name || !isCollapsed) && hasChildren && (
        <div className="overflow-hidden">
          {node.feeds.map((meta) => {
            const content = feedContentCache[meta.id] || null;
            return (
              <div key={meta.id} style={{ paddingLeft: `${(node.depth + (node.name ? 1 : 0)) * 8}px` }}>
                <FeedItem
                  feedMeta={meta}
                  feedContent={content}
                  mode="list"
                  isSelected={selectedFeedMeta?.id === meta.id}
                  isLoading={loadingFeedId === meta.id}
                  onSelect={handleFeedSelect}
                />
              </div>
            );
          })}

          {childrenArray.map((child, idx) => renderCategoryNode(child, idx === 0 && node.feeds.length === 0, collapsedCategories, toggleCategoryCollapse, feedContentCache, selectedFeedMeta, loadingFeedId, handleFeedSelect))}
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {


  // --- 本地缓存工具函数 ---
  const FEED_CACHE_KEY = 'rss_feed_content_cache';
  const FEED_CACHE_TTL = 10 * 60 * 1000; // 10 分钟缓存有效期
  const HISTORY_PAGE_SIZE = 200;

  interface CachedFeed {
    feed: Feed;
    timestamp: number;
  }

  const loadFeedFromLocalCache = (feedId: string): Feed | null => {
    try {
      const cacheStr = localStorage.getItem(FEED_CACHE_KEY);
      if (!cacheStr) return null;
      const cache: Record<string, CachedFeed> = JSON.parse(cacheStr);
      const cached = cache[feedId];
      if (cached && Date.now() - cached.timestamp < FEED_CACHE_TTL) {
        return cached.feed;
      }
      return null;
    } catch {
      return null;
    }
  };

  const saveFeedToLocalCache = (feedId: string, feed: Feed) => {
    try {
      const cacheStr = localStorage.getItem(FEED_CACHE_KEY);
      const cache: Record<string, CachedFeed> = cacheStr ? JSON.parse(cacheStr) : {};
      cache[feedId] = { feed, timestamp: Date.now() };
      // 清理过期缓存
      const now = Date.now();
      Object.keys(cache).forEach(key => {
        if (now - cache[key].timestamp > FEED_CACHE_TTL) {
          delete cache[key];
        }
      });
      localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.warn('Failed to save feed to local cache', e);
    }
  };

  const mergeFeedItems = useCallback((existingItems: Article[] = [], incomingItems: Article[] = []) => {
    const getKey = (item: Article, index: number, prefix: string) =>
      item.guid || item.link || `${prefix}-${index}-${item.title}-${item.pubDate}`;

    const itemMap = new Map<string, Article>();

    existingItems.forEach((item, index) => {
      itemMap.set(getKey(item, index, 'existing'), item);
    });

    incomingItems.forEach((item, index) => {
      itemMap.set(getKey(item, index, 'incoming'), item);
    });

    return Array.from(itemMap.values()).sort((a, b) => {
      const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return dateB - dateA;
    });
  }, []);

  // --- 新增：订阅源配置列表（只含元信息，首屏快速加载）---
  const [feedConfigs, setFeedConfigs] = useState<FeedMeta[]>([]);
  // --- 新增：已加载的订阅源内容缓存（按 id 索引）---
  const [feedContentCache, setFeedContentCache] = useState<Record<string, Feed>>({});
  // --- 新增：当前正在加载的订阅源 ID ---
  const [loadingFeedId, setLoadingFeedId] = useState<string | null>(null);
  // --- 新增：当前选中的订阅源配置 ---
  const [selectedFeedMeta, setSelectedFeedMeta] = useState<FeedMeta | null>(null);
  // --- 新增：历史分页状态 ---
  const [historyStatus, setHistoryStatus] = useState<Record<string, { total: number; loaded: number }>>({});

  // --- 新增：折叠的分类路径集合 ---
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('collapsed_categories');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // 保留原有 feeds 用于仪表盘统计（由缓存派生）
  const feeds = useMemo(() => Object.values(feedContentCache), [feedContentCache]);

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proxyInfoMsg, setProxyInfoMsg] = useState<string | null>(null);
  const warnedFeedsRef = useRef<Set<string>>(new Set());
  const [aiSettings, setAiSettings] = useState<AISettings>(() => { try { const stored = localStorage.getItem('rss_ai_settings'); return stored ? JSON.parse(stored) : { providers: [], tasks: { general: null, translation: null, summary: null, analysis: null } }; } catch { return { providers: [], tasks: { general: null, translation: null, summary: null, analysis: null } }; } });
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpContent, setHelpContent] = useState<string>('');
  const [darkMode, setDarkMode] = useState(() => { if (typeof window !== 'undefined') { return localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches); } return false; });
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [sidebarMode, setSidebarMode] = useState<SidebarViewMode>('list');
  // --- Grid模式下当前打开的文件夹路径 ---
  const [openFolderPath, setOpenFolderPath] = useState<string | null>(null);
  const [selectedFeed, setSelectedFeed] = useState<Feed | null>(null);
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [pendingArticleId, setPendingArticleId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [dailySummary, setDailySummary] = useState<string | null>(null);
  const [summaryCache, setSummaryCache] = useState<Record<string, string>>({});

  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisSuccess, setAnalysisSuccess] = useState<boolean>(false);
  const [articleClassifications, setArticleClassifications] = useState<Record<string, string>>({});
  const [targetLang, setTargetLang] = useState<Language>(Language.CHINESE);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [lastTranslatedLang, setLastTranslatedLang] = useState<Language | null>(null);
  const [showTranslation, setShowTranslation] = useState<boolean>(false);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);

  // --- Image Proxy Mode & First Visit Modal ---
  const [imageProxyMode, setImageProxyModeState] = useState<ImageProxyMode>(() => {
    const stored = localStorage.getItem('image_proxy_mode');
    // 兼容旧版 'twitter-only' 和 'media_only' 模式，自动迁移为 'all'
    if (stored === 'twitter-only' || stored === 'media_only') {
      localStorage.setItem('image_proxy_mode', 'all');
      setImageProxyMode('all');
      return 'all';
    }
    if (stored && ['all', 'none'].includes(stored)) {
      setImageProxyMode(stored as ImageProxyMode);
      return stored as ImageProxyMode;
    }
    return 'all';
  });
  const [showProxyModal, setShowProxyModal] = useState<boolean>(() => {
    return !localStorage.getItem('image_proxy_mode');
  });

  // --- Pagination State ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ARTICLES_PER_PAGE = 10;

  const [scrollPosition, setScrollPosition] = useState(0);
  const [shouldRestoreScroll, setShouldRestoreScroll] = useState(false);
  const articleListRef = useRef<HTMLDivElement>(null);

  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const lastScrollTopRef = useRef(0);

  const [readArticleIds, setReadArticleIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('read_articles');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);

  const isAiConfigured = useMemo(() => {
    const { providers, tasks } = aiSettings;
    if (providers.length === 0) return false;
    const generalConfig = tasks.general;
    if (generalConfig && generalConfig.providerId && generalConfig.modelId && providers.some(p => p.id === generalConfig.providerId)) {
      return true;
    }
    return false;
  }, [aiSettings]);

  useEffect(() => { if (darkMode) { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark'); } else { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light'); } }, [darkMode]);
  useEffect(() => { let lastIsDesktop = window.innerWidth >= 1024; const handleResize = () => { const isDesktop = window.innerWidth >= 1024; if (isDesktop !== lastIsDesktop) { setIsSidebarOpen(isDesktop); setIsRightSidebarOpen(isDesktop); lastIsDesktop = isDesktop; } }; window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);

  // --- 持久化折叠状态 ---
  useEffect(() => {
    localStorage.setItem('collapsed_categories', JSON.stringify([...collapsedCategories]));
  }, [collapsedCategories]);

  // --- 切换分类折叠状态 ---
  const toggleCategoryCollapse = useCallback((categoryPath: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryPath)) {
        next.delete(categoryPath);
      } else {
        next.add(categoryPath);
      }
      return next;
    });
  }, []);

  // --- 构建分层分类结构 ---
  interface CategoryNode {
    name: string;
    path: string;
    feeds: FeedMeta[];
    children: Map<string, CategoryNode>;
    depth: number;
  }

  const groupedFeeds = useMemo(() => {
    const root: Map<string, CategoryNode> = new Map();
    
    feedConfigs.forEach(meta => {
      const categoryPath = meta.category || '';
      const parts = categoryPath.split('/').filter(Boolean);
      
      if (parts.length === 0) {
        // 无分类的源放入特殊节点
        if (!root.has('__uncategorized__')) {
          root.set('__uncategorized__', {
            name: '',
            path: '',
            feeds: [],
            children: new Map(),
            depth: 0
          });
        }
        root.get('__uncategorized__')!.feeds.push(meta);
        return;
      }
      
      let currentMap = root;
      let currentPath = '';
      
      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        
        if (!currentMap.has(part)) {
          currentMap.set(part, {
            name: part,
            path: currentPath,
            feeds: [],
            children: new Map(),
            depth: index
          });
        }
        
        const node = currentMap.get(part)!;
        
        // 如果是最后一级或者是子订阅源，添加到当前节点
        if (index === parts.length - 1) {
          node.feeds.push(meta);
        }
        
        currentMap = node.children;
      });
    });
    
    return root;
  }, [feedConfigs]);


  // --- 优化后的 initFeeds：只加载配置，不加载内容 ---
  const initFeeds = useCallback(async () => {
    setLoading(true); setErrorMsg(null);
    try {
      // 只获取配置列表（不含文章内容），首屏秒开
      const configs = await fetchSystemFeeds();
      if (configs.length === 0) {
        setFeedConfigs([]);
        setLoading(false);
        return;
      }
      setFeedConfigs(configs);

      // 尝试从本地缓存恢复已加载的内容（stale-while-revalidate）
      const cachedContent: Record<string, Feed> = {};
      configs.forEach(config => {
        const cached = loadFeedFromLocalCache(config.id);
        if (cached) {
          cachedContent[config.id] = cached;
        }
      });
      if (Object.keys(cachedContent).length > 0) {
        setFeedContentCache(cachedContent);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("初始化订阅源时出错。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initFeeds();
  }, [initFeeds]);

  useEffect(() => {
    // When returning to the article list view, restore the scroll position.
    if (!activeArticle && shouldRestoreScroll && articleListRef.current) {
      // A timeout ensures this runs after the list has been rendered.
      const timer = setTimeout(() => {
        if (articleListRef.current) {
          articleListRef.current.scrollTop = scrollPosition;
          setShouldRestoreScroll(false);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeArticle, shouldRestoreScroll, scrollPosition]);

  const baseArticles = useMemo(() => {
    if (!selectedFeed) return [];
    if (selectedDate) return selectedFeed.items.filter(item => { const d = new Date(item.pubDate); return d.getDate() === selectedDate.getDate() && d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear(); });
    return selectedFeed.items;
  }, [selectedFeed, selectedDate]);

  const isRetweet = (article: Article) => /^RT\s/i.test(article.title) || /^Re\s/i.test(article.title);

  const filteredArticles = useMemo(() => {
    if (activeFilters.length === 0) return baseArticles;
    return baseArticles.filter(article => activeFilters.some(filter => filter === ArticleCategory.RETWEET ? isRetweet(article) : articleClassifications[article.guid] === filter));
  }, [baseArticles, activeFilters, articleClassifications]);

  // --- Pagination Logic ---
  const totalPages = Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE);
  const paginatedArticles = useMemo(() => {
    const startIndex = (currentPage - 1) * ARTICLES_PER_PAGE;
    return filteredArticles.slice(startIndex, startIndex + ARTICLES_PER_PAGE);
  }, [filteredArticles, currentPage, ARTICLES_PER_PAGE]);

  const paginatedArticlesWithCategory = useMemo(() => {
    return paginatedArticles.map(article => ({
      ...article,
      aiCategory: articleClassifications[article.guid]
    }));
  }, [paginatedArticles, articleClassifications]);


  const selectedFeedHistoryStatus = selectedFeedMeta ? historyStatus[selectedFeedMeta.id] : undefined;
  const canLoadMoreHistory = !!(
    selectedFeedHistoryStatus &&
    selectedFeedHistoryStatus.total > 0 &&
    selectedFeedHistoryStatus.loaded < selectedFeedHistoryStatus.total
  );

  const visiblePageTokens = useMemo<(number | string)[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const delta = 1; // show one page before and after current
    const range: number[] = [];

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      }
    }

    const pages: (number | string)[] = [];
    let previous: number | null = null;

    range.forEach(page => {
      if (previous !== null) {
        if (page - previous === 2) {
          pages.push(previous + 1);
        } else if (page - previous > 2) {
          pages.push(`ellipsis-${page}`);
        }
      }
      pages.push(page);
      previous = page;
    });

    return pages;
  }, [currentPage, totalPages]);

  // Reset to page 1 when feed or filters change (use feed ID to avoid reset on same-feed data refresh)
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFeedMeta?.id, selectedDate, activeFilters]);

  const loadMoreHistory = useCallback(async () => {
    if (!selectedFeed || !selectedFeedMeta) return;
    const status = historyStatus[selectedFeedMeta.id];
    if (!status) return;
    if (status.loaded >= status.total) return;
    if (isLoadingMoreHistory) return;

    setIsLoadingMoreHistory(true);
    try {
      const offset = status.loaded;
      const historyData = await fetchHistory(selectedFeedMeta.id, HISTORY_PAGE_SIZE, offset);
      const mergedItems = mergeFeedItems(selectedFeed.items, historyData.items);
      const finalFeed: Feed = {
        ...selectedFeed,
        items: mergedItems,
      };
      setFeedContentCache(prev => ({ ...prev, [selectedFeedMeta.id]: finalFeed }));
      saveFeedToLocalCache(selectedFeedMeta.id, finalFeed);
      setSelectedFeed(finalFeed);
      setHistoryStatus(prev => ({
        ...prev,
        [selectedFeedMeta.id]: {
          total: historyData.total || status.total,
          loaded: status.loaded + historyData.items.length,
        }
      }));
    } catch (e) {
      console.error('Failed to load more history', e);
    } finally {
      setIsLoadingMoreHistory(false);
    }
  }, [selectedFeed, selectedFeedMeta, historyStatus, isLoadingMoreHistory, mergeFeedItems]);

  // Scroll listener: show/hide scroll-to-top button & trigger lazy load history
  useEffect(() => {
    const listEl = articleListRef.current;
    if (!listEl) return;

    const handleScroll = () => {
      const currentScrollTop = listEl.scrollTop;

      // Show button if we scroll down past a certain point
      if (currentScrollTop > lastScrollTopRef.current && currentScrollTop > 300) {
        setShowScrollToTop(true);
      }
      // Hide button if we scroll up or are near the top
      else if (currentScrollTop < lastScrollTopRef.current || currentScrollTop <= 300) {
        setShowScrollToTop(false);
      }

      lastScrollTopRef.current = currentScrollTop <= 0 ? 0 : currentScrollTop;

      // Trigger lazy load history when at last page and near bottom
      const isAtLastPage = currentPage === totalPages;
      const nearBottom = listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 200;
      if (
        selectedFeed &&
        !activeArticle &&
        isAtLastPage &&
        nearBottom &&
        canLoadMoreHistory &&
        !isLoadingMoreHistory
      ) {
        loadMoreHistory();
      }
    };

    listEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => listEl.removeEventListener('scroll', handleScroll);
  }, [selectedFeed, activeArticle, currentPage, totalPages, canLoadMoreHistory, isLoadingMoreHistory, loadMoreHistory]);

  useEffect(() => {
    if (!selectedFeed || !selectedDate) { setDailySummary(null); return; }
    const count = baseArticles.length; if (count === 0) { setDailySummary(null); return; }
    const key = `${selectedFeed.url}-${selectedDate.toDateString()}-${count}`;
    setDailySummary(summaryCache[key] || null);
  }, [selectedDate, selectedFeed, baseArticles, summaryCache]);

  // --- 优化后的 handleFeedSelect：点击时才加载内容，并合并历史记录 ---
  const handleFeedSelect = useCallback(async (
    meta: FeedMeta,
    options?: { skipHistory?: boolean; articleId?: string }
  ) => {
    if (!options?.skipHistory && typeof window !== 'undefined') {
      window.history.pushState({ feedId: meta.id }, '', buildFeedPath(meta.id));
    }

    setSelectedFeedMeta(meta);
    setActiveArticle(null);
    setPendingArticleId(options?.articleId || null);

    setTranslatedContent(null);
    setLastTranslatedLang(null);
    setShowTranslation(false);
    setSelectedDate(null);
    setActiveFilters([]);


    // Feed-level image proxy capability: inform rssService and optionally show one-time tip
    const canProxy = meta.canProxyImages !== false;
    setCurrentFeedCanProxyImages(canProxy);
    if (!canProxy && imageProxyMode !== 'none' && !warnedFeedsRef.current.has(meta.id)) {
      warnedFeedsRef.current.add(meta.id);
      setProxyInfoMsg('该订阅源未加入服务器图片代理白名单，图片将直接加载。');
    } else if (canProxy) {
      setProxyInfoMsg(null);
    }

    if (window.innerWidth < 1024) setIsSidebarOpen(false);
    if (window.innerWidth >= 1024) setIsRightSidebarOpen(true);

    // 如果缓存中已有该源内容，直接使用
    const cached = feedContentCache[meta.id];
    if (cached) {
      setSelectedFeed(cached);
    } else {
      setSelectedFeed(null);
    }

    setLoadingFeedId(meta.id);
    try {
      // 同时获取当前 RSS 和历史记录
      const [fetchedFeed, historyData] = await Promise.all([
        fetchRSS(meta.id),
        fetchHistory(meta.id, HISTORY_PAGE_SIZE, 0).catch(() => ({ items: [] as Article[], total: 0 })) // 历史获取失败不影响主流程
      ]);

      const mergedItems = mergeFeedItems(historyData.items, fetchedFeed.items);

      const finalFeed: Feed = {
        ...fetchedFeed,
        title: meta.customTitle || fetchedFeed.title,
        category: meta.category,
        isSub: meta.isSub,
        items: mergedItems, // 使用合并后的 items
      };
      // 更新内存缓存
      setFeedContentCache(prev => ({ ...prev, [meta.id]: finalFeed }));
      // 保存到本地缓存
      saveFeedToLocalCache(meta.id, finalFeed);
      // 设置当前选中
      setSelectedFeed(finalFeed);
      setHistoryStatus(prev => ({
        ...prev,
        [meta.id]: {
          total: historyData.total || mergedItems.length,
          loaded: historyData.items.length
        }
      }));
    } catch (e) {
      console.error(`Failed to load feed ${meta.id}:`, e);
      setErrorMsg(`加载订阅源 "${meta.customTitle || meta.id}" 失败`);
    } finally {
      setLoadingFeedId(null);
    }
  }, [feedContentCache, imageProxyMode, mergeFeedItems]);

  const handleDateSelect = (date: Date | null) => { setSelectedDate(date); setActiveArticle(null); setActiveFilters([]); };

  const handleRunAnalysis = async () => {
    if (!selectedFeed || isAnalyzing) return;

    if (!selectedDate) {
      alert('请先选择一个日期以进行AI分析。');
      return;
    }

    if (!isAiConfigured) {
      alert('AI 功能未配置。请点击左下角的「设置」按钮，添加 API 提供商并配置「总模型」后重试。');
      return;
    }

    setIsAnalyzing(true); setAnalysisSuccess(false);
    try {
      const dateContext = selectedDate || new Date();
      const result = await analyzeFeedContent(selectedFeed.title, dateContext, baseArticles, aiSettings);
      const newClassifications = { ...articleClassifications };
      baseArticles.forEach((a, index) => { if (result.classifications[index]) { newClassifications[a.guid] = result.classifications[index]; } });
      setArticleClassifications(newClassifications);
      if (selectedDate) {
        const key = `${selectedFeed.url}-${selectedDate.toDateString()}-${baseArticles.length}`;
        setSummaryCache(prev => ({ ...prev, [key]: result.summary })); setDailySummary(result.summary);
      }
      setAnalysisSuccess(true); setTimeout(() => setAnalysisSuccess(false), 3000);
    } catch (e) { console.error("Analysis failed", e); } finally { setIsAnalyzing(false); }
  };

  const handleFilterToggle = (filter: string) => {
    setActiveFilters(prev => {
      const isActive = prev.includes(filter);
      return isActive ? prev.filter(f => f !== filter) : [...prev, filter];
    });

    // Auto-analyze only if we are activating a new filter AND it is NOT the RETWEET filter
    // We check !activeFilters.includes(filter) here, which reflects the state BEFORE update (which is correct for "is currently not active")
    const isActivating = !activeFilters.includes(filter);

    if (isActivating && filter !== ArticleCategory.RETWEET && baseArticles.some(a => !articleClassifications[a.guid])) {
      handleRunAnalysis();
    }
  };

  const handleArticleSelect = (article: Article) => {
    if (articleListRef.current) {
      setScrollPosition(articleListRef.current.scrollTop);
      setShouldRestoreScroll(true);
    }
    setActiveArticle(article);
    setTranslatedContent(null);
    setLastTranslatedLang(null);
    setShowTranslation(false);

    const id = getArticleId(article);
    if (selectedFeedMeta && typeof window !== 'undefined') {
      window.history.pushState({ feedId: selectedFeedMeta.id, articleId: id }, '', buildArticlePath(selectedFeedMeta.id, id));
    }

    if (!readArticleIds.has(id)) {
      const newSet = new Set(readArticleIds);
      newSet.add(id);
      setReadArticleIds(newSet);
      try {
        localStorage.setItem('read_articles', JSON.stringify(Array.from(newSet)));
      } catch (e) {
        console.warn('Failed to save read status to localStorage', e);
      }
    }
  };

  const handleBackToArticles = () => {
    setActiveArticle(null);
    if (selectedFeedMeta && typeof window !== 'undefined') {
      window.history.pushState({ feedId: selectedFeedMeta.id }, '', buildFeedPath(selectedFeedMeta.id));
    }
  };
  const handleBackToDashboard = () => {
    setSelectedFeed(null);
    setSelectedFeedMeta(null);
    setActiveArticle(null);
    setSelectedDate(null);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
  };

  useEffect(() => {
    if (!pendingArticleId || !selectedFeed) return;

    const target = selectedFeed.items.find(item => getArticleId(item) === pendingArticleId);
    if (target) {
      setActiveArticle(target);
    }
  }, [pendingArticleId, selectedFeed]);


  // --- 路由同步：支持移动端返回手势与刷新恢复 ---
  const syncStateWithRoute = useCallback((route: RouteState, skipHistory: boolean) => {
    if (!route.feedId) {
      setSelectedFeed(null);
      setSelectedFeedMeta(null);
      setActiveArticle(null);
      setSelectedDate(null);
      if (!skipHistory && typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/');
      }
      return;
    }

    if (selectedFeedMeta?.id !== route.feedId) {
      const meta = feedConfigs.find(feed => feed.id === route.feedId);
      if (meta) {
        handleFeedSelect(meta, { skipHistory: true, articleId: route.articleId || undefined });
      } else {
        setErrorMsg(`未找到订阅源: ${route.feedId}`);
      }
      return;
    }

    if (!route.articleId) {
      setActiveArticle(null);
      setPendingArticleId(null);
      return;
    }

    setPendingArticleId(route.articleId);
  }, [feedConfigs, handleFeedSelect, selectedFeedMeta]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      syncStateWithRoute(parseRoute(), true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [syncStateWithRoute]);

  useEffect(() => {
    syncStateWithRoute(parseRoute(), true);
  }, [feedConfigs, syncStateWithRoute]);


  const handleTranslateToggle = useCallback(async () => {
    if (!activeArticle) return;

    if (!isAiConfigured) {
      alert("AI 功能未配置。请点击左下角的“设置”按钮，添加 API 提供商并配置「总模型」后重试。");
      return;
    }

    if (showTranslation) { setShowTranslation(false); return; }
    if (translatedContent && lastTranslatedLang === targetLang) { setShowTranslation(true); return; }
    setIsTranslating(true);
    try {
      const content = activeArticle.content || activeArticle.description;
      const result = await translateContent(content, targetLang, aiSettings);
      const proxiedResult = proxyHtmlImages(result);
      setTranslatedContent(proxiedResult);
      setLastTranslatedLang(targetLang);
      setShowTranslation(true);
    } catch (error: any) {
      console.error(error);
      // Show specific error message from the service
      alert(`翻译失败:\n${error.message || "未知错误，请检查网络或配置。"}`);
    } finally {
      setIsTranslating(false);
    }
  }, [activeArticle, targetLang, showTranslation, translatedContent, lastTranslatedLang, aiSettings, isAiConfigured]);

  const handleLanguageSwitch = async (newLang: Language) => {
    setTargetLang(newLang);
    // If we are currently viewing a translation, refresh it immediately
    if (showTranslation && activeArticle) {
      setIsTranslating(true);
      try {
        const content = activeArticle.content || activeArticle.description || '';
        const result = await translateContent(content, newLang, aiSettings);
        const proxiedResult = proxyHtmlImages(result);
        setTranslatedContent(proxiedResult);
        setLastTranslatedLang(newLang);
      } catch (error: any) {
        console.error(error);
        alert(`翻译失败:\n${error.message}`);
      } finally {
        setIsTranslating(false);
      }
    }
  };

  const handleSaveSettings = (newSettings: AISettings) => { setAiSettings(newSettings); localStorage.setItem('rss_ai_settings', JSON.stringify(newSettings)); };

  // --- Image Proxy Mode Handler ---
  const handleImageProxyModeChange = (mode: ImageProxyMode) => {
    setImageProxyModeState(mode);
    setImageProxyMode(mode);
    localStorage.setItem('image_proxy_mode', mode);
    setShowProxyModal(false);
  };

  const handleScrollToTop = () => {
    articleListRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const getTranslatorName = useCallback(() => {
    // 1. Check Specific Translation Task Configuration
    // If the user has explicitly configured a provider for translation, we should use that configuration.
    const transTask = aiSettings.tasks.translation;
    if (transTask && transTask.providerId) {
      // Return the custom remark if present, otherwise fallback to the Model ID
      return transTask.modelName || transTask.modelId || "Custom AI";
    }

    // 2. Fallback to General Configuration
    const genTask = aiSettings.tasks.general;
    if (genTask && genTask.providerId) {
      return genTask.modelName || genTask.modelId || "General Model";
    }

    // 3. Absolute Fallback (System Default)
    return "Gemini AI";
  }, [aiSettings]);

  const proxiedArticleContent = useMemo(() => {
    if (!activeArticle) return '';
    return proxyHtmlImages(activeArticle.content || activeArticle.description);
  }, [activeArticle]);

  const readingViewAvatar = useMemo(() => {
    const fallback = proxyImageUrl(`https://ui-avatars.com/api/?name=${encodeURIComponent(selectedFeed?.title || 'A')}`);
    return getMediaUrl(selectedFeed?.image) || fallback;
  }, [selectedFeed]);

  // Pull-to-refresh states (mobile only)
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartYRef = useRef(0);
  const isPullingRef = useRef(false);

  // Refresh current selected feed (for pull-to-refresh)
  const refreshSelectedFeed = useCallback(async () => {
    if (!selectedFeed || !selectedFeedMeta || isRefreshing) return;

    setIsRefreshing(true);
    setErrorMsg(null);
    try {
      const updated = await fetchRSS(selectedFeedMeta.id);
      const mergedItems = mergeFeedItems(selectedFeed.items, updated.items);

      // Preserve original config fields (title override, category, isSub)
      const finalFeed: Feed = {
        ...updated,
        title: selectedFeedMeta.customTitle || updated.title,
        category: selectedFeedMeta.category,
        isSub: selectedFeedMeta.isSub,
        items: mergedItems,
      };

      // 更新内存缓存
      setFeedContentCache(prev => ({ ...prev, [selectedFeedMeta.id]: finalFeed }));
      // 保存到本地缓存
      saveFeedToLocalCache(selectedFeedMeta.id, finalFeed);
      // Update selectedFeed reference
      setSelectedFeed(finalFeed);
    } catch (e) {
      console.error(e);
      setErrorMsg("刷新订阅源时出错。");
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedFeed, selectedFeedMeta, isRefreshing, mergeFeedItems]);

  // Pull-to-refresh touch handlers (mobile only, article list view)
  useEffect(() => {
    const listEl = articleListRef.current;
    // Only enable when viewing article list (not article detail)
    if (!listEl || !selectedFeed || activeArticle) return;

    const isMobile = () => window.innerWidth < 1024;
    const PULL_THRESHOLD = 60;

    const onTouchStart = (e: TouchEvent) => {
      if (!isMobile()) return;
      if (listEl.scrollTop > 0) return; // Only allow pull when at top

      const touch = e.touches[0];
      pullStartYRef.current = touch.clientY;
      isPullingRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isMobile()) return;
      if (isRefreshing) return;

      const touch = e.touches[0];
      const deltaY = touch.clientY - pullStartYRef.current;

      // Only trigger pull-to-refresh when at top and pulling down
      if (deltaY > 0 && listEl.scrollTop === 0) {
        isPullingRef.current = true;
        // Apply damping to avoid over-pulling
        const distance = Math.min(deltaY * 0.5, 120);
        setPullDistance(distance);
        // Prevent default scroll behavior when pulling
        e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (!isMobile()) return;

      if (isPullingRef.current && pullDistance >= PULL_THRESHOLD) {
        // Trigger refresh
        refreshSelectedFeed();
      }

      // Reset pull state
      isPullingRef.current = false;
      setPullDistance(0);
    };

    listEl.addEventListener('touchstart', onTouchStart, { passive: true });
    listEl.addEventListener('touchmove', onTouchMove, { passive: false });
    listEl.addEventListener('touchend', onTouchEnd, { passive: true });
    listEl.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      listEl.removeEventListener('touchstart', onTouchStart);
      listEl.removeEventListener('touchmove', onTouchMove);
      listEl.removeEventListener('touchend', onTouchEnd);
      listEl.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [selectedFeed, activeArticle, isRefreshing, pullDistance, refreshSelectedFeed]);

  const openHelp = useCallback(async () => {
    setShowHelp(true);
    if (!helpContent) {
      try {
        const res = await fetch('/help.md');
        const text = await res.text();
        setHelpContent(text);
      } catch (e) {
        console.error('Failed to load help content:', e);
        setHelpContent('加载说明文档失败，请稍后重试。');
      }
    }
  }, [helpContent]);

  return (
    <div className="flex h-screen bg-white font-sans text-slate-900 overflow-hidden relative dark:bg-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className={`fixed inset-0 bg-black/40 z-30 lg:hidden ${isSidebarOpen ? 'block' : 'hidden'}`} onClick={() => setIsSidebarOpen(false)} />
      <div className={`fixed inset-y-0 left-0 z-40 w-72 flex flex-col bg-flat-50 border-r border-flat-200 transition-transform duration-200 dark:bg-slate-900 dark:border-slate-800 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 ${!isSidebarOpen && 'lg:hidden'} shrink-0`}>
        <div className="p-4 border-b border-flat-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-1">
            <div onClick={handleBackToDashboard} className="cursor-pointer flex items-center gap-2">
              <div className="bg-accent text-white w-8 h-8 flex items-center justify-center text-sm font-bold">
                NS
              </div>
              <h1 className="text-lg font-bold text-flat-900 dark:text-slate-100">RSS Reader</h1>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1 text-flat-400 hover:text-accent transition-colors lg:hidden"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          <p className="text-[10px] text-flat-400 font-semibold uppercase tracking-wider">Information Hub</p>
          {errorMsg && <p className="text-[10px] text-red-500 mt-1 font-medium">{errorMsg}</p>}
        </div>
        <div className="flex items-center justify-between px-4 py-3 bg-flat-100 dark:bg-slate-800/50">
          <span className="text-[10px] font-bold text-flat-500 uppercase tracking-widest">Feeds</span>
          <div className="flex border border-flat-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => setSidebarMode('list')}
              className={`p-1.5 transition-colors ${sidebarMode === 'list' ? 'bg-accent text-white' : 'bg-white text-flat-500 hover:bg-flat-50 dark:bg-slate-800 dark:text-slate-400'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <button
              onClick={() => setSidebarMode('grid')}
              className={`p-1.5 border-l border-flat-200 dark:border-slate-700 transition-colors ${sidebarMode === 'grid' ? 'bg-accent text-white' : 'bg-white text-flat-500 hover:bg-flat-50 dark:bg-slate-800 dark:text-slate-400'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
          <div className={`${sidebarMode === 'grid' ? 'flex flex-col gap-3' : 'flex flex-col gap-2'}`}>
            {sidebarMode === 'grid' ? (
              // Grid 模式：iOS文件夹风格
              (() => {
                // 当前在某个文件夹内

                if (openFolderPath) {
                  const currentNode = getNodeByPath(groupedFeeds, openFolderPath);
                  if (!currentNode) {
                    setOpenFolderPath(null);
                    return null;
                  }
                  const childrenArray = Array.from(currentNode.children.values());
                  return (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full">
                      {/* 返回按钮 */}
                      <button
                        onClick={() => {
                          const parts = openFolderPath.split('/').filter(Boolean);
                          setOpenFolderPath(parts.length <= 1 ? null : parts.slice(0, -1).join('/'));
                        }}
                        className="flex items-center gap-2 px-2 py-2 mb-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-blue-600 dark:text-blue-400 w-full"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                        </svg>
                        <span className="text-sm font-semibold truncate">{currentNode.name}</span>
                      </button>
                      {/* 文件夹内容：直属订阅源 + 子文件夹 */}
                      <div className="grid grid-cols-2 gap-2">
                        {currentNode.feeds.map(meta => {
                          const content = feedContentCache[meta.id] || null;
                          return <FeedItem key={meta.id} feedMeta={meta} feedContent={content} mode="grid" isSelected={selectedFeedMeta?.id === meta.id} isLoading={loadingFeedId === meta.id} onSelect={handleFeedSelect} />;
                        })}
                        {childrenArray.map(child => renderSubfolder(child, setOpenFolderPath))}

                      </div>
                    </motion.div>
                  );
                }

                // 根级别视图
                const rootNodes = Array.from(groupedFeeds.entries());
                const uncategorized = rootNodes.find(([key]) => key === '__uncategorized__');
                const categories = rootNodes.filter(([key]) => key !== '__uncategorized__');

                return (
                  <>
                    {/* 无分类的源直接显示为缩略图 */}
                    {uncategorized && uncategorized[1].feeds.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {uncategorized[1].feeds.map(meta => {
                          const content = feedContentCache[meta.id] || null;
                          return <FeedItem key={meta.id} feedMeta={meta} feedContent={content} mode="grid" isSelected={selectedFeedMeta?.id === meta.id} isLoading={loadingFeedId === meta.id} onSelect={handleFeedSelect} />;
                        })}
                      </div>
                    )}
                    {/* 一级分类显示为文件夹 */}
                    <div className="grid grid-cols-2 gap-3">
                      {categories.map(([, node]) => renderFolder(node, setOpenFolderPath, feedContentCache))}

                    </div>
                  </>
                );
              })()
            ) : (
              // List 模式：层级分组显示
              (() => {
                 const rootNodes = Array.from(groupedFeeds.entries());

                return rootNodes.map(([key, node], idx) => {
                  if (key === '__uncategorized__') {
                    // 无分类的源直接渲染
                    return node.feeds.map(meta => {
                      const content = feedContentCache[meta.id] || null;
                      return (
                        <FeedItem
                          key={meta.id}
                          feedMeta={meta}
                          feedContent={content}
                          mode="list"
                          isSelected={selectedFeedMeta?.id === meta.id}
                          isLoading={loadingFeedId === meta.id}
                          onSelect={handleFeedSelect}
                        />
                      );
                    });
                  }
                  return renderCategoryNode(node, idx === 0, collapsedCategories, toggleCategoryCollapse, feedContentCache, selectedFeedMeta, loadingFeedId, handleFeedSelect);

                });
              })()
            )}
            {loading && <div className="flex justify-center p-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div></div>}
          </div>
        </div>
        <div className="p-2 border-t border-flat-200 bg-flat-100 mt-auto flex gap-2 dark:bg-slate-900 dark:border-slate-800">
          <button onClick={() => setShowSettings(true)} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-flat-600 hover:text-accent hover:bg-flat-200 transition-colors dark:text-slate-400 dark:hover:bg-slate-800">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-4 h-4"
            >
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.89 3.31.877 2.42 2.42a1.724 1.724 0 001.067 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.067 2.572c.89 1.543-.877 3.31-2.42 2.42a1.724 1.724 0 00-2.572 1.067c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.067c-1.543.89-3.31-.877-2.42-2.42a1.724 1.724 0 00-1.067-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.067-2.572c-.89-1.543.877-3.31 2.42-2.42a1.724 1.724 0 002.573-1.066z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="text-xs font-bold uppercase tracking-wider">Settings</span>
          </button>
          <button onClick={() => setDarkMode(!darkMode)} className="p-2 aspect-square flex items-center justify-center text-flat-600 hover:text-accent hover:bg-flat-200 transition-colors dark:text-slate-400 dark:hover:bg-slate-800" title={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
            {darkMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full bg-transparent relative overflow-hidden min-w-0">
        {!selectedFeed && (
          <div className="h-full overflow-y-auto p-4 md:p-12 custom-scrollbar bg-flat-50 dark:bg-slate-950">
            <div className="max-w-5xl mx-auto">
              <header className="mb-10 flex items-center gap-4">
                {!isSidebarOpen && (
                  <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-flat-500 hover:text-accent transition-colors" title="Expand Sidebar">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                )}
                <div><h2 className="text-3xl font-black text-flat-900 dark:text-white tracking-tight">Dashboard</h2><p className="text-flat-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-widest">News Ecosystem Overview</p></div>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white border border-flat-200 p-6 flex items-center gap-6 dark:bg-slate-800 dark:border-slate-700">
                  <div className="bg-flat-100 border border-flat-200 p-4 text-flat-700">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-flat-500 uppercase tracking-widest">Total Articles</p>
                    <h3 className="text-2xl font-black text-flat-900 dark:text-white">{feeds.reduce((acc, f) => acc + f.items.length, 0)}</h3>
                  </div>
                </div>
                <div className="bg-white border border-flat-200 p-6 flex items-center gap-6 dark:bg-slate-800 dark:border-slate-700">
                  <div className="bg-flat-100 border border-flat-200 p-4 text-flat-700">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 19.5v-.75a7.5 7.5 0 00-7.5-7.5H4.5m0-6.75h.75c7.87 0 14.25 6.38 14.25 14.25v.75M6 18.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-flat-500 uppercase tracking-widest">Active Feeds</p>
                    <h3 className="text-2xl font-black text-flat-900 dark:text-white">{feeds.length}</h3>
                  </div>
                </div>
              </div>
              <div className="bg-white border border-flat-200 p-8 dark:bg-slate-800 dark:border-slate-700">
                <StatsChart feeds={feeds} isDarkMode={darkMode} />
              </div>
            </div>
          </div>
        )}
        {selectedFeed && !activeArticle && (
          <div className="h-full flex flex-col animate-fade-in">
            <div className="h-16 px-4 md:px-8 flex items-center justify-between bg-white border-b border-flat-200 sticky top-0 z-20 shrink-0 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3 overflow-hidden">
                {!isSidebarOpen && (
                  <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-flat-500 hover:text-accent transition-colors" title="Expand Sidebar">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                )}
                <div className="overflow-hidden">
                  <h2 className="text-lg font-black text-flat-900 truncate dark:text-slate-100 uppercase tracking-tight">{selectedFeed.title}</h2>
                  <p className="text-[10px] text-flat-400 font-bold uppercase tracking-widest hidden sm:block">{selectedDate ? `Filtered: ${selectedDate.toLocaleDateString()}` : 'Latest Content'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors border ${isRightSidebarOpen ? 'bg-accent text-white border-accent' : 'bg-white text-flat-600 border-flat-200 hover:bg-flat-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`} title="Toggle Right Sidebar">
                  {isRightSidebarOpen ? 'Close Filters' : 'Open Filters'}
                </button>
              </div>
            </div>
            <FilterBar activeFilters={activeFilters} onToggleFilter={handleFilterToggle} onReset={() => setActiveFilters([])} onAnalyze={handleRunAnalysis} isAnalyzing={isAnalyzing} analysisSuccess={analysisSuccess} selectedDate={selectedDate} />
            <div ref={articleListRef} className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-flat-50 dark:bg-slate-950">
              {/* Pull-to-refresh indicator (mobile only) */}
              <div
                className="lg:hidden flex items-center justify-center text-xs text-organic-600 overflow-hidden transition-all duration-200 ease-out"
                style={{
                  height: pullDistance > 0 || isRefreshing ? Math.max(pullDistance, isRefreshing ? 40 : 0) : 0,
                  opacity: pullDistance > 0 || isRefreshing ? 1 : 0,
                }}
              >
                {isRefreshing ? (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-organic-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="font-bold">正在刷新...</span>
                  </div>
                ) : pullDistance >= 60 ? (
                  <div className="flex items-center gap-1 text-organic-600 font-bold">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                    </svg>
                    <span>释放刷新</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 font-bold">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L3 6m0 0l6-6M3 6h12a6 6 0 010 12h-3" />
                    </svg>
                    <span>下拉刷新</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">
                {paginatedArticlesWithCategory.map(article => (
                  <ArticleCard
                    key={article.guid || article.link}
                    article={article}
                    isSelected={false}
                    isRead={readArticleIds.has(article.guid || article.link)}
                    onClick={() => handleArticleSelect(article)}
                  />
                ))}
              </div>
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="py-12 mt-4 space-y-3">
                  <div className="hidden md:flex items-center justify-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-6 py-2 rounded-full text-xs font-bold transition-all glass-card hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700 dark:text-slate-200"
                    >
                      上一页
                    </button>
                    <div className="flex items-center gap-1 glass-card p-1 rounded-full dark:bg-slate-800 dark:border-slate-700">
                      {visiblePageTokens.map(token => {
                        if (typeof token === 'string') {
                          return (
                            <span key={token} className="w-8 h-8 inline-flex items-center justify-center text-xs font-bold text-organic-600 dark:text-slate-400">
                              ···
                            </span>
                          );
                        }
                        return (
                          <button
                            key={`page-${token}`}
                            onClick={() => setCurrentPage(token)}
                            className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${currentPage === token ? 'bg-organic-800 text-white shadow-soft-md dark:bg-slate-200 dark:text-slate-900' : 'hover:bg-white/50 text-organic-600 dark:text-slate-400 dark:hover:bg-slate-700'}`}
                          >
                            {token}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-6 py-2 rounded-full text-xs font-bold transition-all glass-card hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700 dark:text-slate-200"
                    >
                      下一页
                    </button>
                  </div>

                  <div className="flex md:hidden items-center justify-between gap-3">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="flex-1 px-4 py-2 rounded-full text-xs font-bold transition-all glass-card hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                    >
                      上一页
                    </button>
                    <div className="glass-card px-4 py-2 rounded-full text-[10px] font-bold text-organic-600 whitespace-nowrap dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400">
                      {currentPage} / {totalPages}
                    </div>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="flex-1 px-4 py-2 rounded-full text-xs font-bold transition-all glass-card hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
              {(isLoadingMoreHistory || canLoadMoreHistory) && (
                <div className="py-8 text-center text-[10px] font-bold text-organic-600 uppercase tracking-[0.2em]">
                  {isLoadingMoreHistory ? '正在加载更早的内容…' : '滑动到底部以加载更早的内容'}
                </div>
              )}
            </div>
            <p className="text-center text-[10px] font-bold text-organic-600 pb-4 uppercase tracking-widest">
              共 {filteredArticles.length} 篇文章 • 第 {currentPage} / {totalPages || 1} 页
            </p>
            <button
              type="button"
              aria-label="返回顶部"
              onClick={handleScrollToTop}
              className={`md:hidden fixed bottom-6 right-6 z-30 w-12 h-12 bg-organic-800 text-white rounded-full shadow-soft-lg flex items-center justify-center transition-all duration-300 ease-in-out hover:bg-organic-900 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-organic-500 ${showScrollToTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
              </svg>
            </button>
          </div>
        )}
        {activeArticle && (
          <div className="h-full flex flex-col bg-transparent animate-slide-in">
            <div className="h-16 border-b border-flat-200 flex items-center justify-between px-2 md:px-6 bg-white sticky top-0 z-20 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {!isSidebarOpen && (
                  <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-flat-500 hover:text-accent transition-colors mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                )}
                <button onClick={handleBackToArticles} className="flex items-center gap-2 text-flat-600 hover:text-accent px-3 py-1.5 transition-colors font-bold text-[10px] uppercase tracking-widest border border-flat-200 dark:border-slate-700 dark:text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                  <span className="hidden sm:inline">Back</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <select value={targetLang} onChange={(e) => setTargetLang(e.target.value as Language)} className="px-3 py-1.5 bg-flat-50 border border-flat-200 text-[10px] font-bold text-flat-700 focus:outline-none focus:border-accent cursor-pointer truncate max-w-[5rem] md:max-w-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">{Object.values(Language).map(lang => <option key={lang} value={lang}>{lang}</option>)}</select>
                <button onClick={handleTranslateToggle} disabled={isTranslating} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors border ${isTranslating ? 'bg-flat-100 text-flat-400 cursor-wait dark:bg-slate-800 dark:text-slate-600' : showTranslation ? 'bg-accent text-white border-accent' : 'bg-white text-accent border-accent hover:bg-flat-50 dark:bg-slate-900'}`}>
                  {isTranslating ? 'Translating...' : showTranslation ? 'Show Original' : 'AI Translate'}
                </button>
                <button onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)} className={`p-2 border transition-colors ml-2 ${isRightSidebarOpen ? 'bg-accent text-white border-accent' : 'bg-white text-flat-500 border-flat-200 hover:bg-flat-50 dark:bg-slate-800 dark:border-slate-700'}`} title="Toggle Right Sidebar">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-8 md:px-10 custom-scrollbar bg-white dark:bg-slate-950">
              <div className="max-w-3xl mx-auto pb-20">
                <h1 className="text-3xl md:text-4xl font-black text-flat-900 mb-6 leading-tight dark:text-white tracking-tight">{activeArticle.title}</h1>
                <div className="flex items-center gap-4 text-[10px] text-flat-500 mb-8 pb-4 border-b border-flat-100 dark:border-slate-800">
                  <div className="flex flex-col">
                    <span className="font-bold text-flat-900 uppercase tracking-widest dark:text-slate-200">{activeArticle.author || activeArticle.feedTitle}</span>
                    <span className="font-semibold">{new Date(activeArticle.pubDate).toLocaleString().replace(',', '')}</span>
                  </div>
                </div>

                {showTranslation && translatedContent && (
                  <div className="text-[10px] font-bold text-flat-600 mb-8 px-4 py-2 bg-flat-50 border-l-2 border-accent dark:bg-slate-800/50 dark:text-slate-400">
                    TRANSLATED BY {getTranslatorName().toUpperCase()}
                  </div>
                )}

                <div
                  className={`prose prose-slate max-w-none dark:prose-invert prose-img:rounded-none selection:bg-accent selection:text-white`}
                  dangerouslySetInnerHTML={{ __html: showTranslation && translatedContent ? translatedContent : proxiedArticleContent }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      {selectedFeed && (
        <div className={`fixed inset-y-0 right-0 z-30 w-72 bg-white border-l border-flat-200 transform transition-transform duration-200 ${isRightSidebarOpen ? 'translate-x-0' : 'translate-x-full'} lg:relative lg:translate-x-0 dark:bg-slate-900 dark:border-slate-800 ${!isRightSidebarOpen && 'lg:hidden'}`}>
          <div className="flex flex-col h-full p-4 gap-6 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-flat-900 text-[10px] tracking-widest uppercase dark:text-slate-300">Filters & AI</h3>
              <button onClick={() => setIsRightSidebarOpen(false)} className="p-1 text-flat-400 hover:text-accent transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div>
              <h4 className="text-[10px] font-bold text-flat-400 uppercase tracking-widest mb-3">Calendar</h4>
              <div className="border border-flat-100 p-1 dark:border-slate-800">
                <CalendarWidget selectedDate={selectedDate} onDateSelect={handleDateSelect} />
              </div>
            </div>
            <div className="flex-1 flex flex-col min-h-0 border border-flat-200 dark:border-slate-800">
              <div className="p-3 bg-flat-50 border-b border-flat-200 flex items-center justify-between dark:bg-slate-800/50 dark:border-slate-700">
                <h3 className="font-bold text-flat-900 text-[10px] tracking-widest uppercase dark:text-slate-200">Daily Summary</h3>
                {!selectedDate && <span className="text-[8px] font-bold text-flat-400 uppercase">Select Date</span>}
              </div>
              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                {!selectedDate ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <p className="text-flat-400 text-[10px] font-bold uppercase leading-relaxed px-4 tracking-tighter">Choose a date to generate summary</p>
                  </div>
                ) : baseArticles.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <p className="text-flat-400 text-[10px] font-bold uppercase tracking-widest">No articles</p>
                  </div>
                ) : dailySummary ? (
                  <div className="text-xs text-flat-700 leading-relaxed whitespace-pre-wrap font-medium dark:text-slate-300">{dailySummary}</div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center">
                    <button onClick={handleRunAnalysis} disabled={isAnalyzing} className="px-4 py-2 text-[10px] font-bold text-white uppercase tracking-widest transition-colors bg-accent hover:bg-accent-dark disabled:opacity-50 disabled:cursor-wait">
                      {isAnalyzing ? 'Analyzing...' : `Summarize ${baseArticles.length} items`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <SettingsModal isOpen={showSettings} onClose={() => { setShowSettings(false); initFeeds(); }} settings={aiSettings} onSave={handleSaveSettings} imageProxyMode={imageProxyMode} onImageProxyModeChange={handleImageProxyModeChange} />
      {showHelp && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">使用说明</h2>
              <button onClick={() => setShowHelp(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-h2:text-xl prose-h3:text-lg prose-p:text-slate-600 dark:prose-p:text-slate-300 prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50 dark:prose-blockquote:bg-blue-900/20 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-li:text-slate-600 dark:prose-li:text-slate-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{helpContent}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Image Proxy Mode Selection Modal (First Visit) */}
      {showProxyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">欢迎使用 NSYC 订阅站</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">请选择图片加载模式。您可以稍后在设置中更改此选项。</p>
            </div>
            <div className="p-6 space-y-3">
              <button
                onClick={() => handleImageProxyModeChange('all')}
                className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/20 transition-all text-left"
              >
                <div className="font-semibold text-slate-800 dark:text-white">代理图片</div>
                <div className="text-sm text-slate-500 dark:text-slate-300 mt-1">所有图片通过服务器代理加载。适合无法直接访问 Twitter 等平台的用户。</div>
              </button>
              <button
                onClick={() => handleImageProxyModeChange('none')}
                className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/20 transition-all text-left"
              >
                <div className="font-semibold text-slate-800 dark:text-white">直接加载</div>
                <div className="text-sm text-slate-500 dark:text-slate-300 mt-1">所有图片直接加载，不消耗服务器流量。适合可以直接访问所有图片源的用户。</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;