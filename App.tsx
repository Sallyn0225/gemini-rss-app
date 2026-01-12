import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from "lucide-react";
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
import { cn, mergeAndDedupeArticles } from './lib/utils';
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
    readArticleIds, markAsRead,
    isAiConfigured
  } = useAppContext();

  const FEED_CACHE_TTL = 10 * 60 * 1000;
  const HISTORY_INITIAL_LOAD = 24;  // 首次加载 2 页（24 条）
  const HISTORY_PRELOAD_SIZE = 12;  // 预加载 1 页（12 条）
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [pendingArticleId, setPendingArticleId] = useState<string | null>(null);

  const articleListRef = useRef<HTMLDivElement>(null);

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
      ...a, aiCategory: articleClassifications[a.guid]
    }));
  }, [filteredArticles, currentPage, articleClassifications]);

  const handleFeedSelect = useCallback(async (meta: FeedMeta, options?: { skipHistory?: boolean; articleId?: string }) => {
    if (!options?.skipHistory && typeof window !== 'undefined') {
      window.history.pushState({ feedId: meta.id }, '', buildFeedPath(meta.id));
    }
    setSelectedFeedMeta(meta);
    setActiveArticle(null);
    setPendingArticleId(options?.articleId || null);
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
      setHistoryStatus(prev => ({
        ...prev,
        [meta.id]: { total: historyData.total, loaded: mergedItems.length }
      }));
    } catch (e) {
      setErrorMsg("加载失败");
    } finally {
      setLoadingFeedId(null);
    }
  }, [feedContentCache, setFeedContentCache, setSelectedFeed, setSelectedFeedMeta, setActiveArticle]);

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
      setHistoryStatus(prev => ({
        ...prev,
        [selectedFeedMeta.id]: { total: historyData.total, loaded: mergedItems.length }
      }));
      setCurrentPage(1);
    } catch (e) {
      setErrorMsg("刷新失败");
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedFeedMeta, isRefreshing, setFeedContentCache]);

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
    setActiveArticle(article);
    markAsRead(getArticleId(article));
    // Reset translation state when switching articles
    setShowTranslation(false);
    setTranslatedContent(null);
    if (selectedFeedMeta) window.history.pushState({}, '', buildArticlePath(selectedFeedMeta.id, getArticleId(article)));
  };

  const handleRunAnalysis = useCallback(async () => {
    if (!selectedFeedMeta || !selectedFeed || !selectedDate || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisSuccess(false);
    
    try {
      const cacheKey = `${selectedFeedMeta.id}-${selectedDate.toDateString()}`;
      
      const result = await analyzeFeedContent(
        selectedFeed.title,
        selectedDate,
        baseArticles,
        aiSettings
      );
      
      setDailySummary(result.summary);
      setSummaryCache(prev => ({ ...prev, [cacheKey]: result.summary }));
      
      // 更新文章分类
      const newClassifications = { ...articleClassifications };
      baseArticles.forEach((article, index) => {
        if (result.classifications[index]) {
          newClassifications[article.guid] = result.classifications[index];
        }
      });
      setArticleClassifications(newClassifications);
      setAnalysisSuccess(true);
      setIsRightSidebarOpen(true); // 分析完成后自动打开右侧栏查看结果
    } catch (e) {
      console.error("Analysis failed:", e);
      setErrorMsg("分析失败，请检查 AI 配置");
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedFeedMeta, selectedFeed, selectedDate, isAnalyzing, baseArticles, aiSettings, articleClassifications, setIsRightSidebarOpen]);

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
    } else {
      setDailySummary(null);
      setAnalysisSuccess(false);
    }
  }, [selectedFeedMeta, selectedDate, summaryCache]);

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
            handleRunAnalysis={handleRunAnalysis} isAnalyzing={isAnalyzing} analysisSuccess={analysisSuccess}
            isAiConfigured={isAiConfigured}
            paginatedArticlesWithCategory={paginatedArticlesWithCategory} readArticleIds={readArticleIds}
            handleArticleSelect={handleArticleSelect} onRefresh={handleRefresh} isRefreshing={isRefreshing}
            currentPage={currentPage} setCurrentPage={handlePageChange} totalPages={totalPages}
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
            proxiedArticleContent={activeArticle.content} readingViewAvatar={getMediaUrl(selectedFeed?.image)}
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
            <CalendarWidget selectedDate={selectedDate} onDateSelect={setSelectedDate} articleCountByDate={articleCountByDate} />
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
            ) : (
              <div className="bg-muted/30 rounded-xl border border-dashed p-8 flex flex-col items-center justify-center text-center gap-2">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-xs">📊</span>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                  {isAnalyzing ? "正在进行 AI 分析..." : "选择日期并点击\n「AI 分析」生成总结"}
                </p>
              </div>
            )}
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