import React, { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Feed, FeedMeta } from '../types';
import { getMediaUrl, proxyImageUrl } from '../services/rssService';
import { Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarViewMode = 'list' | 'grid';

interface FeedItemProps {
  feedMeta: FeedMeta;
  feedContent?: Feed | null;
  mode: SidebarViewMode;
  isSelected: boolean;
  isLoading?: boolean;
  onSelect: (feedMeta: FeedMeta) => void;
}

export const FeedItem: React.FC<FeedItemProps> = React.memo(({ feedMeta, feedContent, mode, isSelected, isLoading, onSelect }) => {
  const displayTitle = feedMeta.customTitle || feedContent?.title || feedMeta.id;
  const fallbackAvatar = useMemo(() => proxyImageUrl(`https://ui-avatars.com/api/?name=${encodeURIComponent(displayTitle)}&background=3b82f6&color=fff&size=128`), [displayTitle]);

  const handleClick = useCallback(() => {
    onSelect(feedMeta);
  }, [onSelect, feedMeta]);

  if (mode === 'grid') {
    return (
      <motion.div 
        className="relative group w-full"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        <button
          onClick={handleClick}
          className={cn(
            "relative aspect-square rounded-xl overflow-hidden border w-full block transition-all duration-300 group-hover:shadow-md",
            isSelected ? "border-primary ring-2 ring-primary ring-offset-2 bg-muted" : "border-border hover:border-primary/50 bg-card"
          )}
          title={displayTitle}
        >
          <img
            src={getMediaUrl(feedContent?.image) || fallbackAvatar}
            alt={displayTitle}
            className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110 bg-muted"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = fallbackAvatar; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
            <p className="text-white text-[10px] font-bold line-clamp-2 leading-tight text-left">{displayTitle}</p>
          </div>
          {isSelected && (
            <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center shadow-sm">
              <Check className="w-2.5 h-2.5 text-primary-foreground" />
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] flex items-center justify-center">
              <RefreshCw className="h-4 w-4 text-primary animate-spin" />
            </div>
          )}
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className={cn("relative group w-full", feedMeta.isSub && "pl-4")}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      {feedMeta.isSub && <div className="absolute left-2 top-0 bottom-1/2 w-2 border-l border-b border-border rounded-bl-md -z-10" />}
      <button
        onClick={handleClick}
        className={cn(
          "flex items-center gap-3 w-full p-2 rounded-lg text-left transition-all duration-200",
          isSelected ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted"
        )}
      >
        {feedContent ? (
          <img
            src={getMediaUrl(feedContent.image) || fallbackAvatar}
            alt=""
            className={cn(
              "w-8 h-8 rounded-md object-cover shrink-0 border bg-muted",
              isSelected ? "border-primary-foreground/20" : "border-border"
            )}
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = fallbackAvatar; }}
          />
        ) : (
          <div className="w-8 h-8 bg-muted rounded-md shrink-0 animate-pulse" />
        )}
        <div className="flex-1 overflow-hidden">
          <p className={cn("font-bold text-sm truncate", isSelected ? "text-primary-foreground" : "text-foreground")}>{displayTitle}</p>
          {feedContent ? (
            <p className={cn("text-[10px] font-medium truncate", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>{feedContent.items.length} 篇文章</p>
          ) : (
            <div className="h-2 w-12 bg-muted rounded mt-1 animate-pulse" />
          )}
        </div>
        {isLoading && (
          <RefreshCw className={cn("h-3 w-3 animate-spin", isSelected ? "text-primary-foreground" : "text-primary")} />
        )}
      </button>
    </motion.div>
  );
});

FeedItem.displayName = 'FeedItem';