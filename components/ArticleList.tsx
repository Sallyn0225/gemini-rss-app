import React, { useMemo } from 'react';
import {
  PanelLeft,
  PanelRight,
  Filter,
  RefreshCw,
  ArrowUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  paginatedArticlesWithCategory: (Article & { aiCategory?: string })[];
  readArticleIds: Set<string>;
  handleArticleSelect: (article: Article) => void;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  totalPages: number;
  filteredArticlesCount: number;
  articleListRef: React.RefObject<HTMLDivElement>;
  feedId: string;
  initialScrollPosition?: number;
  onScrollPositionChange?: (feedId: string, position: number) => void;
  onShowToast?: (message: string, variant?: 'default' | 'destructive') => void;
  loadedCount?: number;
  totalCount?: number;
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
  isAiConfigured,
  paginatedArticlesWithCategory,
  readArticleIds,
  handleArticleSelect,
  onRefresh,
  isRefreshing,
  currentPage,
  setCurrentPage,
  totalPages,
  filteredArticlesCount,
  articleListRef,
  feedId,
  initialScrollPosition = 0,
  onScrollPositionChange,
  onShowToast,
  loadedCount,
  totalCount
}) => {
  const [pullDistance, setPullDistance] = React.useState(0);
  const touchStartRef = React.useRef<number>(0);
  const rafRef = React.useRef<number | null>(null);

  const visiblePageTokens = useMemo((): (number | string)[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const tokens: (number | string)[] = [1];
    if (currentPage > 3) tokens.push('…l');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) tokens.push(i);
    if (currentPage < totalPages - 2) tokens.push('…r');
    tokens.push(totalPages);
    return tokens;
  }, [currentPage, totalPages]);

  const getViewport = React.useCallback(() => {
    return articleListRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLElement | null;
  }, [articleListRef]);

  // 恢复滚动位置
  React.useLayoutEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;
    const targetPosition = initialScrollPosition ?? 0;
    const frame = requestAnimationFrame(() => {
      viewport.scrollTop = targetPosition;
    });
    return () => cancelAnimationFrame(frame);
  }, [feedId, initialScrollPosition, getViewport]);

  // 保存滚动位置（滚动时）
  React.useEffect(() => {
    const viewport = getViewport();
    if (!viewport || !onScrollPositionChange) return;
    const handleScroll = () => {
      onScrollPositionChange(feedId, viewport.scrollTop);
    };
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [feedId, onScrollPositionChange, getViewport]);

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
              {selectedDate ? (
                `筛选日期: ${selectedDate.toLocaleDateString()}`
              ) : (
                <span className="flex items-center gap-2">
                  <span>最新内容</span>
                  {totalCount && totalCount > 0 && activeFilters.length === 0 && (
                    <>
                      <span className="w-px h-3 bg-border/60" />
                      <span className="font-black text-foreground/80">
                        已加载 {loadedCount} <span className="text-muted-foreground/50 mx-0.5">/</span> {totalCount}
                      </span>
                    </>
                  )}
                </span>
              )}
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
        onShowToast={onShowToast}
      />

      <ScrollArea ref={articleListRef as React.Ref<HTMLDivElement>} className="flex-1 bg-muted/10">
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
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
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
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-full px-6 font-bold"
                >
                  下一页
                </Button>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  共 {filteredArticlesCount} 篇文章 • 第 {currentPage} / {totalPages || 1} 页
                </p>
                {!selectedDate && totalCount && loadedCount && totalCount > loadedCount && activeFilters.length === 0 && (
                  <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest">
                    仅显示已加载内容，翻页会自动预加载更多
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
