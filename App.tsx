import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { 
  fetchRSS, 
  fetchSystemFeeds, 
  fetchHistory, 
  setCurrentFeedCanProxyImages, 
  getMediaUrl,
  proxyImageUrl
} from './services/rssService';
import { translateContent, analyzeFeedContent } from './services/geminiService';
import { 
  Feed, 
  Article, 
  Language, 
  ArticleCategory, 
  AISettings, 
  FeedMeta 
} from './types';
import { LeftSidebar, CategoryNode } from './components/LeftSidebar';
import { ArticleList } from './components/ArticleList';
import { ArticleReader } from './components/ArticleReader';
import { Dashboard } from './components/Dashboard';
import { SettingsModal } from './components/SettingsModal';
import { CalendarWidget } from './components/CalendarWidget';
import { cn } from './lib/utils';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppContext } from './lib/AppContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ScrollArea } from "@/components/ui/scroll-area";

const getArticleId = (article: Article): string => article.guid || article.link || `${article.title}-${article.pubDate}`;
const buildFeedPath = (feedId: string): string => `/feed/${encodeURIComponent(feedId)}`;
const buildArticlePath = (feedId: string, articleId: string): string => `${buildFeedPath(feedId)}/article/${encodeURIComponent(articleId)}`;

const parseRoute = () => {
  if (typeof window === 'undefined') return { feedId: null, articleId: null };
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'feed' || !parts[1]) return { feedId: null, articleId: null };
  const feedId = decodeURIComponent(parts[1]);
  if (parts[2] === 'article' && parts[3]) return { feedId, articleId: decodeURIComponent(parts[3]) };
  return { feedId, articleId: null };
};

