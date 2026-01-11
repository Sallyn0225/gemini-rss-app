import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Article, ArticleCategory } from '../types';
import { easeStandard, easeDecelerate } from './animations';
import { getMediaUrl } from '../services/rssService';

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
      onClick={handleClick}
      className={`
        flex flex-col bg-white dark:bg-slate-800 cursor-pointer border border-flat-200 dark:border-slate-700 overflow-hidden group relative
        ${isSelected 
          ? 'border-accent ring-1 ring-accent' 
          : 'hover:border-accent hover:bg-flat-50 dark:hover:bg-slate-700/50'}
        rounded-none
      `}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Thumbnail - conditional height based on image availability */}
      <div className="relative">
        <div className={`
          ${hasValidThumbnail ? 'h-48' : 'h-24'} 
          w-full overflow-hidden bg-flat-100 dark:bg-slate-900 relative transition-all duration-300
          rounded-none
        `}>
          {hasValidThumbnail ? (
            <img 
              src={getMediaUrl(article.thumbnail)} 
              alt="" 
              loading="lazy"
              className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500" 
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-flat-50 dark:bg-slate-900 text-flat-400 px-4">
               <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 select-none text-center line-clamp-2">
                 {article.title}
               </span>
            </div>
          )}
          
           <div className="absolute top-0 left-0 z-20 flex flex-col gap-0 items-start">
                <span className="bg-accent text-white text-[9px] font-bold px-2 py-1 uppercase tracking-widest">
                  {article.feedTitle}
                </span>
                {isRetweet && (
                   <span className="bg-flat-800 text-white text-[9px] font-bold px-2 py-1 tracking-widest">
                     RT
                   </span>
                )}
                {article.aiCategory && article.aiCategory !== ArticleCategory.RETWEET && (
                   <span className="bg-flat-200 text-flat-700 text-[9px] font-bold px-2 py-1 tracking-widest border-r border-b border-flat-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600">
                     {article.aiCategory}
                   </span>
                )}
           </div>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1 relative">
        <h3 className="font-bold text-base text-flat-900 dark:text-slate-100 mb-2 leading-snug line-clamp-2 transition-colors">
          {article.title}
        </h3>
        
        <p className="text-xs text-flat-500 dark:text-slate-400 leading-relaxed mb-4 flex-1 line-clamp-3">
          {preview}
        </p>
        
        <div className="flex items-center justify-between text-[10px] text-flat-400 mt-auto pt-3 border-t border-flat-100 dark:border-slate-700">
          <time className="font-bold uppercase tracking-wider">{formattedDateTime}</time>
          <div className="flex items-center gap-2">
            {!isRead && (
               <div className="h-1.5 w-1.5 bg-accent"></div>
            )}
            <span className="font-bold text-accent opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-tighter">
              Read More
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
