import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Article, ArticleCategory } from '../types';
import { getMediaUrl } from '../services/rssService';
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ArticleCardProps {
  article: Article;
  onClick: () => void;
  isSelected: boolean;
  isRead: boolean;
}

export const ArticleCard: React.FC<ArticleCardProps> = React.memo(({ article, onClick, isSelected, isRead }) => {
  const [imgError, setImgError] = useState(false);

  const hasValidThumbnail = !imgError && article.thumbnail?.original;

  const preview = useMemo(() => {
    const previewLength = hasValidThumbnail ? 150 : 250;
    const rawPreview = article.description?.replace(/<[^>]+>/g, '') || '';
    return rawPreview.length > previewLength
      ? rawPreview.substring(0, previewLength).replace(/\s+\S*$/, '') + '...'
      : rawPreview || '无可用预览。';
  }, [article.description, hasValidThumbnail]);

  const formattedDateTime = useMemo(() => {
    return new Date(article.pubDate).toLocaleString([], {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).replace(',', '');
  }, [article.pubDate]);

  const isRetweet = useMemo(() => {
    return /^RT\s/i.test(article.title) || /^Re\s/i.test(article.title);
  }, [article.title]);

  const handleClick = useCallback(() => {
    onClick();
  }, [onClick]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      <Card
        asChild
        className={cn(
          "flex flex-col h-full overflow-hidden group transition-all duration-300 hover:shadow-md text-left w-full p-0",
          isSelected ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"
        )}
      >
        <button
          onClick={handleClick}
          aria-label={`阅读文章: ${article.title}`}
          className="flex flex-col h-full w-full cursor-pointer"
        >
          <div className="relative aspect-video overflow-hidden bg-muted w-full">
          {hasValidThumbnail ? (
            <img 
              src={getMediaUrl(article.thumbnail)} 
              alt="" 
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-6 text-center">
               <span className="text-xs font-medium text-muted-foreground line-clamp-2 opacity-50">
                 {article.title}
               </span>
            </div>
          )}
          
          <div className="absolute top-2 left-2 z-20 flex flex-wrap gap-1 items-start max-w-[90%]">
            <Badge variant="default" className="bg-primary text-primary-foreground text-[10px] px-2 py-0">
              {article.feedTitle}
            </Badge>
            {isRetweet && (
              <Badge variant="secondary" className="text-[10px] px-2 py-0">
                RT
              </Badge>
            )}
            {article.aiCategory && article.aiCategory !== ArticleCategory.RETWEET && (
              <Badge variant="outline" className="bg-background/80 backdrop-blur-sm text-[10px] px-2 py-0">
                {article.aiCategory}
              </Badge>
            )}
          </div>
          
          {!isRead && (
            <div className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
          )}
        </div>

        <CardHeader className="p-4 pb-2 space-y-1">
          <h3 className="font-bold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {article.title}
          </h3>
        </CardHeader>
        
        <CardContent className="p-4 pt-0 flex-1">
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {preview}
          </p>
        </CardContent>
        
        <CardFooter className="p-4 pt-0 flex items-center justify-between border-t border-border/50 mt-auto">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
            <Calendar className="w-3 h-3" />
            <time>{formattedDateTime}</time>
          </div>
          <div className="flex items-center gap-1 text-primary font-bold text-[10px] uppercase tracking-tight opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
            <span>阅读全文</span>
            <ExternalLink className="w-3 h-3" />
          </div>
          </CardFooter>
        </button>
      </Card>
    </motion.div>
  );
});
