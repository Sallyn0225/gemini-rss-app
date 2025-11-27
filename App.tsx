import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchRSS, proxyImageUrl, fetchSystemFeeds } from './services/rssService';
import { translateContent, analyzeFeedContent } from './services/geminiService';
import { Feed, Article, Language, ArticleCategory, AISettings } from './types';
import { StatsChart } from './components/StatsChart';
import { ArticleCard } from './components/ArticleCard';
import { CalendarWidget } from './components/CalendarWidget';
import { SettingsModal } from './components/SettingsModal';

type SidebarViewMode = 'list' | 'grid';

// --- Extracted FeedItem Component ---
interface FeedItemProps {
  feed: Feed;
  mode: SidebarViewMode;
  isSelected: boolean;
  onSelect: (feed: Feed) => void;
}

const FeedItem: React.FC<FeedItemProps> = ({ feed, mode, isSelected, onSelect }) => {
  const fallbackAvatar = useMemo(() => proxyImageUrl(`https://ui-avatars.com/api/?name=${encodeURIComponent(feed.title)}&background=3b82f6&color=fff&size=128`), [feed.title]);
  
  if (mode === 'grid') {
    return (
      <div className="relative group w-full">
        <button
          onClick={() => onSelect(feed)}
          className={`relative aspect-square rounded-xl overflow-hidden border transition-all duration-300 w-full block ${isSelected ? 'ring-2 ring-blue-500 border-transparent shadow-md' : 'border-slate-200 hover:shadow-md hover:border-slate-300 dark:border-slate-700'}`}
          title={feed.title}
        >
          <img src={feed.image || fallbackAvatar} alt={feed.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" onError={(e) => { (e.target as HTMLImageElement).src = fallbackAvatar; }} />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent flex flex-col justify-end p-3">
            <p className="text-white text-xs font-bold line-clamp-2 leading-tight shadow-black drop-shadow-md text-left">{feed.title}</p>
          </div>
          {isSelected && <div className="absolute top-2 right-2 w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-sm"></div>}
        </button>
      </div>
    );
  }

  return (
    <div className={`relative group w-full ${feed.isSub ? 'pl-6' : ''}`}>
      {feed.isSub && <div className="absolute left-3 top-0 bottom-1/2 w-3 border-l-2 border-b-2 border-slate-200 dark:border-slate-700 rounded-bl-lg -z-10"></div>}
      <button
        onClick={() => onSelect(feed)}
        className={`flex items-center gap-3 w-full p-2.5 rounded-xl transition-all duration-200 text-left pr-8 ${isSelected ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-800' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
      >
        <img src={feed.image || fallbackAvatar} alt="" className="w-9 h-9 rounded-lg object-cover bg-slate-200 shrink-0 border border-slate-100 dark:border-slate-700" onError={(e) => { (e.target as HTMLImageElement).src = fallbackAvatar; }} />
        <div className="flex-1 overflow-hidden">
          <p className={`font-semibold text-sm truncate ${isSelected ? 'text-blue-800 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>{feed.title}</p>
          <p className="text-xs text-slate-400 truncate">{feed.items.length} updates</p>
        </div>
      </button>
    </div>
  );
};

// --- Filter Bar Component ---
interface FilterBarProps {
  activeFilters: string[]; onToggleFilter: (filter: string) => void; onReset: () => void;
  onAnalyze: () => void; isAnalyzing: boolean; analysisSuccess: boolean;
}
const FilterBar: React.FC<FilterBarProps> = ({ activeFilters, onToggleFilter, onReset, onAnalyze, isAnalyzing, analysisSuccess }) => {
  const filters = [ ArticleCategory.OFFICIAL, ArticleCategory.MEDIA, ArticleCategory.EVENT, ArticleCategory.COMMUNITY, ArticleCategory.RETWEET, ];
  return (
    <div className="flex items-center gap-2 py-3 px-4 md:px-8 border-b border-slate-200 overflow-x-auto custom-scrollbar bg-white sticky top-[81px] z-10 shrink-0 dark:bg-slate-900 dark:border-slate-800">
      <button onClick={onAnalyze} disabled={isAnalyzing} className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border shadow-sm ${isAnalyzing ? 'bg-yellow-50 text-yellow-700 border-yellow-200 cursor-wait dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' : analysisSuccess ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-indigo-600 text-white border-transparent hover:bg-indigo-700'}`}>
        {isAnalyzing ? (
          <>
            <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-yellow-600 dark:text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Analyzing...</span>
          </>
        ) : analysisSuccess ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
            </svg>
            <span>Done</span>
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM9 15a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v1.5a.75.75 0 01-1.5 0v-1.5h-1.5a.75.75 0 010-1.5h1.5v-1.5A.75.75 0 019 15z" clipRule="evenodd" />
            </svg>
            <span>AI Analyze</span>
          </>
        )}
      </button>
      <div className="w-px h-6 bg-slate-200 mx-1 shrink-0 dark:bg-slate-700"></div>
      <button onClick={onReset} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${activeFilters.length === 0 ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700'}`}>全部</button>
      {filters.map(filter => (<button key={filter} onClick={() => onToggleFilter(filter)} disabled={isAnalyzing && !activeFilters.includes(filter)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border whitespace-nowrap ${activeFilters.includes(filter) ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-200 dark:bg-slate-800 dark:border-slate-700'} ${isAnalyzing ? 'opacity-50' : ''}`}>{filter}</button>))}
    </div>
  );
};

const App: React.FC = () => {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AISettings>(() => { try { const stored = localStorage.getItem('rss_ai_settings'); return stored ? JSON.parse(stored) : { providers: [], tasks: { general: null, translation: null, summary: null, analysis: null } }; } catch { return { providers: [], tasks: { general: null, translation: null, summary: null, analysis: null } }; } });
  const [showSettings, setShowSettings] = useState(false);
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
  
  const [scrollPosition, setScrollPosition] = useState(0);
  const articleListRef = useRef<HTMLDivElement>(null);

  const [readArticleIds, setReadArticleIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('read_articles');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

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
        }
      });
      
      if (loadedFeeds.length === 0) setErrorMsg("Could not load feeds.");
      setFeeds(loadedFeeds); 
    } catch (e) {
      console.error(e);
      setErrorMsg("Error initializing feeds.");
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

  const baseArticles = useMemo(() => {
    if (!selectedFeed) return [];
    if (selectedDate) return selectedFeed.items.filter(item => { const d = new Date(item.pubDate); return d.getDate() === selectedDate.getDate() && d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear(); });
    return selectedFeed.items.slice(0, 20);
  }, [selectedFeed, selectedDate]);

  const isRetweet = (article: Article) => /^RT\s/i.test(article.title) || /^Re\s/i.test(article.title);

  const filteredArticles = useMemo(() => {
    if (activeFilters.length === 0) return baseArticles;
    return baseArticles.filter(article => activeFilters.some(filter => filter === ArticleCategory.RETWEET ? isRetweet(article) : articleClassifications[article.guid] === filter));
  }, [baseArticles, activeFilters, articleClassifications]);

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

  const handleTranslateToggle = useCallback(async () => {
    if (!activeArticle) return; if (showTranslation) { setShowTranslation(false); return; }
    if (translatedContent && lastTranslatedLang === targetLang) { setShowTranslation(true); return; }
    setIsTranslating(true);
    try {
      const result = await translateContent(activeArticle.content || activeArticle.description, targetLang, aiSettings);
      setTranslatedContent(result); setLastTranslatedLang(targetLang); setShowTranslation(true);
    } catch (error: any) { 
      console.error(error); 
      // Show specific error message from the service
      alert(`翻译失败:\n${error.message || "未知错误，请检查网络或配置。"}`); 
    } finally { 
      setIsTranslating(false); 
    }
  }, [activeArticle, targetLang, showTranslation, translatedContent, lastTranslatedLang, aiSettings]);

  const handleSaveSettings = (newSettings: AISettings) => { setAiSettings(newSettings); localStorage.setItem('rss_ai_settings', JSON.stringify(newSettings)); };

  const proxiedArticleContent = useMemo(() => {
    if (!activeArticle?.content) return activeArticle?.description || '';
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(activeArticle.content, 'text/html');
      const images = doc.querySelectorAll('img');
      images.forEach(img => {
        const originalSrc = img.getAttribute('src');
        if (originalSrc) {
          img.setAttribute('src', proxyImageUrl(originalSrc));
        }
      });
      return doc.body.innerHTML;
    } catch (e) {
      return activeArticle.content; // Fallback on parsing error
    }
  }, [activeArticle]);
  
  const readingViewAvatar = useMemo(() => {
      const feedImage = selectedFeed?.image;
      const fallback = proxyImageUrl(`https://ui-avatars.com/api/?name=${encodeURIComponent(selectedFeed?.title || 'A')}`);
      return feedImage || fallback;
  }, [selectedFeed]);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative dark:bg-slate-900 dark:text-slate-100 transition-colors duration-300">
      <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-30 lg:hidden ${isSidebarOpen ? 'block' : 'hidden'}`} onClick={() => setIsSidebarOpen(false)} />
      <div className={`fixed inset-y-0 left-0 z-40 w-80 flex flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 ease-in-out dark:bg-slate-900 dark:border-slate-800 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 ${!isSidebarOpen && 'lg:hidden'} shrink-0`}>
        <div className="p-6 border-b border-slate-100 bg-white dark:bg-slate-900 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <div onClick={handleBackToDashboard} className="cursor-pointer flex items-center gap-2 group"><div className="bg-blue-600 text-white p-1.5 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M3.75 4.5a.75.75 0 01.75-.75h.75c8.284 0 15 6.716 15 15v.75a.75.75 0 01-.75.75h-.75a.75.75 0 01-.75-.75v-.75C18 11.75 14.25 8 9.625 8H3.75a.75.75 0 01-.75-.75V4.5zM3.75 18.75a.75.75 0 01.75-.75h.75c1.036 0 1.875.84 1.875 1.875v.75a.75.75 0 01-.75.75h-.75a.75.75 0 01-.75-.75v-.75zm3.75-9a.75.75 0 01.75-.75h.75c4.97 0 9 4.03 9 9v.75a.75.75 0 01-.75.75h-.75a.75.75 0 01-.75-.75V18.75c0-3.314-2.686-6-6-6H4.5a.75.75 0 01-.75-.75v-.75z" clipRule="evenodd" /></svg></div><h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Gemini RSS</h1></div>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg dark:hover:bg-slate-800" title="Collapse Sidebar"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 lg:hidden"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 hidden lg:block"><path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" /></svg></button>
          </div>
          <p className="text-xs text-slate-400">Curated updates from BanG Dream & IMAS</p>
          {errorMsg && <p className="text-xs text-red-500 mt-2 px-1">{errorMsg}</p>}
        </div>
        <div className="flex items-center justify-between px-6 py-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subscriptions</span>
          <div className="flex bg-slate-100 rounded-lg p-1 gap-1 dark:bg-slate-800">
            <button onClick={() => setSidebarMode('list')} className={`p-1.5 rounded-md transition-all ${sidebarMode === 'list' ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700' : 'text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <button onClick={() => setSidebarMode('grid')} className={`p-1.5 rounded-md transition-all ${sidebarMode === 'grid' ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700' : 'text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
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
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 0a20.832 20.832 0 011.439-4.283c.267-.579.976-.78 1.527-.461l.657.38c.523.301.71.96.463 1.511a18.058 18.058 0 01-.985 2.783m2.49 5.06a18.057 18.057 0 01-.99-2.662m0 0a18.055 18.055 0 01.99-2.662m-1.98 5.324a18.046 18.046 0 01-3.56-5.323m0 0a18.046 18.046 0 013.56-5.323" />
            </svg>
            <span className="text-sm">设置 (Settings)</span>
          </button>
          <button onClick={() => setDarkMode(!darkMode)} className="p-2 aspect-square flex items-center justify-center text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl dark:text-slate-400 dark:hover:bg-slate-800" title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}>
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
                   <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-500 hover:text-blue-600 rounded-lg" title="Expand Sidebar">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                      </svg>
                   </button>
                 )}
                 <div><h2 className="text-3xl font-bold text-slate-800 dark:text-white">Dashboard</h2><p className="text-slate-500 dark:text-slate-400">Overview of your news ecosystem.</p></div>
               </header>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-6 dark:bg-slate-800 dark:border-slate-700">
                    <div className="bg-blue-100 p-3 rounded-full text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-400">Total Articles</p>
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
                      <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-400">Active Feeds</p>
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
                   <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-500 hover:text-blue-600 rounded-lg" title="Expand Sidebar">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                      </svg>
                   </button>
                 )}
                 <img src={selectedFeed.image} className="w-10 h-10 object-contain rounded-md border border-slate-100 hidden sm:block" alt="" />
                 <div className="overflow-hidden">
                   <h2 className="text-lg md:text-xl font-bold text-slate-800 truncate dark:text-slate-100">{selectedFeed.title}</h2>
                   <p className="text-xs text-slate-400 font-medium uppercase tracking-wider hidden sm:block">{selectedDate ? `Filtered: ${selectedDate.toLocaleDateString()}` : 'Latest Articles'}</p>
                 </div>
               </div>
               <div className="flex items-center gap-2">
                 <button onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)} className={`p-2 rounded-lg transition-colors border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 ${isRightSidebarOpen ? 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800' : 'text-slate-500 hover:text-blue-600'}`} title="Toggle Right Sidebar">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                 </button>
               </div>
             </div>
             <FilterBar activeFilters={activeFilters} onToggleFilter={handleFilterToggle} onReset={() => setActiveFilters([])} onAnalyze={handleRunAnalysis} isAnalyzing={isAnalyzing} analysisSuccess={analysisSuccess} />
             <div ref={articleListRef} className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">
                 {filteredArticles.map(article => (
                    <ArticleCard 
                        key={article.guid || article.link} 
                        // aiCategory passed directly so semantic category shows up. 
                        // ArticleCard will handle displaying Retweet badge separately.
                        article={{ ...article, aiCategory: articleClassifications[article.guid] }} 
                        isSelected={false} 
                        isRead={readArticleIds.has(article.guid || article.link)}
                        onClick={() => handleArticleSelect(article)} 
                    />
                 ))}
               </div>
             </div>
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
                    <span className="font-semibold text-sm hidden sm:inline">Back</span>
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
                       <span className="hidden md:inline">Translating...</span>
                    </>
                   ) : showTranslation ? (
                     <>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 md:mr-2">
                           <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                        </svg>
                        <span className="hidden md:inline">Restore</span>
                     </>
                   ) : (
                     <>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 md:mr-2">
                           <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
                        </svg>
                        <span className="hidden md:inline">Translate</span>
                     </>
                   )}
                 </button>
                 <a href={activeArticle.link} target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-blue-600 rounded-lg dark:hover:bg-slate-800" title="Open Original Article">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                 </a>
                 <button onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)} className={`p-2 rounded-lg transition-colors border border-slate-200 bg-white ml-2 dark:bg-slate-800 dark:border-slate-700 ${isRightSidebarOpen ? 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800' : 'text-slate-500 hover:text-blue-600'}`} title="Toggle Right Sidebar">
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
                 {showTranslation && translatedContent && (
                   <div className="mb-12 rounded-3xl overflow-hidden border border-indigo-200 shadow-xl bg-white animate-fade-in dark:bg-slate-800 dark:border-indigo-900">
                     <div className="bg-indigo-50/80 px-6 py-3 border-b border-indigo-100 flex items-center justify-between dark:bg-indigo-900/40 dark:border-indigo-800">
                       <div className="flex items-center gap-2 text-indigo-700 font-bold uppercase text-xs dark:text-indigo-300">Gemini Translation ({targetLang})</div>
                     </div>
                     <div className="p-8 prose prose-indigo prose-lg max-w-none text-slate-800 font-serif dark:prose-invert dark:text-slate-200" dangerouslySetInnerHTML={{ __html: translatedContent }} />
                   </div>
                 )}
                 <div className={`prose prose-slate prose-lg max-w-none prose-img:rounded-xl dark:prose-invert ${showTranslation ? 'opacity-30 grayscale hover:opacity-100 hover:grayscale-0 transition-all' : ''}`} dangerouslySetInnerHTML={{ __html: proxiedArticleContent }} />
               </div>
             </div>
           </div>
         )}
      </div>
      {selectedFeed && (
        <div className={`fixed inset-y-0 right-0 z-30 w-80 bg-slate-50/80 backdrop-blur-xl border-l border-slate-200 shadow-lg transform transition-transform duration-300 ${isRightSidebarOpen ? 'translate-x-0' : 'translate-x-full'} lg:relative lg:translate-x-0 lg:shadow-none lg:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 ${!isRightSidebarOpen && 'lg:hidden'}`}>
          <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-600 dark:text-slate-300">Filters & AI</h3>
              <button onClick={() => setIsRightSidebarOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded dark:hover:bg-slate-800">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Filter by Date</h4>
              <CalendarWidget selectedDate={selectedDate} onDateSelect={handleDateSelect} />
            </div>
            <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-800 dark:border-slate-700">
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100 flex items-center justify-between dark:from-indigo-900/20 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-700 text-sm dark:text-slate-200">AI Daily Summary</h3>
                </div>
                {!selectedDate && <span className="text-[10px] text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100 dark:bg-orange-900/30">Select Date</span>}
              </div>
              <div className="flex-1 p-4 overflow-y-auto">
                {!selectedDate ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <p className="text-slate-400 text-sm mb-2">Select a specific date on the calendar above to generate a summary.</p>
                  </div>
                ) : baseArticles.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <p className="text-slate-400 text-sm">No articles found on this date.</p>
                  </div>
                ) : dailySummary ? (
                  <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap animate-fade-in font-sans dark:text-slate-300">{dailySummary}</div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center">
                    <button onClick={handleRunAnalysis} disabled={isSummarizing || isAnalyzing} className="group relative inline-flex items-center justify-center gap-2 px-5 py-2.5 font-semibold text-white transition-all duration-200 bg-indigo-600 rounded-full hover:bg-indigo-700">Summarize {baseArticles.length} articles</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <SettingsModal isOpen={showSettings} onClose={() => { setShowSettings(false); initFeeds(); }} settings={aiSettings} onSave={handleSaveSettings} />
    </div>
  );
};

export default App;