import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { get, set } from 'idb-keyval';
import {
  Feed,
  Article, 
  Language, 
  AISettings, 
  ImageProxyMode, 
  FeedMeta 
} from '../types';
import { setImageProxyMode as setGlobalImageProxyMode } from '../services/rssService';

interface AppContextType {
  // Appearance & UI
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isRightSidebarOpen: boolean;
  setIsRightSidebarOpen: (open: boolean) => void;
  sidebarMode: 'list' | 'grid';
  setSidebarMode: (mode: 'list' | 'grid') => void;
  
  // Data State
  feedConfigs: FeedMeta[];
  setFeedConfigs: (configs: FeedMeta[]) => void;
  feedContentCache: Record<string, Feed>;
  setFeedContentCache: React.Dispatch<React.SetStateAction<Record<string, Feed>>>;
  selectedFeedMeta: FeedMeta | null;
  setSelectedFeedMeta: (meta: FeedMeta | null) => void;
  selectedFeed: Feed | null;
  setSelectedFeed: (feed: Feed | null) => void;
  activeArticle: Article | null;
  setActiveArticle: (article: Article | null) => void;
  
  // Settings & AI
  aiSettings: AISettings;
  setAiSettings: (settings: AISettings) => void;
  imageProxyMode: ImageProxyMode;
  setImageProxyMode: (mode: ImageProxyMode) => void;
  
  // Reading Progress
  readArticleIds: Set<string>;
  markAsRead: (id: string) => void;
  isAiConfigured: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [sidebarMode, setSidebarMode] = useState<'list' | 'grid'>('list');

  const [feedConfigs, setFeedConfigs] = useState<FeedMeta[]>([]);
  const [feedContentCache, setFeedContentCache] = useState<Record<string, Feed>>({});
  const [selectedFeedMeta, setSelectedFeedMeta] = useState<FeedMeta | null>(null);
  const [selectedFeed, setSelectedFeed] = useState<Feed | null>(null);
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);

  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    try {
      const stored = localStorage.getItem('rss_ai_settings');
      return stored ? JSON.parse(stored) : { providers: [], tasks: { general: null, translation: null, summary: null, analysis: null } };
    } catch {
      return { providers: [], tasks: { general: null, translation: null, summary: null, analysis: null } };
    }
  });

  const [imageProxyMode, setImageProxyModeState] = useState<ImageProxyMode>(() => {
    const stored = localStorage.getItem('image_proxy_mode') as ImageProxyMode;
    return (stored === 'all' || stored === 'none') ? stored : 'all';
  });

  const [readArticleIds, setReadArticleIds] = useState<Set<string>>(new Set());

  // Sync imageProxyMode to global variable on mount
  // This ensures the module-level variable in rssService is in sync with React state
  useEffect(() => {
    setGlobalImageProxyMode(imageProxyMode);
  }, [imageProxyMode]);

  // Load read articles from IndexedDB on mount
  useEffect(() => {
    get('read_articles').then(stored => {
      if (stored && Array.isArray(stored)) {
        setReadArticleIds(new Set(stored));
      }
    }).catch(err => console.error('Failed to load read articles from IDB:', err));
  }, []);

  // Persist AI settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('rss_ai_settings', JSON.stringify(aiSettings));
    } catch (err) {
      console.error('Failed to persist AI settings to localStorage:', err);
    }
  }, [aiSettings]);

  const setImageProxyMode = useCallback((mode: ImageProxyMode) => {
    setImageProxyModeState(mode);
    setGlobalImageProxyMode(mode);
    localStorage.setItem('image_proxy_mode', mode);
  }, []);

  const markAsRead = useCallback((id: string) => {
    setReadArticleIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      set('read_articles', Array.from(next)).catch(err => console.error('Failed to save read articles to IDB:', err));
      return next;
    });
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const isAiConfigured = useMemo(() => {
    const { providers, tasks } = aiSettings;
    return providers.length > 0 && !!tasks.general?.providerId;
  }, [aiSettings]);

  const value = {
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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};