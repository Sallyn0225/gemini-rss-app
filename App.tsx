import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from "lucide-react";
import {
  fetchRSS,
  fetchSystemFeeds,
  fetchFeedSummaries,
  fetchHistory
} from './services/rssService';
import { translateContent, classifyArticles, generateDailySummary } from './services/geminiService';
import {
  Feed,
  Article,
  Language,
  ArticleCategory,
  FeedMeta
} from './types';
import { LeftSidebar, CategoryNode } from './components/LeftSidebar';
import { ArticleList } from './components/ArticleList';
import { ArticleReader } from './components/ArticleReader';
import { Dashboard } from './components/Dashboard';
import { SettingsModal } from './components/SettingsModal';
import { CalendarWidget } from './components/CalendarWidget';
import { cn, mergeAndDedupeArticles } from './lib/utils';
import { Button } from "@/components/ui/button";
import { useAppContext } from './lib/AppContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from '@/hooks/use-toast';
import { get as getFromIdb, set as setToIdb } from 'idb-keyval';

const getArticleId = (article: Article): string => article.guid || article.link || `${article.title}-${article.pubDate}`;
const buildFeedPath = (feedId: string): string => `/feed/${encodeURIComponent(feedId)}`;
const buildArticlePath = (feedId: string, articleId: string): string => `${buildFeedPath(feedId)}/article/${encodeURIComponent(articleId)}`;

const LAST_VALID_FEED_KEY = 'last_valid_feed_id';
const FEED_AVATAR_CACHE_PREFIX = 'feed_avatar:';

const getLastValidFeedId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(LAST_VALID_FEED_KEY);
  } catch {
    return null;
  }
};

const setLastValidFeedId = (feedId: string): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_VALID_FEED_KEY, feedId);
  } catch {
    return;
  }
};

