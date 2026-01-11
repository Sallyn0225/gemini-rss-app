import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PanelLeft, 
  PanelRight, 
  Filter, 
  RefreshCw, 
  ArrowUp 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ArticleCard } from './ArticleCard';
import { FilterBar } from './FilterBar';
import { Feed, Article } from '../types';
import { cn } from "@/lib/utils";

interface ArticleListProps {
  selectedFeed: Feed;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  selectedDate: Date | null;
  isRightSidebarOpen: boolean;
  setIsRightSidebarOpen: (open: boolean) => void;
  activeFilters: string[];
  handleFilterToggle: (filter: string) => void;
  handleRunAnalysis: () => void;
  isAnalyzing: boolean;
  analysisSuccess: boolean;
  isAiConfigured: boolean;
  paginatedArticlesWithCategory: any[];
  readArticleIds: Set<string>;
  handleArticleSelect: (article: Article) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  filteredArticlesCount: number;
  isLoadingMoreHistory: boolean;
  canLoadMoreHistory: boolean;
  showScrollToTop: boolean;
  handleScrollToTop: () => void;
  articleListRef: React.RefObject<HTMLDivElement>;
  visiblePageTokens: (number | string)[];
}

export const ArticleList: React.FC<ArticleListProps> = ({
  selectedFeed,
  isSidebarOpen,
  setIsSidebarOpen,
  selectedDate,
  isRightSidebarOpen,
  setIsRightSidebarOpen,
  activeFilters,
  handleFilterToggle,
  handleRunAnalysis,
  isAnalyzing,
  analysisSuccess,
  paginatedArticlesWithCategory,
  readArticleIds,
  handleArticleSelect,
  onRefresh,
  isRefreshing,
  currentPage,
  setCurrentPage,
  totalPages,
  filteredArticlesCount,
  isLoadingMoreHistory,
  canLoadMoreHistory,
  showScrollToTop,
  handleScrollToTop,
  articleListRef,
  visiblePageTokens
}) => {
  const [pullDistance, setPullDistance] = React.useState(0);
  const touchStartRef = React.useRef<number>(0);
  const rafRef = React.useRef<number | null>(null);

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
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      
      rafRef.current = requestAnimationFrame(() => {
        const pull = Math.min(distance * 0.4, 100);
        setPullDistance(pull);
      });

      if (distance > 5 && e.cancelable) {
        e.preventDefault();
      }
    } else {
      if (pullDistance !== 0) setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance >= 60) {
      onRefresh().finally(() => {
        setPullDistance(0);
      });
    } else {
      setPullDistance(0);
    }
    touchStartRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  return (
    <div
      className="h-full flex flex-col animate-in fade-in duration-500"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <header className="h-16 px-4 md:px-8 flex items-center justify-between bg-background/80 backdrop-blur-md border-b sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          {!isSidebarOpen && (
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)} className="shrink-0">
              <PanelLeft className="w-5 h-5" />
            </Button>
          )}
          <div className="overflow-hidden">
            <h2 className="text-lg font-black truncate uppercase tracking-tight">{selectedFeed.title}</h2>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest hidden sm:block">
              {selectedDate ? `筛选日期: ${selectedDate.toLocaleDateString()}` : '最新内容'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant={isRightSidebarOpen ? "default" : "outline"} 
            size="sm" 
            onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
            className="text-[10px] font-black uppercase tracking-widest h-10 md:h-8"
          >
            {isRightSidebarOpen ? <PanelRight className="w-3.5 h-3.5 mr-2" /> : <Filter className="w-3.5 h-3.5 mr-2" />}
            {isRightSidebarOpen ? '关闭侧栏' : '筛选与分析'}
          </Button>
        </div>
      </header>

      <FilterBar
        activeFilters={activeFilters}
        onToggleFilter={handleFilterToggle}
        onReset={() => handleFilterToggle('__reset__')} // Note: Logic handled in App.tsx
        onAnalyze={handleRunAnalysis}
        isAnalyzing={isAnalyzing}
        analysisSuccess={analysisSuccess}
        selectedDate={selectedDate}
        isAiConfigured={isAiConfigured}
      />

      <ScrollArea ref={articleListRef as any} className="flex-1 bg-muted/10">
        <div className="p-4 md:p-8">
          {/* Pull-to-refresh indicator */}
          <div
            className="lg:hidden flex items-center justify-center text-xs text-primary overflow-hidden transition-all duration-300 ease-out"
            style={{
              height: isRefreshing ? 40 : pullDistance,
              opacity: isRefreshing || pullDistance > 0 ? 1 : 0
            }}
          >
            {isRefreshing ? (
              <div className="flex items-center gap-2 font-bold">
                <RefreshCw className="animate-spin h-4 w-4" />
                <span>正在刷新...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 font-bold">
                <ArrowUp className={cn("w-4 h-4 transition-transform duration-300", pullDistance >= 60 && "rotate-180")} />
                <span>{pullDistance >= 60 ? '释放刷新' : '下拉刷新'}</span>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="py-12 flex flex-col items-center gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-full px-6 font-bold"
                >
                  上一页
                </Button>
                <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-full border">
                  {visiblePageTokens.map(token => {
                    if (typeof token === 'string') return <span key={token} className="w-8 text-center text-muted-foreground">···</span>;
                    return (
                      <Button
                        key={`page-${token}`}
                        variant={currentPage === token ? "default" : "ghost"}
                        size="icon"
                        onClick={() => setCurrentPage(token as number)}
                        className="h-8 w-8 rounded-full text-xs font-bold"
                      >
                        {token}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-full px-6 font-bold"
                >
                  下一页
                </Button>
              </div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                共 {filteredArticlesCount} 篇文章 • 第 {currentPage} / {totalPages || 1} 页
              </p>
            </div>
          )}

          {(isLoadingMoreHistory || canLoadMoreHistory) && (
            <div className="py-8 text-center">
              <Badge variant="outline" className="px-4 py-1 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
                {isLoadingMoreHistory ? '正在加载历史内容...' : '滑动到底部加载更多'}
              </Badge>
            </div>
          )}
        </div>
      </ScrollArea>

      <AnimatePresence>
        {showScrollToTop && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-30"
          >
            <Button
              size="icon"
              onClick={handleScrollToTop}
              className="w-12 h-12 rounded-full shadow-xl hover:scale-110 transition-transform"
            >
              <ArrowUp className="w-6 h-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};