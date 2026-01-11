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

// ... (rest of the code remains the same)
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

const FeedItem: React.FC<FeedItemProps> = ({ feedMeta, feedContent, mode, isSelected, isLoading, onSelect }) => {
  const displayTitle = feedMeta.customTitle || feedContent?.title || feedMeta.id;
  const fallbackAvatar = useMemo(() => proxyImageUrl(`https://ui-avatars.com/api/?name=${encodeURIComponent(displayTitle)}&background=b88057&color=fff&size=128`), [displayTitle]);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; size: number }>>([]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 2;
    
    const newRipple = { id: Date.now(), x, y, size };
    setRipples(prev => [...prev, newRipple]);
    
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== newRipple.id));
    }, 600);

    onSelect(feedMeta);
  }, [onSelect, feedMeta]);

  if (mode === 'grid') {
    return (
      <motion.div 
        className="relative group w-full"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: easeDecelerate }}
      >
        <motion.button
          onClick={handleClick}
          className={`relative aspect-square rounded-organic-md overflow-hidden border w-full block transition-all duration-300 ${isSelected ? 'ring-2 ring-organic-500 border-transparent shadow-soft-lg' : 'border-organic-200 dark:border-slate-700 hover:border-organic-300'}`}
          title={displayTitle}
          whileHover={{ 
            scale: 1.05,
            y: -4,
            transition: { duration: 0.2, ease: easeStandard }
          }}
          whileTap={{ 
            scale: 0.95,
            transition: { duration: 0.1, ease: easeStandard }
          }}
        >
          {/* 波纹效果 */}
          {ripples.map(ripple => (
            <motion.span
              key={ripple.id}
              className="absolute rounded-full pointer-events-none z-30"
              style={{
                left: ripple.x - ripple.size / 2,
                top: ripple.y - ripple.size / 2,
                width: ripple.size,
                height: ripple.size,
                backgroundColor: 'rgba(255, 255, 255, 0.4)',
              }}
              initial={{ scale: 0, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 0 }}
              transition={{ duration: 0.6, ease: easeDecelerate }}
            />
          ))}
          <motion.img 
            src={getMediaUrl(feedContent?.image) || fallbackAvatar} 
            alt={displayTitle} 
            className="w-full h-full object-cover" 
            onError={(e) => { (e.target as HTMLImageElement).src = fallbackAvatar; }}
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.5, ease: easeStandard }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-organic-900/90 via-organic-900/20 to-transparent flex flex-col justify-end p-3">
            <p className="text-white text-[10px] font-bold line-clamp-2 leading-tight drop-shadow-md text-left">{displayTitle}</p>
          </div>
          {isSelected && (
            <motion.div 
              className="absolute top-2 right-2 w-3 h-3 bg-organic-500 rounded-full border-2 border-white shadow-soft-md"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            />
          )}
          {/* Loading indicator */}
          {isLoading && (
            <div className="absolute inset-0 bg-white/40 dark:bg-slate-950/40 backdrop-blur-xs flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-organic-600"></div>
            </div>
          )}
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className={`relative group w-full ${feedMeta.isSub ? 'pl-6' : ''}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: easeDecelerate }}
    >
      {feedMeta.isSub && <div className="absolute left-3 top-0 bottom-1/2 w-3 border-l-2 border-b-2 border-organic-200 dark:border-slate-700 rounded-bl-lg -z-10"></div>}
      <motion.button
        onClick={handleClick}
        className={`flex items-center gap-3 w-full p-2.5 rounded-organic-md text-left pr-8 relative overflow-hidden transition-all duration-300 ${isSelected ? 'bg-organic-100 text-organic-800 shadow-soft-md ring-1 ring-organic-200 dark:bg-stone-800/50 dark:text-stone-200 dark:ring-stone-700' : 'text-slate-600 hover:bg-organic-50/80 dark:text-slate-300'}`}
        whileHover={{ 
          x: 4,
          transition: { duration: 0.2, ease: easeStandard }
        }}
        whileTap={{ 
          scale: 0.98,
          transition: { duration: 0.1, ease: easeStandard }
        }}
      >
        {/* 波纹效果 */}
        {ripples.map(ripple => (
          <motion.span
            key={ripple.id}
            className="absolute rounded-full pointer-events-none z-10"
            style={{
              left: ripple.x - ripple.size / 2,
              top: ripple.y - ripple.size / 2,
              width: ripple.size,
              height: ripple.size,
              backgroundColor: isSelected ? 'rgba(198, 154, 114, 0.3)' : 'rgba(212, 182, 147, 0.2)',
            }}
            initial={{ scale: 0, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 0.6, ease: easeDecelerate }}
          />
        ))}
        {/* 头像：有内容时显示真实图片，无内容时显示骨架 */}
        {feedContent ? (
          <motion.img 
            src={getMediaUrl(feedContent.image) || fallbackAvatar} 
            alt="" 
            className="w-9 h-9 rounded-organic-md object-cover bg-organic-100 shrink-0 border border-white/40" 
            onError={(e) => { (e.target as HTMLImageElement).src = fallbackAvatar; }}
            whileHover={{ scale: 1.1, rotate: 3 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          />
        ) : (
          <div className="w-9 h-9 rounded-organic-md bg-organic-200 dark:bg-slate-700 shrink-0 animate-pulse" />
        )}
        <div className="flex-1 overflow-hidden">
          <p className={`font-bold text-sm truncate ${isSelected ? 'text-organic-900 dark:text-stone-200' : 'text-slate-700 dark:text-slate-300'}`}>{displayTitle}</p>
          {/* 文章数：有内容时显示真实数量，无内容时显示骨架 */}
          {feedContent ? (
            <p className="text-[10px] text-organic-600 truncate font-medium">{feedContent.items.length} 条更新</p>
          ) : (
            <div className="h-3 w-16 bg-organic-100 dark:bg-slate-700 rounded animate-pulse mt-1" />
          )}
        </div>
        {/* Loading spinner when this feed is being loaded */}
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-organic-500"></div>
          </div>
        )}
      </motion.button>
    </motion.div>
  );
};

// --- Filter Bar Component ---
interface FilterBarProps {
  activeFilters: string[]; onToggleFilter: (filter: string) => void; onReset: () => void;
  onAnalyze: () => void; isAnalyzing: boolean; analysisSuccess: boolean; selectedDate: Date | null;
}
const FilterBar: React.FC<FilterBarProps> = ({ activeFilters, onToggleFilter, onReset, onAnalyze, isAnalyzing, analysisSuccess, selectedDate }) => {
  const filters = [ArticleCategory.OFFICIAL, ArticleCategory.MEDIA, ArticleCategory.EVENT, ArticleCategory.COMMUNITY, ArticleCategory.RETWEET,];
  return (
    <div className="flex justify-center sticky top-0 z-20 py-4 pointer-events-none">
      <motion.div 
        className="flex items-center gap-2 py-2 px-3 glass-card rounded-full pointer-events-auto shadow-soft-lg mx-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: easeOutBack }}
      >
        <motion.button 
          onClick={onAnalyze} 
          disabled={isAnalyzing || !selectedDate} 
          className={`shrink-0 flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${isAnalyzing ? 'bg-organic-100 text-organic-700 cursor-wait' : analysisSuccess ? 'bg-green-100 text-green-700' : !selectedDate ? 'bg-organic-200 text-organic-600 cursor-not-allowed' : 'bg-organic-800 text-white hover:bg-organic-900 shadow-soft-md'}`}
          whileHover={isAnalyzing || !selectedDate ? {} : { scale: 1.05, y: -1 }}
          whileTap={isAnalyzing || !selectedDate ? {} : { scale: 0.95 }}
          title={!selectedDate ? "请先选择日期" : undefined}
        >
          {isAnalyzing ? (
            <>
              <motion.svg 
                className="-ml-1 mr-1 h-3 w-3 text-organic-600" 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </motion.svg>
              <span>分析中...</span>
            </>
          ) : analysisSuccess ? (
            <>
              <motion.svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="currentColor" 
                className="w-3 h-3"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              >
                <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
              </motion.svg>
              <span>完成</span>
            </>
          ) : (
            <>
              <motion.svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="none" 
                className="w-3 h-3"
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 19L13 11" />
                  <path d="M7 21L15 13" />
                  <path d="M13 9.5L14.2 8.3L15.4 9.5L14.2 10.7Z" />
                  <path d="M18 4L18 6" />
                  <path d="M18 9L18 11" />
                  <path d="M17 8L19 8" />
                </g>
              </motion.svg>
              <span>AI 分析</span>
            </>
          )}
        </motion.button>
        <div className="w-px h-4 bg-organic-200 mx-1 shrink-0"></div>
        <motion.button 
          onClick={onReset} 
          className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeFilters.length === 0 ? 'bg-organic-100 text-organic-800 shadow-inner-light' : 'text-organic-600 hover:bg-organic-50'}`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          layout
        >
          全部
        </motion.button>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {filters.map((filter, index) => (
            <motion.button 
              key={filter} 
              onClick={() => onToggleFilter(filter)} 
              disabled={isAnalyzing && !activeFilters.includes(filter)} 
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${activeFilters.includes(filter) ? 'bg-organic-200 text-organic-800' : 'text-organic-600 hover:bg-organic-50'} ${isAnalyzing ? 'opacity-50' : ''}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05, ease: easeDecelerate }}
              whileHover={isAnalyzing ? {} : { scale: 1.05 }}
              whileTap={isAnalyzing ? {} : { scale: 0.95 }}
              layout
            >
              {filter}
            </motion.button>
          ))}
        </div>
      </motion.div>
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
    <div className="flex h-screen bg-organic-50 font-sans text-slate-900 overflow-hidden relative dark:bg-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Organic Breathing Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-soft-purple/30 rounded-blob blur-3xl animate-blob-morph" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-soft-pink/30 rounded-blob blur-3xl animate-blob-morph" style={{ animationDelay: '-2s' }} />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-soft-cyan/30 rounded-blob blur-3xl animate-blob-morph" style={{ animationDelay: '-4s' }} />
        <div className="absolute bottom-[20%] left-[10%] w-[30%] h-[30%] bg-soft-sage/30 rounded-blob blur-3xl animate-blob-morph" style={{ animationDelay: '-6s' }} />
      </div>

      <div className={`fixed inset-0 bg-black/20 backdrop-blur-xs z-30 lg:hidden ${isSidebarOpen ? 'block' : 'hidden'}`} onClick={() => setIsSidebarOpen(false)} />
      <div className={`fixed inset-y-0 left-0 z-40 w-80 flex flex-col glass-panel m-4 rounded-organic-lg transition-transform duration-300 ease-in-out dark:bg-slate-900/80 dark:border-slate-700 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 ${!isSidebarOpen && 'lg:hidden'} shrink-0`}>
        <div className="p-6 border-b border-white/20">
          <div className="flex items-center justify-between mb-2">
            <div onClick={handleBackToDashboard} className="cursor-pointer flex items-center gap-2 group">
              <div className="bg-organic-600 text-white p-2 rounded-organic-md flex items-center justify-center text-lg shadow-soft-md group-hover:scale-110 transition-transform">
                🌸
              </div>
              <h1 className="text-xl font-extrabold text-organic-900 dark:text-slate-100">NSYC订阅站</h1>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400 hover:text-organic-600 rounded-organic-md transition-colors dark:hover:bg-slate-800" title="收起侧边栏"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 lg:hidden"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 hidden lg:block"><path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" /></svg></button>
          </div>
          <p className="text-xs text-organic-500 font-medium px-1">Make Josei Seiyu Great Again</p>
          {errorMsg && <p className="text-xs text-red-500 mt-2 px-1">{errorMsg}</p>}
          {proxyInfoMsg && !errorMsg && (
            <p className="text-xs text-amber-500 mt-2 px-1">{proxyInfoMsg}</p>
          )}
        </div>
        <div className="flex items-center justify-between px-6 py-4">
          <span className="text-[10px] font-bold text-organic-600 uppercase tracking-[0.2em]">订阅源</span>
          <div className="flex bg-organic-100 rounded-full p-1 gap-1 dark:bg-slate-800">
            <button
              onClick={() => setSidebarMode('list')}
              className={`p-1.5 rounded-full transition-all ${sidebarMode === 'list' ? 'bg-white text-organic-700 shadow-soft-md dark:bg-slate-700' : 'text-organic-600 hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <circle cx="5" cy="7" r="1.25" />
                <circle cx="5" cy="12" r="1.25" />
                <circle cx="5" cy="17" r="1.25" />
                <rect x="8" y="5.5" width="11" height="3" rx="1.5" />
                <rect x="8" y="10.5" width="11" height="3" rx="1.5" />
                <rect x="8" y="15.5" width="11" height="3" rx="1.5" />
              </svg>
            </button>
            <button
              onClick={() => setSidebarMode('grid')}
              className={`p-1.5 rounded-full transition-all ${sidebarMode === 'grid' ? 'bg-white text-organic-700 shadow-soft-md dark:bg-slate-700' : 'text-organic-600 hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="w-4 h-4"
              >
                <rect x="4" y="4" width="7" height="7" rx="2" />
                <rect x="13" y="4" width="7" height="7" rx="2" />
                <rect x="4" y="13" width="7" height="7" rx="2" />
                <rect x="13" y="13" width="7" height="7" rx="2" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
          <div className={`${sidebarMode === 'grid' ? 'flex flex-col gap-3' : 'flex flex-col gap-2'}`}>
            {sidebarMode === 'grid' ? (
              // Grid 模式：iOS文件夹风格
              (() => {
                // 辅助函数：获取指定路径的节点
                const getNodeByPath = (path: string): { name: string; path: string; feeds: FeedMeta[]; children: Map<string, any>; depth: number } | null => {
                  const parts = path.split('/').filter(Boolean);
                  let current: Map<string, any> = groupedFeeds;
                  let node = null;
                  for (const part of parts) {
                    node = current.get(part);
                    if (!node) return null;
                    current = node.children;
                  }
                  return node;
                };

                // 辅助函数：获取前4个订阅源缩略图用于文件夹预览
                const getFolderPreviews = (node: { feeds: FeedMeta[]; children: Map<string, any> }): string[] => {
                  const previews: string[] = [];
                  for (const meta of node.feeds) {
                    if (previews.length >= 4) break;
                    const content = feedContentCache[meta.id];
                    previews.push(getMediaUrl(content?.image) || `https://ui-avatars.com/api/?name=${encodeURIComponent(meta.customTitle || meta.id)}&background=3b82f6&color=fff&size=64`);
                  }
                  if (previews.length < 4) {
                    for (const child of node.children.values()) {
                      const childPreviews = getFolderPreviews(child);
                      for (const p of childPreviews) {
                        if (previews.length >= 4) break;
                        previews.push(p);
                      }
                      if (previews.length >= 4) break;
                    }
                  }
                  return previews;
                };

                // 辅助函数：计算订阅源总数
                const countAllFeeds = (node: { feeds: FeedMeta[]; children: Map<string, any> }): number => {
                  let count = node.feeds.length;
                  node.children.forEach(child => { count += countAllFeeds(child); });
                  return count;
                };

                // 渲染子文件夹图标（用于进入下级分类）
                const renderSubfolder = (node: { name: string; path: string; feeds: FeedMeta[]; children: Map<string, any>; depth: number }) => {
                  const totalCount = countAllFeeds(node);
                  return (
                    <motion.button
                      key={node.path}
                      onClick={() => setOpenFolderPath(node.path)}
                      className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex flex-col items-center justify-center gap-1 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-md">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="white" className="w-6 h-6">
                          <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
                        </svg>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate w-full text-center px-1">{node.name}</span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500">{totalCount}</span>
                    </motion.button>
                  );
                };

                // 渲染一级文件夹（带2x2预览缩略图）
                const renderFolder = (node: { name: string; path: string; feeds: FeedMeta[]; children: Map<string, any>; depth: number }) => {
                  const previews = getFolderPreviews(node);
                  const totalCount = countAllFeeds(node);
                  return (
                    <motion.div key={node.path} className="w-full" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      <button
                        onClick={() => setOpenFolderPath(node.path)}
                        className="w-full p-3 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 border border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 transition-all hover:shadow-lg"
                      >
                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                          {[0, 1, 2, 3].map(i => (
                            <div key={i} className="aspect-square rounded-lg overflow-hidden bg-slate-300 dark:bg-slate-600">
                              {previews[i] ? <img src={proxyImageUrl(previews[i])} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{node.name}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{totalCount}</span>
                        </div>
                      </button>
                    </motion.div>
                  );
                };

                // 当前在某个文件夹内
                if (openFolderPath) {
                  const currentNode = getNodeByPath(openFolderPath);
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
                        {childrenArray.map(child => renderSubfolder(child))}
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
                      {categories.map(([, node]) => renderFolder(node))}
                    </div>
                  </>
                );
              })()
            ) : (
              // List 模式：层级分组显示
              (() => {
                const renderCategoryNode = (node: { name: string; path: string; feeds: FeedMeta[]; children: Map<string, { name: string; path: string; feeds: FeedMeta[]; children: Map<string, any>; depth: number }>; depth: number }, isFirst: boolean = false): React.ReactNode => {
                  const isCollapsed = collapsedCategories.has(node.path);
                  const hasChildren = node.children.size > 0 || node.feeds.length > 0;
                  const childrenArray = Array.from(node.children.values());
                  
                  // 计算该分类下的总订阅源数量（递归）
                  const countFeeds = (n: typeof node): number => {
                    let count = n.feeds.length;
                    n.children.forEach(child => { count += countFeeds(child); });
                    return count;
                  };
                  const totalFeeds = countFeeds(node);
                  
                  return (
                    <div key={node.path} className="w-full">
                      {/* 分类标题 */}
                      {node.name && (
                        <button
                          onClick={() => toggleCategoryCollapse(node.path)}
                          className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group ${isFirst ? '' : 'mt-2'}`}
                          style={{ paddingLeft: `${(node.depth) * 12 + 8}px` }}
                        >
                          <motion.svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-3.5 h-3.5 text-slate-400 shrink-0"
                            animate={{ rotate: isCollapsed ? -90 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                          </motion.svg>
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate flex-1 text-left">
                            {node.name}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                            {totalFeeds}
                          </span>
                        </button>
                      )}
                      
                      {/* 子内容（带动画） */}
                      <AnimatePresence initial={false}>
                        {(!node.name || !isCollapsed) && hasChildren && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: easeStandard }}
                            className="overflow-hidden"
                          >
                            {/* 该分类直属的订阅源 */}
                            {node.feeds.map(meta => {
                              const content = feedContentCache[meta.id] || null;
                              return (
                                <div key={meta.id} style={{ paddingLeft: `${(node.depth + (node.name ? 1 : 0)) * 12}px` }}>
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
                            
                            {/* 递归渲染子分类 */}
                            {childrenArray.map((child, idx) => renderCategoryNode(child, idx === 0 && node.feeds.length === 0))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                };
                
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
                  return renderCategoryNode(node, idx === 0);
                });
              })()
            )}
            {loading && <div className="flex justify-center p-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div></div>}
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50 mt-auto flex gap-3 dark:bg-slate-900 dark:border-slate-800">
          <button onClick={() => setShowSettings(true)} className="flex-1 flex items-center gap-3 px-4 py-2 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl font-semibold dark:text-slate-400 dark:hover:bg-slate-800">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.89 3.31.877 2.42 2.42a1.724 1.724 0 001.067 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.067 2.572c.89 1.543-.877 3.31-2.42 2.42a1.724 1.724 0 00-2.572 1.067c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.067c-1.543.89-3.31-.877-2.42-2.42a1.724 1.724 0 00-1.067-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.067-2.572c-.89-1.543.877-3.31 2.42-2.42a1.724 1.724 0 002.573-1.066z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="text-sm">设置</span>
          </button>
          <button onClick={openHelp} className="p-2 aspect-square flex items-center justify-center text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl dark:text-slate-400 dark:hover:bg-slate-800" title="查看使用说明">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </button>
          <button onClick={() => setDarkMode(!darkMode)} className="p-2 aspect-square flex items-center justify-center text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl dark:text-slate-400 dark:hover:bg-slate-800" title={darkMode ? "切换到浅色模式" : "切换到深色模式"}>
            {darkMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <div className="flex-1 flex flex-col h-full bg-transparent relative overflow-hidden min-w-0">
        {!selectedFeed && (
          <div className="h-full overflow-y-auto p-4 md:p-12 animate-fade-in custom-scrollbar">
            <div className="max-w-5xl mx-auto">
              <header className="mb-10 flex items-center gap-4">
                {!isSidebarOpen && (
                  <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-organic-500 hover:text-organic-700 rounded-organic-md transition-colors" title="展开侧边栏">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                )}
                <div><h2 className="text-3xl font-extrabold text-organic-900 dark:text-white">仪表盘</h2><p className="text-organic-500 dark:text-slate-300 font-medium">您的多媒体企划新闻生态系统概览。</p></div>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="glass-card p-6 rounded-organic-lg flex items-center gap-6">
                  <div className="bg-soft-purple p-4 organic-shape text-organic-700 shadow-soft-md">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-organic-600 uppercase tracking-[0.2em]">文章总数</p>
                    <h3 className="text-2xl font-black text-organic-900 dark:text-white">{feeds.reduce((acc, f) => acc + f.items.length, 0)}</h3>
                  </div>
                </div>
                <div className="glass-card p-6 rounded-organic-lg flex items-center gap-6">
                  <div className="bg-soft-sage p-4 organic-shape text-organic-700 shadow-soft-md">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 19.5v-.75a7.5 7.5 0 00-7.5-7.5H4.5m0-6.75h.75c7.87 0 14.25 6.38 14.25 14.25v.75M6 18.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-organic-600 uppercase tracking-[0.2em]">活跃订阅源</p>
                    <h3 className="text-2xl font-black text-organic-900 dark:text-white">{feeds.length}</h3>
                  </div>
                </div>
              </div>
              <div className="glass-card p-8 rounded-organic-lg overflow-hidden">
                <StatsChart feeds={feeds} isDarkMode={darkMode} />
              </div>
            </div>
          </div>
        )}
        {selectedFeed && !activeArticle && (
          <div className="h-full flex flex-col animate-fade-in">
            <div className="h-20 px-4 md:px-8 flex items-center justify-between bg-white/40 backdrop-blur-md border-b border-white/20 sticky top-0 z-20 shrink-0 dark:bg-slate-900/60 dark:border-slate-800">
              <div className="flex items-center gap-3 overflow-hidden">
                {!isSidebarOpen && (
                  <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-organic-500 hover:text-organic-700 rounded-organic-md transition-colors" title="展开侧边栏">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                )}
                <img src={getMediaUrl(selectedFeed.image)} className="w-10 h-10 object-contain rounded-organic-md border border-white/40 bg-white/50 hidden sm:block shadow-soft-md dark:bg-slate-800 dark:border-slate-700" alt="" />
                <div className="overflow-hidden">
                  <h2 className="text-lg md:text-xl font-black text-organic-900 truncate dark:text-slate-100">{selectedFeed.title}</h2>
                  <p className="text-[10px] text-organic-600 font-bold uppercase tracking-[0.2em] hidden sm:block">{selectedDate ? `已筛选: ${selectedDate.toLocaleDateString('zh-CN')}` : '最新文章'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)} className={`p-2 rounded-organic-md transition-all shadow-soft-md ${isRightSidebarOpen ? 'bg-organic-600 text-white' : 'glass-card text-organic-500 hover:text-organic-700'}`} title="切换右侧边栏">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </button>
              </div>
            </div>
            <FilterBar activeFilters={activeFilters} onToggleFilter={handleFilterToggle} onReset={() => setActiveFilters([])} onAnalyze={handleRunAnalysis} isAnalyzing={isAnalyzing} analysisSuccess={analysisSuccess} selectedDate={selectedDate} />
            <div ref={articleListRef} className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
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
                {paginatedArticles.map(article => (
                  <ArticleCard
                    key={article.guid || article.link}
                    article={{ ...article, aiCategory: articleClassifications[article.guid] }}
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
            <div className="h-16 border-b border-white/20 flex items-center justify-between px-2 md:px-6 bg-white/60 backdrop-blur-md sticky top-0 z-20 shadow-soft-md dark:bg-slate-900/80 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {!isSidebarOpen && (
                  <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-organic-500 hover:text-organic-700 rounded-organic-md transition-colors mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                )}
                <button onClick={handleBackToArticles} className="flex items-center gap-2 text-organic-600 hover:text-organic-800 px-3 py-1.5 rounded-full hover:bg-white/50 transition-all font-bold text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                  <span className="hidden sm:inline">返回列表</span>
                </button>
              </div>
              <div className="flex items-center gap-1 md:gap-3">
                <div className="flex items-center gap-2 mr-2">
                  <select value={targetLang} onChange={(e) => setTargetLang(e.target.value as Language)} className="px-3 py-1.5 glass-card rounded-full text-xs font-bold text-organic-700 focus:outline-none focus:ring-2 focus:ring-organic-500 cursor-pointer truncate max-w-[5rem] md:max-w-none">{Object.values(Language).map(lang => <option key={lang} value={lang}>{lang}</option>)}</select>
                </div>
                <button onClick={handleTranslateToggle} disabled={isTranslating} className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-soft-md ${isTranslating ? 'bg-organic-200 text-organic-600 cursor-wait dark:bg-slate-800 dark:text-slate-400' : showTranslation ? 'bg-white text-organic-800 hover:bg-organic-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600' : 'bg-organic-800 text-white hover:bg-organic-900'}`}>
                  {isTranslating ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="hidden md:inline">翻译中...</span>
                    </>
                  ) : showTranslation ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                      </svg>
                      <span className="hidden md:inline">查看原文</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
                      </svg>
                      <span className="hidden md:inline">AI 翻译</span>
                    </>
                  )}
                </button>
                <a href={activeArticle.link} target="_blank" rel="noreferrer" className="p-2 text-organic-600 hover:text-organic-800 rounded-full hover:bg-white/50 transition-colors" title="打开原文链接">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
                <button onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)} className={`p-2 rounded-full transition-all shadow-soft-md ml-2 ${isRightSidebarOpen ? 'bg-organic-600 text-white' : 'glass-card text-organic-500 hover:text-organic-700'}`} title="切换右侧边栏">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-8 md:px-10 custom-scrollbar">
              <div className="max-w-4xl mx-auto pb-20 glass-card p-8 md:p-12 rounded-organic-lg shadow-soft-lg">
                <h1 className="text-3xl md:text-5xl font-black text-organic-950 mb-8 leading-tight dark:text-white">{activeArticle.title}</h1>
                <div className="flex items-center gap-4 text-sm text-organic-500 mb-10 pb-8 border-b border-organic-100">
                  <img src={readingViewAvatar} alt="" className="w-12 h-12 rounded-organic-md object-cover ring-4 ring-white shadow-soft-md bg-organic-50" onError={(e) => { (e.target as HTMLImageElement).src = proxyImageUrl(`https://ui-avatars.com/api/?name=${encodeURIComponent(selectedFeed?.title || 'A')}`); }} />
                  <div className="flex flex-col">
                    <span className="font-bold text-organic-900 text-base dark:text-slate-200">{activeArticle.author || activeArticle.feedTitle}</span>
                    <span className="font-medium">{new Date(activeArticle.pubDate).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '')}</span>
                  </div>
                </div>

                {/* Translation Disclaimer / Header */}
                {showTranslation && translatedContent && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-organic-600 mb-8 px-5 py-4 bg-organic-50 rounded-organic-md border-l-4 border-organic-500 shadow-soft-sm dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-600">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-organic-500">
                      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.75 12.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm-1.5-6.5a.75.75 0 100 1.5.75.75 0 000-1.5z" />
                    </svg>
                    <span>由 <span className="text-organic-900">{getTranslatorName()}</span> 翻译</span>
                    <span className="text-organic-200 mx-1">|</span>
                    <div className="flex items-center gap-1">
                      <span>目标语言</span>
                      <select
                        value={targetLang}
                        onChange={(e) => handleLanguageSwitch(e.target.value as Language)}
                        className="bg-transparent font-black text-organic-800 outline-none cursor-pointer hover:text-organic-950 py-0 pr-6 border-none focus:ring-0 text-xs"
                      >
                        {Object.values(Language).map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Content Area (Switches between Translation and Original) */}
                <div
                  className={`prose prose-slate prose-lg max-w-none prose-img:rounded-organic-md prose-img:shadow-soft-lg dark:prose-invert selection:bg-soft-purple selection:text-organic-900`}
                  dangerouslySetInnerHTML={{ __html: showTranslation && translatedContent ? translatedContent : proxiedArticleContent }}
                />

              </div>
            </div>
          </div>
        )}
      </div>
      {selectedFeed && (
        <div className={`fixed inset-y-0 right-0 z-30 w-80 glass-panel m-4 rounded-organic-lg transform transition-transform duration-300 ${isRightSidebarOpen ? 'translate-x-0' : 'translate-x-full'} lg:relative lg:translate-x-0 lg:shadow-soft-lg dark:bg-slate-900/80 dark:border-slate-700 ${!isRightSidebarOpen && 'lg:hidden'}`}>
          <div className="flex flex-col h-full p-6 gap-6 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-organic-900 text-sm tracking-wider uppercase dark:text-slate-300">筛选与 AI</h3>
              <button onClick={() => setIsRightSidebarOpen(false)} className="p-2 text-organic-600 hover:text-organic-800 rounded-full transition-colors dark:hover:bg-slate-800">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div>
              <h4 className="text-[10px] font-bold text-organic-600 uppercase tracking-[0.2em] mb-4">按日期筛选</h4>
              <div className="glass-card rounded-organic-md p-1">
                <CalendarWidget selectedDate={selectedDate} onDateSelect={handleDateSelect} />
              </div>
            </div>
            <div className="flex-1 flex flex-col min-h-0 glass-card rounded-organic-lg overflow-hidden border-none shadow-soft-lg">
              <div className="p-5 bg-gradient-to-r from-soft-purple/20 to-soft-pink/20 border-b border-white/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-organic-900 text-xs tracking-wider uppercase dark:text-slate-200">AI 每日摘要</h3>
                </div>
                {!selectedDate && <span className="text-[9px] font-bold text-organic-500 bg-white/50 px-3 py-1 rounded-full shadow-soft-sm dark:bg-slate-800 dark:text-slate-400">请选择日期</span>}
              </div>
              <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                {!selectedDate ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-soft-purple/20 rounded-blob mb-4 flex items-center justify-center text-2xl">✨</div>
                    <p className="text-organic-600 text-xs font-bold leading-relaxed px-4">请在上方日历中选择一个具体日期以生成摘要。</p>
                  </div>
                ) : baseArticles.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-organic-100 rounded-blob mb-4 flex items-center justify-center text-2xl">📭</div>
                    <p className="text-organic-600 text-xs font-bold">该日期下没有文章。</p>
                  </div>
                ) : dailySummary ? (
                  <div className="text-xs text-organic-800 leading-relaxed whitespace-pre-wrap animate-fade-in font-medium dark:text-slate-300">{dailySummary}</div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center">
                    <button onClick={handleRunAnalysis} disabled={isAnalyzing} className="group relative inline-flex items-center justify-center gap-2 px-6 py-3 font-bold text-white transition-all duration-300 bg-organic-800 rounded-full hover:bg-organic-950 hover:scale-105 shadow-soft-lg disabled:opacity-50 disabled:cursor-wait">
                      {isAnalyzing ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span className="text-xs">分析中...</span>
                        </>
                      ) : (
                        <span className="text-xs">总结 {baseArticles.length} 篇文章</span>
                      )}
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