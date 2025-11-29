import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchRSS, proxyImageUrl, fetchSystemFeeds, setImageProxyMode, getImageProxyMode } from './services/rssService';
import { translateContent, analyzeFeedContent } from './services/geminiService';
import { Feed, Article, Language, ArticleCategory, AISettings, ImageProxyMode } from './types';
import { StatsChart } from './components/StatsChart';
import { ArticleCard } from './components/ArticleCard';
import { CalendarWidget } from './components/CalendarWidget';
import { SettingsModal } from './components/SettingsModal';
import { easeStandard, easeDecelerate } from './components/animations';

// ... (rest of the code remains the same)
type SidebarViewMode = 'list' | 'grid';

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

    return doc.body.innerHTML;
  } catch (e) {
    console.error("Failed to parse and proxy HTML content:", e);
    return html; // Fallback on parsing error
  }
};

// --- Extracted FeedItem Component ---
interface FeedItemProps {
  feed: Feed;
  mode: SidebarViewMode;
  isSelected: boolean;
  onSelect: (feed: Feed) => void;
}

const FeedItem: React.FC<FeedItemProps> = ({ feed, mode, isSelected, onSelect }) => {
  const fallbackAvatar = useMemo(() => proxyImageUrl(`https://ui-avatars.com/api/?name=${encodeURIComponent(feed.title)}&background=3b82f6&color=fff&size=128`), [feed.title]);
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

    onSelect(feed);
  }, [onSelect, feed]);

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
          className={`relative aspect-square rounded-xl overflow-hidden border w-full block ${isSelected ? 'ring-2 ring-blue-500 border-transparent shadow-md' : 'border-slate-200 dark:border-slate-700'}`}
          title={feed.title}
          whileHover={{ 
            scale: 1.05,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
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
            src={feed.image || fallbackAvatar} 
            alt={feed.title} 
            className="w-full h-full object-cover" 
            onError={(e) => { (e.target as HTMLImageElement).src = fallbackAvatar; }}
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.5, ease: easeStandard }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent flex flex-col justify-end p-3">
            <p className="text-white text-xs font-bold line-clamp-2 leading-tight shadow-black drop-shadow-md text-left">{feed.title}</p>
          </div>
          {isSelected && (
            <motion.div 
              className="absolute top-2 right-2 w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-sm"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            />
          )}
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className={`relative group w-full ${feed.isSub ? 'pl-6' : ''}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: easeDecelerate }}
    >
      {feed.isSub && <div className="absolute left-3 top-0 bottom-1/2 w-3 border-l-2 border-b-2 border-slate-200 dark:border-slate-700 rounded-bl-lg -z-10"></div>}
      <motion.button
        onClick={handleClick}
        className={`flex items-center gap-3 w-full p-2.5 rounded-xl text-left pr-8 relative overflow-hidden ${isSelected ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-800' : 'text-slate-600 dark:text-slate-400'}`}
        whileHover={{ 
          backgroundColor: isSelected ? undefined : 'rgba(241, 245, 249, 1)',
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
              backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.3)' : 'rgba(148, 163, 184, 0.3)',
            }}
            initial={{ scale: 0, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 0.6, ease: easeDecelerate }}
          />
        ))}
        <motion.img 
          src={feed.image || fallbackAvatar} 
          alt="" 
          className="w-9 h-9 rounded-lg object-cover bg-slate-200 shrink-0 border border-slate-100 dark:border-slate-700" 
          onError={(e) => { (e.target as HTMLImageElement).src = fallbackAvatar; }}
          whileHover={{ scale: 1.1, rotate: 3 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        />
        <div className="flex-1 overflow-hidden">
          <p className={`font-semibold text-sm truncate ${isSelected ? 'text-blue-800 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>{feed.title}</p>
          <p className="text-xs text-slate-400 truncate">{feed.items.length} 条更新</p>
        </div>
      </motion.button>
    </motion.div>
  );
};

// --- Filter Bar Component ---
interface FilterBarProps {
  activeFilters: string[]; onToggleFilter: (filter: string) => void; onReset: () => void;
  onAnalyze: () => void; isAnalyzing: boolean; analysisSuccess: boolean;
}
const FilterBar: React.FC<FilterBarProps> = ({ activeFilters, onToggleFilter, onReset, onAnalyze, isAnalyzing, analysisSuccess }) => {
  const filters = [ArticleCategory.OFFICIAL, ArticleCategory.MEDIA, ArticleCategory.EVENT, ArticleCategory.COMMUNITY, ArticleCategory.RETWEET,];
  return (
    <motion.div 
      className="flex items-center gap-2 py-3 px-4 md:px-8 border-b border-slate-200 overflow-x-auto custom-scrollbar bg-white sticky top-[81px] z-10 shrink-0 dark:bg-slate-900 dark:border-slate-800"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: easeDecelerate }}
    >
      <motion.button 
        onClick={onAnalyze} 
        disabled={isAnalyzing} 
        className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border shadow-sm ${isAnalyzing ? 'bg-yellow-50 text-yellow-700 border-yellow-200 cursor-wait dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' : analysisSuccess ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-indigo-600 text-white border-transparent'}`}
        whileHover={isAnalyzing ? {} : { scale: 1.05 }}
        whileTap={isAnalyzing ? {} : { scale: 0.95 }}
        transition={{ duration: 0.15, ease: easeStandard }}
      >
        {isAnalyzing ? (
          <>
            <motion.svg 
              className="-ml-1 mr-1 h-3 w-3 text-yellow-600 dark:text-yellow-400" 
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
      <div className="w-px h-6 bg-slate-200 mx-1 shrink-0 dark:bg-slate-700"></div>
      <motion.button 
        onClick={onReset} 
        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border ${activeFilters.length === 0 ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-700' : 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.15, ease: easeStandard }}
        layout
      >
        全部
      </motion.button>
      {filters.map((filter, index) => (
        <motion.button 
          key={filter} 
          onClick={() => onToggleFilter(filter)} 
          disabled={isAnalyzing && !activeFilters.includes(filter)} 
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap ${activeFilters.includes(filter) ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800' : 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800 dark:border-slate-700'} ${isAnalyzing ? 'opacity-50' : ''}`}
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
    </motion.div>
  );
};

const App: React.FC = () => {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  // ... (rest of the code remains the same)
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AISettings>(() => { try { const stored = localStorage.getItem('rss_ai_settings'); return stored ? JSON.parse(stored) : { providers: [], tasks: { general: null, translation: null, summary: null, analysis: null } }; } catch { return { providers: [], tasks: { general: null, translation: null, summary: null, analysis: null } }; } });
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpContent, setHelpContent] = useState<string>('');
  const [darkMode, setDarkMode] = useState(() => { if (typeof window !== 'undefined') { return localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches); } return false; });
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [sidebarMode, setSidebarMode] = useState<SidebarViewMode>('list');
  const [selectedFeed, setSelectedFeed] = useState<Feed | null>(null);
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dailySummary, setDailySummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
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
    if (stored && ['all', 'none', 'twitter-only'].includes(stored)) {
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

  const initFeeds = useCallback(async () => {
    setLoading(true); setErrorMsg(null);
    try {
      // 1. Fetch Configuration from Server
      const feedConfigs = await fetchSystemFeeds();

      if (feedConfigs.length === 0) {
        setFeeds([]);
        setLoading(false);
        return;
      }

      // 2. Fetch Content
      const results = await Promise.allSettled(
        feedConfigs.map(config => fetchRSS(config.id))
      );

      const loadedFeeds: Feed[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const config = feedConfigs[index];
          const fetchedFeed = result.value;

          const finalFeed: Feed = {
            ...fetchedFeed,
            title: config.customTitle || fetchedFeed.title,
            category: config.category,
            isSub: config.isSub,
          };
          loadedFeeds.push(finalFeed);
        } else {
          // Log the error for debugging
          console.error(`Failed to fetch feed with ID ${feedConfigs[index].id}:`, result.reason);
        }
      });

      if (loadedFeeds.length === 0) setErrorMsg("无法加载订阅源。请检查网络连接或后台配置。");

      setFeeds(loadedFeeds);
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
    if (!activeArticle && selectedFeed && articleListRef.current) {
      // A timeout ensures this runs after the list has been rendered.
      const timer = setTimeout(() => {
        if (articleListRef.current) {
          articleListRef.current.scrollTop = scrollPosition;
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeArticle, selectedFeed]);

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
    };

    listEl.addEventListener('scroll', handleScroll, { passive: true });

    // Cleanup
    return () => {
      listEl.removeEventListener('scroll', handleScroll);
    };
  }, [selectedFeed, activeArticle]);

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

  // Reset to page 1 when feed or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFeed, selectedDate, activeFilters]);

  useEffect(() => {
    if (!selectedFeed || !selectedDate) { setDailySummary(null); return; }
    const count = baseArticles.length; if (count === 0) { setDailySummary(null); return; }
    const key = `${selectedFeed.url}-${selectedDate.toDateString()}-${count}`;
    setDailySummary(summaryCache[key] || null);
  }, [selectedDate, selectedFeed, baseArticles, summaryCache]);

  const handleFeedSelect = (feed: Feed) => { setSelectedFeed(feed); setActiveArticle(null); setTranslatedContent(null); setLastTranslatedLang(null); setShowTranslation(false); setSelectedDate(null); setActiveFilters([]); if (window.innerWidth < 1024) setIsSidebarOpen(false); if (window.innerWidth >= 1024) setIsRightSidebarOpen(true); };
  const handleDateSelect = (date: Date | null) => { setSelectedDate(date); setActiveArticle(null); setActiveFilters([]); };

  const handleRunAnalysis = async () => {
    if (!selectedFeed || isAnalyzing) return;

    if (!isAiConfigured) {
      alert("AI 功能未配置。请点击左下角的“设置”按钮，添加 API 提供商并配置「总模型」后重试。");
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
    }
    setActiveArticle(article);
    setTranslatedContent(null);
    setLastTranslatedLang(null);
    setShowTranslation(false);

    const id = article.guid || article.link;
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

  const handleBackToArticles = () => setActiveArticle(null);
  const handleBackToDashboard = () => { setSelectedFeed(null); setActiveArticle(null); setSelectedDate(null); };

  // --- 移动端返回手势拦截逻辑 ---
  // 用于追踪当前的"深度"，避免重复 pushState
  const navigationDepthRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 计算当前应该处于的深度：仪表盘=0，信息流=1，文章详情=2
    let targetDepth = 0;
    if (selectedFeed) targetDepth = 1;
    if (activeArticle) targetDepth = 2;

    // 如果深度增加了，push 新的历史记录
    while (navigationDepthRef.current < targetDepth) {
      window.history.pushState({ depth: navigationDepthRef.current + 1 }, '');
      navigationDepthRef.current++;
    }

    // 如果深度减少了（用户通过 UI 按钮返回），同步 ref
    // 这里不需要 popState，因为是用户主动点击返回按钮
    if (navigationDepthRef.current > targetDepth) {
      navigationDepthRef.current = targetDepth;
    }
  }, [selectedFeed, activeArticle]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (event: PopStateEvent) => {
      // 浏览器后退触发时，根据当前状态决定返回到哪一层
      if (activeArticle) {
        // 当前在文章详情，返回到信息流
        setActiveArticle(null);
        navigationDepthRef.current = 1;
      } else if (selectedFeed) {
        // 当前在信息流，返回到仪表盘
        setSelectedFeed(null);
        setActiveArticle(null);
        setSelectedDate(null);
        navigationDepthRef.current = 0;
      }
      // 如果已经在仪表盘，不拦截，让浏览器正常后退
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeArticle, selectedFeed]);

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
    const feedImage = selectedFeed?.image;
    const fallback = proxyImageUrl(`https://ui-avatars.com/api/?name=${encodeURIComponent(selectedFeed?.title || 'A')}`);
    return feedImage || fallback;
  }, [selectedFeed]);

  // Pull-to-refresh states (mobile only)
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartYRef = useRef(0);
  const isPullingRef = useRef(false);

  // Refresh current selected feed (for pull-to-refresh)
  const refreshSelectedFeed = useCallback(async () => {
    if (!selectedFeed || isRefreshing) return;

    setIsRefreshing(true);
    setErrorMsg(null);
    try {
      const updated = await fetchRSS(selectedFeed.url);

      // Preserve original config fields (title override, category, isSub)
      setFeeds(prev =>
        prev.map(f =>
          f.url === selectedFeed.url
            ? {
                ...updated,
                title: f.title,
                category: f.category,
                isSub: f.isSub,
              }
            : f
        )
      );

      // Update selectedFeed reference
      setSelectedFeed(prev =>
        prev && prev.url === selectedFeed.url
          ? {
              ...updated,
              title: prev.title,
              category: prev.category,
              isSub: prev.isSub,
            }
          : prev
      );
    } catch (e) {
      console.error(e);
      setErrorMsg("刷新订阅源时出错。");
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedFeed, isRefreshing]);

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
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative dark:bg-slate-900 dark:text-slate-100 transition-colors duration-300">
      <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-30 lg:hidden ${isSidebarOpen ? 'block' : 'hidden'}`} onClick={() => setIsSidebarOpen(false)} />
      <div className={`fixed inset-y-0 left-0 z-40 w-80 flex flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 ease-in-out dark:bg-slate-900 dark:border-slate-800 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 ${!isSidebarOpen && 'lg:hidden'} shrink-0`}>
        <div className="p-6 border-b border-slate-100 bg-white dark:bg-slate-900 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <div onClick={handleBackToDashboard} className="cursor-pointer flex items-center gap-2 group">
              <div className="bg-blue-600 text-white p-1.5 rounded-lg flex items-center justify-center text-lg">
                🌸
              </div>
              <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">NSYC订阅站</h1>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg dark:hover:bg-slate-800" title="收起侧边栏"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 lg:hidden"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 hidden lg:block"><path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" /></svg></button>
          </div>
          <p className="text-xs text-slate-400">Make Josei Seiyu Great Again</p>
          {errorMsg && <p className="text-xs text-red-500 mt-2 px-1">{errorMsg}</p>}
        </div>
        <div className="flex items-center justify-between px-6 py-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">订阅源</span>
          <div className="flex bg-slate-100 rounded-lg p-1 gap-1 dark:bg-slate-800">
            <button
              onClick={() => setSidebarMode('list')}
              className={`p-1.5 rounded-md transition-all ${sidebarMode === 'list' ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700' : 'text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
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
              className={`p-1.5 rounded-md transition-all ${sidebarMode === 'grid' ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700' : 'text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
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
          <div className={`${sidebarMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-2'}`}>
            {feeds.map((feed, index) => {
              const prevFeed = feeds[index - 1]; const showCategory = sidebarMode === 'list' && (!prevFeed || feed.category !== prevFeed.category);
              return (<React.Fragment key={feed.url}>{showCategory && feed.category && (<div className="mt-4 mb-2 px-2"><h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{feed.category}</h3></div>)}<FeedItem feed={feed} mode={sidebarMode} isSelected={selectedFeed?.url === feed.url} onSelect={handleFeedSelect} /></React.Fragment>);
            })}
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
      <div className="flex-1 flex flex-col h-full bg-slate-50 relative overflow-hidden min-w-0 dark:bg-black/90">
        {!selectedFeed && (
          <div className="h-full overflow-y-auto p-4 md:p-12 animate-fade-in custom-scrollbar">
            <div className="max-w-5xl mx-auto">
              <header className="mb-10 flex items-center gap-4">
                {!isSidebarOpen && (
                  <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-500 hover:text-blue-600 rounded-lg" title="展开侧边栏">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                )}
                <div><h2 className="text-3xl font-bold text-slate-800 dark:text-white">仪表盘</h2><p className="text-slate-500 dark:text-slate-400">您的多媒体企划新闻生态系统概览。</p></div>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-6 dark:bg-slate-800 dark:border-slate-700">
                  <div className="bg-blue-100 p-3 rounded-full text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-400">文章总数</p>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{feeds.reduce((acc, f) => acc + f.items.length, 0)}</h3>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-6 dark:bg-slate-800 dark:border-slate-700">
                  <div className="bg-purple-100 p-3 rounded-full text-purple-600 dark:bg-purple-900/30 dark:text-purple-300">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 19.5v-.75a7.5 7.5 0 00-7.5-7.5H4.5m0-6.75h.75c7.87 0 14.25 6.38 14.25 14.25v.75M6 18.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-400">活跃订阅源</p>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{feeds.length}</h3>
                  </div>
                </div>
              </div>
              <StatsChart feeds={feeds} />
            </div>
          </div>
        )}
        {selectedFeed && !activeArticle && (
          <div className="h-full flex flex-col animate-fade-in bg-slate-50 dark:bg-slate-950/50">
            <div className="h-20 px-4 md:px-8 flex items-center justify-between bg-white border-b border-slate-200 shadow-sm sticky top-0 z-20 shrink-0 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3 overflow-hidden">
                {!isSidebarOpen && (
                  <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-500 hover:text-blue-600 rounded-lg" title="展开侧边栏">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                )}
                <img src={selectedFeed.image} className="w-10 h-10 object-contain rounded-md border border-slate-100 hidden sm:block" alt="" />
                <div className="overflow-hidden">
                  <h2 className="text-lg md:text-xl font-bold text-slate-800 truncate dark:text-slate-100">{selectedFeed.title}</h2>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider hidden sm:block">{selectedDate ? `已筛选: ${selectedDate.toLocaleDateString('zh-CN')}` : '最新文章'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)} className={`p-2 rounded-lg transition-colors border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 ${isRightSidebarOpen ? 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800' : 'text-slate-500 hover:text-blue-600'}`} title="切换右侧边栏">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </button>
              </div>
            </div>
            <FilterBar activeFilters={activeFilters} onToggleFilter={handleFilterToggle} onReset={() => setActiveFilters([])} onAnalyze={handleRunAnalysis} isAnalyzing={isAnalyzing} analysisSuccess={analysisSuccess} />
            <div ref={articleListRef} className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
              {/* Pull-to-refresh indicator (mobile only) */}
              <div
                className="lg:hidden flex items-center justify-center text-xs text-slate-400 overflow-hidden transition-all duration-200 ease-out"
                style={{
                  height: pullDistance > 0 || isRefreshing ? Math.max(pullDistance, isRefreshing ? 40 : 0) : 0,
                  opacity: pullDistance > 0 || isRefreshing ? 1 : 0,
                }}
              >
                {isRefreshing ? (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>正在刷新...</span>
                  </div>
                ) : pullDistance >= 60 ? (
                  <div className="flex items-center gap-1 text-blue-500">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                    </svg>
                    <span>释放刷新</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
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
                <div className="flex items-center justify-center gap-2 py-6 mt-4">
                  <button
                    onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); articleListRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    disabled={currentPage === 1}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-all border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
                  >
                    上一页
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => { setCurrentPage(page); articleListRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all ${currentPage === page ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700'}`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); articleListRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-all border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
                  >
                    下一页
                  </button>
                </div>
              )}
              <p className="text-center text-xs text-slate-400 pb-4">
                共 {paginatedArticles.length} 篇文章，当前第 {currentPage} / {totalPages || 1} 页
              </p>
            </div>
            <button
              onClick={handleScrollToTop}
              aria-label="返回顶部"
              className={`md:hidden fixed bottom-6 right-6 z-30 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ease-in-out hover:bg-blue-700 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${showScrollToTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
              </svg>
            </button>
          </div>
        )}
        {activeArticle && (
          <div className="h-full flex flex-col bg-white animate-slide-in dark:bg-slate-900">
            <div className="h-16 border-b border-slate-200 flex items-center justify-between px-2 md:px-6 bg-white/95 backdrop-blur sticky top-0 z-20 shadow-sm dark:bg-slate-900/95 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {!isSidebarOpen && (
                  <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-500 hover:text-blue-600 rounded-lg mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                )}
                <button onClick={handleBackToArticles} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                  <span className="font-semibold text-sm hidden sm:inline">返回</span>
                </button>
              </div>
              <div className="flex items-center gap-1 md:gap-3">
                <div className="flex items-center gap-2 mr-2">
                  <select value={targetLang} onChange={(e) => setTargetLang(e.target.value as Language)} className="px-2 py-1.5 md:px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 truncate max-w-[5rem] md:max-w-none">{Object.values(Language).map(lang => <option key={lang} value={lang}>{lang}</option>)}</select>
                </div>
                <button onClick={handleTranslateToggle} disabled={isTranslating} className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-sm font-semibold transition-all shadow-sm ${isTranslating ? 'bg-indigo-100 text-indigo-400 cursor-wait' : showTranslation ? 'bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:bg-slate-800 dark:border-indigo-800' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                  {isTranslating ? (
                    <>
                      <svg className="animate-spin h-4 w-4 md:mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="hidden md:inline">翻译中...</span>
                    </>
                  ) : showTranslation ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 md:mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                      </svg>
                      <span className="hidden md:inline">查看原文</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 md:mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
                      </svg>
                      <span className="hidden md:inline">AI 翻译</span>
                    </>
                  )}
                </button>
                <a href={activeArticle.link} target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-blue-600 rounded-lg dark:hover:bg-slate-800" title="打开原文链接">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
                <button onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)} className={`p-2 rounded-lg transition-colors border border-slate-200 bg-white ml-2 dark:bg-slate-800 dark:border-slate-700 ${isRightSidebarOpen ? 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800' : 'text-slate-500 hover:text-blue-600'}`} title="切换右侧边栏">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-8 md:px-10 custom-scrollbar">
              <div className="max-w-3xl mx-auto pb-20">
                <h1 className="text-2xl md:text-5xl font-extrabold text-slate-900 mb-6 dark:text-white">{activeArticle.title}</h1>
                <div className="flex items-center gap-3 text-sm text-slate-500 mb-10 pb-8 border-b border-slate-100 dark:text-slate-400 dark:border-slate-800">
                  <img src={readingViewAvatar} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-50 dark:ring-slate-800 bg-slate-100 dark:bg-slate-800" onError={(e) => { (e.target as HTMLImageElement).src = proxyImageUrl(`https://ui-avatars.com/api/?name=${encodeURIComponent(selectedFeed?.title || 'A')}`); }} />
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{activeArticle.author || activeArticle.feedTitle}</span>
                    <span>{new Date(activeArticle.pubDate).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '')}</span>
                  </div>
                </div>

                {/* Translation Disclaimer / Header */}
                {showTranslation && translatedContent && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 mb-6 px-4 py-3 bg-slate-100 rounded-lg dark:bg-slate-800 dark:text-slate-400 border-l-4 border-blue-500">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-500">
                      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.75 12.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm-1.5-6.5a.75.75 0 100 1.5.75.75 0 000-1.5z" />
                    </svg>
                    <span>由 <strong>{getTranslatorName()}</strong> 翻译，仅供参考</span>
                    <span className="text-slate-300 mx-1">|</span>
                    <div className="flex items-center gap-1">
                      <span>翻译至</span>
                      <select
                        value={targetLang}
                        onChange={(e) => handleLanguageSwitch(e.target.value as Language)}
                        className="bg-transparent font-bold text-blue-600 outline-none cursor-pointer hover:text-blue-700 py-0 pr-6 border-none focus:ring-0 text-sm dark:text-blue-400"
                      >
                        {Object.values(Language).map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Content Area (Switches between Translation and Original) */}
                <div
                  className={`prose prose-slate prose-lg max-w-none prose-img:rounded-xl dark:prose-invert`}
                  dangerouslySetInnerHTML={{ __html: showTranslation && translatedContent ? translatedContent : proxiedArticleContent }}
                />

              </div>
            </div>
          </div>
        )}
      </div>
      {selectedFeed && (
        <div className={`fixed inset-y-0 right-0 z-30 w-80 bg-slate-50/80 backdrop-blur-xl border-l border-slate-200 shadow-lg transform transition-transform duration-300 ${isRightSidebarOpen ? 'translate-x-0' : 'translate-x-full'} lg:relative lg:translate-x-0 lg:shadow-none lg:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 ${!isRightSidebarOpen && 'lg:hidden'}`}>
          <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-600 dark:text-slate-300">筛选与 AI</h3>
              <button onClick={() => setIsRightSidebarOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded dark:hover:bg-slate-800">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">按日期筛选</h4>
              <CalendarWidget selectedDate={selectedDate} onDateSelect={handleDateSelect} />
            </div>
            <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-800 dark:border-slate-700">
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100 flex items-center justify-between dark:from-indigo-900/20 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-700 text-sm dark:text-slate-200">AI 每日摘要</h3>
                </div>
                {!selectedDate && <span className="text-[10px] text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100 dark:bg-orange-900/30">请选择日期</span>}
              </div>
              <div className="flex-1 p-4 overflow-y-auto">
                {!selectedDate ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <p className="text-slate-400 text-sm mb-2">请在上方日历中选择一个具体日期以生成摘要。</p>
                  </div>
                ) : baseArticles.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <p className="text-slate-400 text-sm">该日期下没有文章。</p>
                  </div>
                ) : dailySummary ? (
                  <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap animate-fade-in font-sans dark:text-slate-300">{dailySummary}</div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center">
                    <button onClick={handleRunAnalysis} disabled={isSummarizing || isAnalyzing} className="group relative inline-flex items-center justify-center gap-2 px-5 py-2.5 font-semibold text-white transition-all duration-200 bg-indigo-600 rounded-full hover:bg-indigo-700 disabled:bg-indigo-500 disabled:cursor-wait">
                      {isAnalyzing ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>分析中...</span>
                        </>
                      ) : (
                        `总结 ${baseArticles.length} 篇文章`
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
                <div className="font-semibold text-slate-800 dark:text-white">全部代理</div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">所有图片通过服务器代理加载。适合无法直接访问 Twitter 等平台的用户。</div>
              </button>
              <button
                onClick={() => handleImageProxyModeChange('twitter-only')}
                className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/20 transition-all text-left"
              >
                <div className="font-semibold text-slate-800 dark:text-white">只代理 Twitter 图片</div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">仅代理 Twitter 图片，其他图片直接加载。节省服务器流量。</div>
              </button>
              <button
                onClick={() => handleImageProxyModeChange('none')}
                className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/20 transition-all text-left"
              >
                <div className="font-semibold text-slate-800 dark:text-white">不代理图片</div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">所有图片直接加载。适合可以直接访问所有图片源的用户。</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;