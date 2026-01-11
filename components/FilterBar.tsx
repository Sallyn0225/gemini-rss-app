import React from 'react';
import { RefreshCw, Check, Sparkles, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArticleCategory } from '../types';
import { cn } from "@/lib/utils";

interface FilterBarProps {
  activeFilters: string[];
  onToggleFilter: (filter: string) => void;
  onReset: () => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  analysisSuccess: boolean;
  selectedDate: Date | null;
  isAiConfigured: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = React.memo(({
  activeFilters,
  onToggleFilter,
  onReset,
  onAnalyze,
  isAnalyzing,
  analysisSuccess,
  selectedDate,
  isAiConfigured
}) => {
  const filters = [
    ArticleCategory.OFFICIAL, 
    ArticleCategory.MEDIA, 
    ArticleCategory.EVENT, 
    ArticleCategory.COMMUNITY, 
    ArticleCategory.RETWEET
  ];

  return (
    <div className="flex justify-center sticky top-0 z-20 py-3 pointer-events-none">
      <div className="flex items-center bg-background/80 backdrop-blur-md border rounded-full shadow-lg pointer-events-auto mx-4 overflow-hidden p-1">
        <Button
          variant={analysisSuccess ? "default" : "ghost"}
          size="sm"
          onClick={() => {
            if (!selectedDate) {
              alert("请先选择日期以进行 AI 分析");
              return;
            }
            if (!isAiConfigured) {
              alert("请先在设置中配置 AI 模型");
              return;
            }
            onAnalyze();
          }}
          disabled={isAnalyzing}
          className={cn(
            "h-8 rounded-full px-4 text-xs font-bold transition-all",
            analysisSuccess && "bg-green-500 hover:bg-green-600 text-white",
            !analysisSuccess && !isAnalyzing && "text-primary hover:bg-primary/10"
          )}
          title={!selectedDate ? "请先选择日期" : !isAiConfigured ? "请先配置 AI 模型" : undefined}
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="animate-spin h-3 w-3 mr-2" />
              <span>分析中...</span>
            </>
          ) : analysisSuccess ? (
            <>
              <Check className="h-3 w-3 mr-2" />
              <span>分析成功</span>
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3 mr-2" />
              <span>AI 分析</span>
            </>
          )}
        </Button>
        <Separator orientation="vertical" className="h-4 mx-1" />
        <Button 
          variant={activeFilters.length === 0 ? "secondary" : "ghost"}
          size="sm"
          onClick={onReset} 
          className="h-8 rounded-full px-4 text-xs font-bold"
        >
          全部
        </Button>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide max-w-[40vw] sm:max-w-none">
          {filters.map((filter) => (
            <Button 
              key={filter} 
              variant={activeFilters.includes(filter) ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onToggleFilter(filter)} 
              disabled={isAnalyzing && !activeFilters.includes(filter)} 
              className={cn(
                "h-8 rounded-full px-4 text-xs font-bold whitespace-nowrap",
                activeFilters.includes(filter) && "bg-muted text-foreground"
              )}
            >
              {filter}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
});

FilterBar.displayName = 'FilterBar';