const App: React.FC = () => {
  const {
    darkMode, setDarkMode,
    isSidebarOpen, setIsSidebarOpen,
    isRightSidebarOpen, setIsRightSidebarOpen,
    sidebarMode, setSidebarMode,
    feedConfigs, setFeedConfigs,
    feedContentCache, setFeedContentCache,
    selectedFeedMeta, setSelectedFeedMeta,
    selectedFeed, setSelectedFeed,
    activeArticle, setActiveArticle,
    aiSettings, setAiSettings,
    imageProxyMode, setImageProxyMode,
    readArticleIds, markAsRead
  } = useAppContext();

  const FEED_CACHE_TTL = 10 * 60 * 1000;
  const HISTORY_PAGE_SIZE = 200;
  const ARTICLES_PER_PAGE = 12;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingFeedId, setLoadingFeedId] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<Record<string, { total: number; loaded: number }>>({});
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpContent, setHelpContent] = useState('');
  const [openFolderPath, setOpenFolderPath] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dailySummary, setDailySummary] = useState<string | null>(null);
  const [summaryCache, setSummaryCache] = useState<Record<string, string>>({});
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisSuccess, setAnalysisSuccess] = useState(false);
  const [articleClassifications, setArticleClassifications] = useState<Record<string, string>>({});
  const [targetLang, setTargetLang] = useState<Language>(Language.CHINESE);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [lastTranslatedLang, setLastTranslatedLang] = useState<Language | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [pendingArticleId, setPendingArticleId] = useState<string | null>(null);

  const articleListRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<number>(0);

  const isAiConfigured = useMemo(() => {
    const { providers, tasks } = aiSettings;
    return providers.length > 0 && !!tasks.general?.providerId;
  }, [aiSettings]);

  const groupedFeeds = useMemo(() => {
    const root: Map<string, CategoryNode> = new Map();
    feedConfigs.forEach(meta => {
      const parts = (meta.category || '').split('/').filter(Boolean);
      if (parts.length === 0) {
        if (!root.has('__uncategorized__')) root.set('__uncategorized__', { name: '', path: '', feeds: [], children: new Map(), depth: 0 });
        root.get('__uncategorized__')!.feeds.push(meta);
        return;
      }
      let currentMap = root;
      let currentPath = '';
      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!currentMap.has(part)) currentMap.set(part, { name: part, path: currentPath, feeds: [], children: new Map(), depth: index });
        const node = currentMap.get(part)!;
        if (index === parts.length - 1) node.feeds.push(meta);
        currentMap = node.children;
      });
    });
    return root;
  }, [feedConfigs]);

  const initFeeds = useCallback(async () => {
    setLoading(true);
    try {
      const configs = await fetchSystemFeeds();
      setFeedConfigs(configs);
    } catch (e) { setErrorMsg("初始化订阅源出错"); } finally { setLoading(false); }
  }, [setFeedConfigs]);

  useEffect(() => { initFeeds(); }, [initFeeds]);

  const baseArticles = useMemo(() => {
    if (!selectedFeed) return [];
    if (!selectedDate) return selectedFeed.items;
    return selectedFeed.items.filter(item => {
      const d = new Date(item.pubDate);
      return d.toDateString() === selectedDate.toDateString();
    });
  }, [selectedFeed, selectedDate]);

  const filteredArticles = useMemo(() => {
    if (activeFilters.length === 0) return baseArticles;
    return baseArticles.filter(article => 
      activeFilters.some(f => articleClassifications[article.guid] === f || (f === ArticleCategory.RETWEET && /^RT\s/i.test(article.title)))
    );
  }, [baseArticles, activeFilters, articleClassifications]);

  const totalPages = Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE);
  const paginatedArticlesWithCategory = useMemo(() => {
    const start = (currentPage - 1) * ARTICLES_PER_PAGE;
    return filteredArticles.slice(start, start + ARTICLES_PER_PAGE).map(a => ({
      ...a, aiCategory: articleClassifications[a.guid]
    }));
  }, [filteredArticles, currentPage, articleClassifications]);

  const handleFeedSelect = useCallback(async (meta: FeedMeta, options?: { skipHistory?: boolean; articleId?: string }) => {
    if (!options?.skipHistory && typeof window !== 'undefined') window.history.pushState({ feedId: meta.id }, '', buildFeedPath(meta.id));
    setSelectedFeedMeta(meta);
    setActiveArticle(null);
    setPendingArticleId(options?.articleId || null);
    setSelectedDate(null);
    setActiveFilters([]);
    const cached = feedContentCache[meta.id];
    if (cached) setSelectedFeed(cached);
    setLoadingFeedId(meta.id);
    try {
      const [fetchedFeed, historyData] = await Promise.all([
        fetchRSS(meta.id),
        fetchHistory(meta.id, HISTORY_PAGE_SIZE, 0).catch(() => ({ items: [], total: 0 }))
      ]);
      const finalFeed: Feed = { ...fetchedFeed, items: fetchedFeed.items }; // Simplified merge for now
      setFeedContentCache(prev => ({ ...prev, [meta.id]: finalFeed }));
      setSelectedFeed(finalFeed);
    } catch (e) { setErrorMsg("加载失败"); } finally { setLoadingFeedId(null); }
  }, [feedContentCache, setFeedContentCache, setSelectedFeed, setSelectedFeedMeta, setActiveArticle]);

  const handleRefresh = useCallback(async () => {
    if (!selectedFeedMeta || isRefreshing) return;
    setIsRefreshing(true);
    setPullDistance(0);
    try {
      const fetchedFeed = await fetchRSS(selectedFeedMeta.id);
      setFeedContentCache(prev => ({ ...prev, [selectedFeedMeta.id]: fetchedFeed }));
      setSelectedFeed(fetchedFeed);
      setCurrentPage(1);
    } catch (e) {
      setErrorMsg("刷新失败");
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedFeedMeta, isRefreshing, setFeedContentCache]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (articleListRef.current?.scrollTop === 0) {
      touchStartRef.current = e.touches[0].clientY;
    } else {
      touchStartRef.current = 0;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartRef.current === 0 || isRefreshing) return;
    const touchY = e.touches[0].clientY;
    const distance = touchY - touchStartRef.current;
    if (distance > 0 && articleListRef.current?.scrollTop === 0) {
      // Apply resistance
      const pull = Math.min(distance * 0.4, 100);
      setPullDistance(pull);
      if (pull > 5) {
        if (e.cancelable) e.preventDefault();
      }
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance >= 60) {
      handleRefresh();
    } else {
      setPullDistance(0);
    }
    touchStartRef.current = 0;
  };

  const handleArticleSelect = (article: Article) => {
    setActiveArticle(article);
    markAsRead(getArticleId(article));
    if (selectedFeedMeta) window.history.pushState({}, '', buildArticlePath(selectedFeedMeta.id, getArticleId(article)));
  };

  const syncStateWithRoute = useCallback((route: any, skipHistory: boolean) => {
    if (!route.feedId) {
      setSelectedFeed(null); setSelectedFeedMeta(null); setActiveArticle(null);
      return;
    }
    const meta = feedConfigs.find(f => f.id === route.feedId);
    if (meta && selectedFeedMeta?.id !== route.feedId) {
      handleFeedSelect(meta, { skipHistory: true, articleId: route.articleId });
    } else if (route.articleId && selectedFeed) {
      const art = selectedFeed.items.find(i => getArticleId(i) === route.articleId);
      if (art) setActiveArticle(art);
    }
  }, [feedConfigs, handleFeedSelect, selectedFeed, selectedFeedMeta]);

  useEffect(() => {
    const handlePopState = () => syncStateWithRoute(parseRoute(), true);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [syncStateWithRoute]);

  useEffect(() => { if (feedConfigs.length > 0) syncStateWithRoute(parseRoute(), true); }, [feedConfigs, syncStateWithRoute]);

  const handleTranslateToggle = async () => {
    if (!activeArticle) return;
    if (showTranslation) { setShowTranslation(false); return; }
    setIsTranslating(true);
    try {
      const res = await translateContent(activeArticle.content || activeArticle.description, targetLang, aiSettings);
      setTranslatedContent(res);
      setShowTranslation(true);
    } catch (e) { alert("翻译失败"); } finally { setIsTranslating(false); }
  };

  return (
    <div className="flex h-screen bg-background font-sans text-foreground overflow-hidden relative transition-colors duration-300">
      <LeftSidebar 
        isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
        handleBackToDashboard={() => { setSelectedFeed(null); setSelectedFeedMeta(null); window.history.pushState({}, '', '/'); }}
        errorMsg={errorMsg} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode}
        openFolderPath={openFolderPath} setOpenFolderPath={setOpenFolderPath}
        groupedFeeds={groupedFeeds} feedContentCache={feedContentCache}
        selectedFeedMeta={selectedFeedMeta} loadingFeedId={loadingFeedId}
        handleFeedSelect={handleFeedSelect} collapsedCategories={collapsedCategories}
        toggleCategoryCollapse={(p) => setCollapsedCategories(prev => {
          const next = new Set(prev);
          if (next.has(p)) next.delete(p); else next.add(p);
          return next;
        })}
        loading={loading} setShowSettings={setShowSettings}
        darkMode={darkMode} setDarkMode={setDarkMode}
      />

      <main className="flex-1 flex flex-col h-full bg-background relative overflow-hidden min-w-0">
        {!selectedFeed && (
          <Dashboard 
            feeds={Object.values(feedContentCache)} darkMode={darkMode}
            isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
            onBackToDashboard={() => {}}
          />
        )}

        {selectedFeed && !activeArticle && (
          <ArticleList 
            selectedFeed={selectedFeed} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
            selectedDate={selectedDate} isRightSidebarOpen={isRightSidebarOpen} setIsRightSidebarOpen={setIsRightSidebarOpen}
            activeFilters={activeFilters} handleFilterToggle={(f) => {
              if (f === '__reset__') setActiveFilters([]);
              else setActiveFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
            }}
            handleRunAnalysis={() => {}} isAnalyzing={isAnalyzing} analysisSuccess={analysisSuccess}
            paginatedArticlesWithCategory={paginatedArticlesWithCategory} readArticleIds={readArticleIds}
            handleArticleSelect={handleArticleSelect} pullDistance={pullDistance} isRefreshing={isRefreshing}
            handleTouchStart={handleTouchStart} handleTouchMove={handleTouchMove} handleTouchEnd={handleTouchEnd}
            currentPage={currentPage} setCurrentPage={setCurrentPage} totalPages={totalPages}
            filteredArticlesCount={filteredArticles.length} isLoadingMoreHistory={false} canLoadMoreHistory={false}
            showScrollToTop={showScrollToTop} handleScrollToTop={() => {}}
            articleListRef={articleListRef} visiblePageTokens={[]}
          />
        )}

        {activeArticle && (
          <ArticleReader 
            article={activeArticle} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
            isRightSidebarOpen={isRightSidebarOpen} setIsRightSidebarOpen={setIsRightSidebarOpen}
            handleBackToArticles={() => setActiveArticle(null)} targetLang={targetLang}
            handleLanguageSwitch={setTargetLang} showTranslation={showTranslation}
            handleTranslateToggle={handleTranslateToggle} isTranslating={isTranslating}
            translatedContent={translatedContent} getTranslatorName={() => "AI"}
            proxiedArticleContent={activeArticle.content} readingViewAvatar=""
          />
        )}
      </main>

      {/* 右侧栏 - 筛选与分析 */}
      <aside className={cn(
        "fixed inset-y-0 right-0 z-40 w-80 flex flex-col bg-card border-l transition-all duration-300 ease-in-out lg:relative lg:translate-x-0 shrink-0",
        isRightSidebarOpen ? "translate-x-0" : "translate-x-full",
        !isRightSidebarOpen && "lg:w-0 lg:border-none lg:overflow-hidden"
      )}>
        <div className="p-4 flex flex-col gap-6 h-full overflow-y-auto">
          <div className="flex flex-col gap-1">
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">时间筛选</h3>
            <CalendarWidget selectedDate={selectedDate} onDateSelect={setSelectedDate} />
          </div>
          
          <div className="flex flex-col gap-1">
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">数据概览</h3>
            <div className="bg-muted/30 rounded-xl border border-dashed p-8 flex flex-col items-center justify-center text-center gap-2">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <span className="text-xs">📊</span>
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">更多分析功能<br/>即将上线</p>
            </div>
          </div>
        </div>
      </aside>

      <SettingsModal
        isOpen={showSettings} onClose={() => setShowSettings(false)}
        settings={aiSettings} onSave={setAiSettings}
        imageProxyMode={imageProxyMode} onImageProxyModeChange={setImageProxyMode}
      />
    </div>
  );
};

export default App;