const loadFeedAvatarCache = async (feedIds: string[]): Promise<Record<string, string>> => {
  const entries = await Promise.all(
    feedIds.map(async (id) => {
      const cached = await getFromIdb(`${FEED_AVATAR_CACHE_PREFIX}${id}`);
      return [id, cached] as const;
    })
  );

  return entries.reduce<Record<string, string>>((acc, [id, cached]) => {
    if (typeof cached === 'string' && cached) {
      acc[id] = cached;
    }
    return acc;
  }, {});
};

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
    readArticleIds, markAsRead,
    isAiConfigured
  } = useAppContext();

  const { toast } = useToast();

  const HISTORY_INITIAL_LOAD = 24;  // 首次加载 2 页（24 条）
  const HISTORY_PRELOAD_SIZE = 12;  // 预加载 1 页（12 条）
  const ARTICLES_PER_PAGE = 12;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingFeedId, setLoadingFeedId] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<Record<string, { total: number; loaded: number }>>({});
  const [feedSummaryMap, setFeedSummaryMap] = useState<Record<string, number>>({});
  const [feedAvatarCache, setFeedAvatarCache] = useState<Record<string, string>>({});
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [openFolderPath, setOpenFolderPath] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dailySummary, setDailySummary] = useState<string | null>(null);
  const [summaryCache, setSummaryCache] = useState<Record<string, string>>({});
  const [classificationCache, setClassificationCache] = useState<Record<string, Record<string, string>>>({});
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisSuccess, setAnalysisSuccess] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);  // 分类进行中
  const [isSummarizing, setIsSummarizing] = useState(false);  // 总结进行中
  const [articleClassifications, setArticleClassifications] = useState<Record<string, string>>({});
  const [targetLang, setTargetLang] = useState<Language>(Language.CHINESE);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const articleListRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());

  const getArticleListViewport = useCallback(() => {
    return articleListRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLElement | null;
  }, []);

  const resetArticleListScroll = useCallback((feedId?: string | null) => {
    const viewport = getArticleListViewport();
    if (viewport) viewport.scrollTop = 0;
    if (feedId) scrollPositionsRef.current.set(feedId, 0);
  }, [getArticleListViewport]);

  const handleScrollPositionChange = useCallback((feedId: string, position: number) => {
    scrollPositionsRef.current.set(feedId, position);
  }, []);

  // Toast 回调函数，用于 FilterBar 等子组件
  const showToast = useCallback((message: string, variant?: 'default' | 'destructive') => {
    toast({
      description: message,
      variant: variant || 'default',
    });
  }, [toast]);

  const updateFeedAvatarCache = useCallback((feedId: string, image?: string) => {
    if (!image) return;
    setFeedAvatarCache(prev => ({ ...prev, [feedId]: image }));
    setToIdb(`${FEED_AVATAR_CACHE_PREFIX}${feedId}`, image).catch(err => {
      console.warn('Failed to save feed avatar to IDB:', err);
    });
  }, []);


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
      const [summaries, avatars] = await Promise.all([
        fetchFeedSummaries(),
        loadFeedAvatarCache(configs.map(feed => feed.id))
      ]);
      setFeedSummaryMap(
        summaries.reduce<Record<string, number>>((acc, summary) => {
          acc[summary.id] = summary.articleCount;
          return acc;
        }, {})
      );
      setFeedAvatarCache(avatars);
    } catch { setErrorMsg("初始化订阅源出错"); } finally { setLoading(false); }
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
      activeFilters.some(f => {
        const articleId = getArticleId(article);
        return (articleId && articleClassifications[articleId] === f) || (f === ArticleCategory.RETWEET && /^RT\s/i.test(article.title));
      })
    );
  }, [baseArticles, activeFilters, articleClassifications]);

  // 计算当前订阅源每天的文章数量（用于日历角标显示）
  const articleCountByDate = useMemo(() => {
    if (!selectedFeed) return null;
    
    const countMap: Record<string, number> = {};
    selectedFeed.items.forEach(article => {
      const dateKey = new Date(article.pubDate).toDateString();
      countMap[dateKey] = (countMap[dateKey] || 0) + 1;
    });
    return countMap;
  }, [selectedFeed]);

  const totalPages = Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE);
  const paginatedArticlesWithCategory = useMemo(() => {
    const start = (currentPage - 1) * ARTICLES_PER_PAGE;
    return filteredArticles.slice(start, start + ARTICLES_PER_PAGE).map(a => ({
      ...a, aiCategory: articleClassifications[getArticleId(a)]
    }));
  }, [filteredArticles, currentPage, articleClassifications]);

  const handleFeedSelect = useCallback(async (meta: FeedMeta, options?: { skipHistory?: boolean; articleId?: string }) => {
    if (!meta?.id || meta.id === 'none') {
      setErrorMsg('订阅源 ID 无效');
      return;
    }

    setLastValidFeedId(meta.id);

    if (!options?.skipHistory && typeof window !== 'undefined') {
      // 如果已经在同一个 feed，使用 replaceState 而不是 pushState，避免重复历史记录
      if (selectedFeedMeta?.id === meta.id) {
        window.history.replaceState({ feedId: meta.id }, '', buildFeedPath(meta.id));
      } else {
        window.history.pushState({ feedId: meta.id }, '', buildFeedPath(meta.id));
      }
    }
    setSelectedFeedMeta(meta);
    setActiveArticle(null);
    setSelectedDate(null);
    setActiveFilters([]);
    setCurrentPage(1);  // 重置页码
    
    const cached = feedContentCache[meta.id];
    if (cached) setSelectedFeed(cached);
    
    setLoadingFeedId(meta.id);
    try {
      // 并行：拉取 RSS + 加载历史
      const [fetchedFeed, historyData] = await Promise.all([
        fetchRSS(meta.id),
        fetchHistory(meta.id, HISTORY_INITIAL_LOAD, 0).catch(() => ({ items: [], total: 0 }))
      ]);
      
      // 合并去重
      const mergedItems = mergeAndDedupeArticles(fetchedFeed.items, historyData.items);
      const finalFeed: Feed = { ...fetchedFeed, items: mergedItems };
      
      // 更新缓存和状态
      setFeedContentCache(prev => ({ ...prev, [meta.id]: finalFeed }));
      setSelectedFeed(finalFeed);
      updateFeedAvatarCache(meta.id, finalFeed.image);
      setFeedSummaryMap(prev => ({
        ...prev,
        [meta.id]: Math.max(prev[meta.id] ?? 0, historyData.total, finalFeed.items.length)
      }));
      setHistoryStatus(prev => ({
        ...prev,
        [meta.id]: { total: historyData.total, loaded: mergedItems.length }
      }));
    } catch {
      setErrorMsg("加载失败");
    } finally {
      setLoadingFeedId(null);
    }
  }, [feedContentCache, setFeedContentCache, setSelectedFeed, setSelectedFeedMeta, setActiveArticle, updateFeedAvatarCache, selectedFeedMeta?.id]);

  const handleRefresh = useCallback(async () => {
    if (!selectedFeedMeta || isRefreshing) return;
    setIsRefreshing(true);
    try {
      // 1. 拉取最新 RSS（自动存入数据库）
      const fetchedFeed = await fetchRSS(selectedFeedMeta.id);
      
      // 2. 重新加载历史
      const historyData = await fetchHistory(selectedFeedMeta.id, HISTORY_INITIAL_LOAD, 0);
      
      // 3. 合并去重
      const mergedItems = mergeAndDedupeArticles(fetchedFeed.items, historyData.items);
      const finalFeed: Feed = { ...fetchedFeed, items: mergedItems };
      
      // 4. 更新状态，回到第一页
      setFeedContentCache(prev => ({ ...prev, [selectedFeedMeta.id]: finalFeed }));
      setSelectedFeed(finalFeed);
      updateFeedAvatarCache(selectedFeedMeta.id, finalFeed.image);
      setFeedSummaryMap(prev => ({
        ...prev,
        [selectedFeedMeta.id]: Math.max(prev[selectedFeedMeta.id] ?? 0, historyData.total, finalFeed.items.length)
      }));
      setHistoryStatus(prev => ({
        ...prev,
        [selectedFeedMeta.id]: { total: historyData.total, loaded: mergedItems.length }
      }));
      setCurrentPage(1);
    } catch {
      setErrorMsg("刷新失败");
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedFeedMeta, isRefreshing, setFeedContentCache, updateFeedAvatarCache, setSelectedFeed]);

  // 分页切换时预加载下一页
  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
    
    if (!selectedFeedMeta || !selectedFeed) return;
    
    const feedId = selectedFeedMeta.id;
    const status = historyStatus[feedId];
    if (!status) return;
    
    // 计算是否需要预加载：下一页的起始位置超过了已加载的数量
    const nextPageStart = newPage * ARTICLES_PER_PAGE;
    const needsPreload = nextPageStart + ARTICLES_PER_PAGE > status.loaded 
                         && status.loaded < status.total;
    
    if (needsPreload) {
      // 异步预加载，不阻塞页面切换
      fetchHistory(feedId, HISTORY_PRELOAD_SIZE, status.loaded)
        .then(moreData => {
          if (moreData.items.length > 0) {
            // 使用 feedContentCache 获取最新状态
            setFeedContentCache(prev => {
              const currentFeed = prev[feedId];
              if (!currentFeed) return prev;
              
              const mergedItems = mergeAndDedupeArticles(currentFeed.items, moreData.items);
              const updatedFeed = { ...currentFeed, items: mergedItems };
              
              // 同步更新 selectedFeed
              setSelectedFeed(updatedFeed);
              
              // 更新历史状态
              setHistoryStatus(prevStatus => {
                const latestStatus = prevStatus[feedId];
                return {
                  ...prevStatus,
                  [feedId]: { 
                    total: latestStatus?.total ?? status.total, 
                    loaded: mergedItems.length
                  }
                };
              });
              
              return { ...prev, [feedId]: updatedFeed };
            });
          }
        })
        .catch(e => {
          console.warn('预加载历史失败:', e);
        });
    }
  }, [selectedFeedMeta, selectedFeed, historyStatus, setFeedContentCache, setSelectedFeed]);

  const handleArticleSelect = (article: Article) => {
    const articleId = getArticleId(article);
    const currentArticleId = activeArticle ? getArticleId(activeArticle) : null;

    if (selectedFeedMeta) {
      const viewport = getArticleListViewport();
      if (viewport) {
        scrollPositionsRef.current.set(selectedFeedMeta.id, viewport.scrollTop);
      }
    }
    
    setActiveArticle(article);
    markAsRead(articleId);
    // Reset translation state when switching articles
    setShowTranslation(false);
    setTranslatedContent(null);
    
    if (selectedFeedMeta) {
      // 如果已经在看同一篇文章，使用 replaceState 而不是 pushState，避免重复历史记录
      if (currentArticleId === articleId) {
        window.history.replaceState({}, '', buildArticlePath(selectedFeedMeta.id, articleId));
      } else {
        window.history.pushState({}, '', buildArticlePath(selectedFeedMeta.id, articleId));
      }
    }
  };

  const handleRunAnalysis = useCallback(async () => {
    if (!selectedFeedMeta || !selectedFeed || !selectedDate) return;

    const cacheKey = `${selectedFeedMeta.id}-${selectedDate.toDateString()}`;

    // 如果已有缓存，直接复用，避免重复调用
    if (summaryCache[cacheKey] && classificationCache[cacheKey]) {
      setDailySummary(summaryCache[cacheKey]);
      setArticleClassifications(classificationCache[cacheKey]);
      setAnalysisSuccess(true);
      setIsClassifying(false);
      setIsSummarizing(false);
      setIsAnalyzing(false);
      setIsRightSidebarOpen(true);
      toast({ description: "已加载缓存的 AI 分析结果" });
      return;
    }

    if (isAnalyzing) return;

    setIsAnalyzing(true);
    setAnalysisSuccess(false);
    setIsClassifying(true);
    setIsSummarizing(false);
    setIsRightSidebarOpen(true); // 立即打开右侧栏显示进度
    
    try {
      // 第一步：快速分类（约 3-5 秒）
      const classifications = await classifyArticles(baseArticles, aiSettings);
      
      // 分类完成，立即更新 UI
      const newClassifications: Record<string, string> = {};
      baseArticles.forEach((article, index) => {
        const key = getArticleId(article);
        if (classifications[index] && key) {
          newClassifications[key] = classifications[index];
        }
      });
      setArticleClassifications(newClassifications);
      setClassificationCache(prev => ({ ...prev, [cacheKey]: newClassifications }));
      setIsClassifying(false);
      
      toast({ description: "文章分类完成，正在生成总结..." });
      
      // 第二步：生成总结（约 10-20 秒）
      setIsSummarizing(true);
      const summary = await generateDailySummary(
        selectedFeed.title,
        selectedDate,
        baseArticles,
        classifications,
        aiSettings
      );
      
      setDailySummary(summary);
      setSummaryCache(prev => ({ ...prev, [cacheKey]: summary }));
      setIsSummarizing(false);
      setAnalysisSuccess(true);
      
      toast({ description: "AI 分析完成！" });
      
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "分析失败，请检查 AI 配置";
      console.error("Analysis failed:", e);
      setErrorMsg(message);
      toast({
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
      setIsClassifying(false);
      setIsSummarizing(false);
    }
  }, [selectedFeedMeta, selectedFeed, selectedDate, isAnalyzing, baseArticles, aiSettings, setIsRightSidebarOpen, toast, summaryCache, classificationCache]);

  useEffect(() => {
    if (selectedFeedMeta && selectedDate) {
      const cacheKey = `${selectedFeedMeta.id}-${selectedDate.toDateString()}`;
      if (summaryCache[cacheKey]) {
        setDailySummary(summaryCache[cacheKey]);
        setAnalysisSuccess(true);
      } else {
        setDailySummary(null);
        setAnalysisSuccess(false);
      }
      if (classificationCache[cacheKey]) {
        setArticleClassifications(classificationCache[cacheKey]);
      } else {
        setArticleClassifications({});
      }
    } else {
      setDailySummary(null);
      setAnalysisSuccess(false);
      setArticleClassifications({});
    }
  }, [selectedFeedMeta, selectedDate, summaryCache, classificationCache]);

  const syncStateWithRoute = useCallback((route: { feedId: string | null; articleId: string | null }, _skipHistory: boolean) => {
    if (!route.feedId) {
      setSelectedFeed(null); setSelectedFeedMeta(null); setActiveArticle(null);
      return;
    }
    const meta = feedConfigs.find(f => f.id === route.feedId);
    if (!meta) {
      const fallbackId = getLastValidFeedId();
      const fallbackMeta = fallbackId ? feedConfigs.find(f => f.id === fallbackId) : null;
      if (fallbackMeta) {
        if (typeof window !== 'undefined') {
          window.history.replaceState({ feedId: fallbackMeta.id }, '', buildFeedPath(fallbackMeta.id));
        }
        handleFeedSelect(fallbackMeta, { skipHistory: true });
        return;
      }
      setSelectedFeed(null); setSelectedFeedMeta(null); setActiveArticle(null);
      if (typeof window !== 'undefined') window.history.replaceState({}, '', '/');
      setErrorMsg('订阅源不存在或已删除');
      return;
    }
    if (selectedFeedMeta?.id !== route.feedId) {
      handleFeedSelect(meta, { skipHistory: true, articleId: route.articleId });
    } else if (route.articleId && selectedFeed) {
      const art = selectedFeed.items.find(i => getArticleId(i) === route.articleId);
      if (art) setActiveArticle(art);
    } else if (!route.articleId && activeArticle) {
      // URL 中没有 articleId 但当前有 activeArticle，需要清除（处理从文章页后退到列表页的情况）
      setActiveArticle(null);
    }
  }, [feedConfigs, handleFeedSelect, selectedFeed, selectedFeedMeta, activeArticle, setActiveArticle, setSelectedFeed, setSelectedFeedMeta]);

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
    } catch { alert("翻译失败"); } finally { setIsTranslating(false); }
  };

  return (
    <div className="flex h-screen bg-background font-sans text-foreground overflow-hidden relative transition-colors duration-300">
      <LeftSidebar 
        isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
        handleBackToDashboard={() => { setSelectedFeed(null); setSelectedFeedMeta(null); window.history.pushState({}, '', '/'); }}
        errorMsg={errorMsg} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode}
        openFolderPath={openFolderPath} setOpenFolderPath={setOpenFolderPath}
        groupedFeeds={groupedFeeds} feedContentCache={feedContentCache}
        feedSummaryMap={feedSummaryMap} feedAvatarCache={feedAvatarCache}
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

        {selectedFeed && !activeArticle && selectedFeedMeta && (
          <ArticleList 
            selectedFeed={selectedFeed} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
            selectedDate={selectedDate} isRightSidebarOpen={isRightSidebarOpen} setIsRightSidebarOpen={setIsRightSidebarOpen}
            activeFilters={activeFilters} handleFilterToggle={(f) => {
              if (selectedFeedMeta) resetArticleListScroll(selectedFeedMeta.id);
              handlePageChange(1);
              if (f === '__reset__') setActiveFilters([]);
              else setActiveFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
            }}
            handleRunAnalysis={handleRunAnalysis} isAnalyzing={isAnalyzing} analysisSuccess={analysisSuccess}
            isAiConfigured={isAiConfigured}
            paginatedArticlesWithCategory={paginatedArticlesWithCategory} readArticleIds={readArticleIds}
            handleArticleSelect={handleArticleSelect} onRefresh={handleRefresh} isRefreshing={isRefreshing}
            currentPage={currentPage} setCurrentPage={handlePageChange} totalPages={totalPages}
            filteredArticlesCount={filteredArticles.length}
            articleListRef={articleListRef}
            feedId={selectedFeedMeta.id}
            initialScrollPosition={scrollPositionsRef.current.get(selectedFeedMeta.id) ?? 0}
            onScrollPositionChange={handleScrollPositionChange}
            onShowToast={showToast}
            loadedCount={historyStatus[selectedFeedMeta.id]?.loaded}
            totalCount={historyStatus[selectedFeedMeta.id]?.total}
          />
        )}

        {activeArticle && (
          <ArticleReader 
            article={activeArticle} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
            isRightSidebarOpen={isRightSidebarOpen} setIsRightSidebarOpen={setIsRightSidebarOpen}
            handleBackToArticles={() => {
              setActiveArticle(null);
              if (selectedFeedMeta) {
                window.history.replaceState({ feedId: selectedFeedMeta.id }, '', buildFeedPath(selectedFeedMeta.id));
              } else {
                window.history.replaceState({}, '', '/');
              }
            }} targetLang={targetLang}
            handleLanguageSwitch={setTargetLang} showTranslation={showTranslation}
            handleTranslateToggle={handleTranslateToggle} isTranslating={isTranslating}
            translatedContent={translatedContent} getTranslatorName={() => "AI"}
            proxiedArticleContent={activeArticle.content} readingViewAvatar={selectedFeed?.image || ''}
          />
        )}

      </main>

      {/* 右侧栏 - 遮罩层 */}
      <AnimatePresence>
        {isRightSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setIsRightSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 右侧栏 - 筛选与分析 */}
      <aside className={cn(
        "fixed inset-y-0 right-0 z-40 w-80 flex flex-col bg-card border-l transition-all duration-300 ease-in-out lg:relative lg:translate-x-0 shrink-0",
        isRightSidebarOpen ? "translate-x-0" : "translate-x-full",
        !isRightSidebarOpen && "lg:w-0 lg:border-none lg:overflow-hidden"
      )}>
        <div className="p-4 border-b flex items-center justify-between lg:hidden shrink-0">
          <h3 className="text-sm font-black uppercase tracking-widest">筛选与分析</h3>
          <Button variant="ghost" size="icon" onClick={() => setIsRightSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="p-4 flex flex-col gap-6 h-full overflow-y-auto">
          <div className="flex flex-col gap-1">
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">时间筛选</h3>
            <CalendarWidget
              selectedDate={selectedDate}
              onDateSelect={(date) => {
                setSelectedDate(date);
                handlePageChange(1);
                if (selectedFeedMeta) resetArticleListScroll(selectedFeedMeta.id);
              }}
              articleCountByDate={articleCountByDate}
            />

          </div>
          
          <div className="flex flex-col gap-1">
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">数据概览</h3>
            {dailySummary ? (
              <div className="bg-muted/30 rounded-xl border p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">AI 每日总结</span>
                </div>
                <ScrollArea className="max-h-[400px]">
                  <div className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap font-medium">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {dailySummary}
                    </ReactMarkdown>
                  </div>
                </ScrollArea>
              </div>
            ) : isAnalyzing ? (
              <div className="bg-muted/30 rounded-xl border p-4 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-primary">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {isClassifying ? "正在分类文章..." : isSummarizing ? "正在生成总结..." : "AI 分析中..."}
                  </span>
                </div>
                <div className="space-y-3">
                  {/* 步骤指示器 */}
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                      isClassifying ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {!isClassifying && !isSummarizing ? "1" : isClassifying ? "⏳" : "✓"}
                    </div>
                    <span className={cn("text-xs", isClassifying ? "text-primary font-bold" : "text-muted-foreground")}>
                      分类文章
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                      isSummarizing ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {isSummarizing ? "⏳" : "2"}
                    </div>
                    <span className={cn("text-xs", isSummarizing ? "text-primary font-bold" : "text-muted-foreground")}>
                      生成总结
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  通常需要 10-30 秒，请耐心等待...
                </p>
              </div>
            ) : (
              <div className="bg-muted/30 rounded-xl border border-dashed p-8 flex flex-col items-center justify-center text-center gap-2">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-xs">📊</span>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                  选择日期并点击{"\n"}「AI 分析」生成总结
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <SettingsModal
        isOpen={showSettings} onClose={() => setShowSettings(false)}
        settings={aiSettings} onSave={setAiSettings}
        onFeedsReordered={initFeeds}
      />
    </div>
  );
};

export default App;
