import React, { useState, useCallback } from 'react';
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

export const ArticleCard: React.FC<ArticleCardProps> = ({ article, onClick, isSelected, isRead }) => {
  const [imgError, setImgError] = useState(false);

  // Check if article has a valid thumbnail (MediaUrl with non-empty original)
  const hasValidThumbnail = !imgError && article.thumbnail?.original;

  // Strip HTML for the preview - show more text for articles without images
  const previewLength = hasValidThumbnail ? 150 : 250;
  const rawPreview = article.description?.replace(/<[^>]+>/g, '') || '';
  const preview = rawPreview.length > previewLength
    ? rawPreview.substring(0, previewLength).replace(/\s+\S*$/, '') + '...'
    : rawPreview || '无可用预览。';
  
  const formattedDateTime = new Date(article.pubDate).toLocaleString([], {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(',', '');
  
  const isRetweet = /^RT\s/i.test(article.title) || /^Re\s/i.test(article.title);

  // 波纹效果状态
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; size: number }>>([]);
  
  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 2;
    
    const newRipple = { id: Date.now(), x, y, size };
    setRipples(prev => [...prev, newRipple]);
    
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== newRipple.id));
    }, 600);

    onClick();
  }, [onClick]);

  return (
    <motion.div 
      onClick={handleClick}
      className={`
        flex flex-col glass-card cursor-pointer border-white/50 dark:border-slate-800 overflow-hidden group relative
        ${isSelected 
          ? 'ring-2 ring-organic-300 border-transparent shadow-soft-lg' 
          : 'shadow-soft-md'}
        rounded-organic-lg
      `}
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      transition={{ 
        type: 'spring',
        stiffness: 260,
        damping: 20
      }}
      whileHover={{ 
        y: -8,
        scale: 1.02,
        rotate: -1,
        boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.1)',
        transition: { duration: 0.3, ease: easeStandard }
      }}
      whileTap={{ 
        scale: 0.98,
        rotate: 0,
        transition: { duration: 0.1, ease: easeStandard }
      }}
    >
      {/* 波纹效果 */}
      {ripples.map(ripple => (
        <motion.span
          key={ripple.id}
          className="absolute rounded-full pointer-events-none z-50"
          style={{
            left: ripple.x - ripple.size / 2,
            top: ripple.y - ripple.size / 2,
            width: ripple.size,
            height: ripple.size,
            backgroundColor: 'rgba(198, 154, 114, 0.2)', // organic-500 with opacity
          }}
          initial={{ scale: 0, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: 0.8, ease: easeDecelerate }}
        />
      ))}
      {/* Thumbnail - conditional height based on image availability */}
      <div className={`p-4 pb-0`}>
        <div className={`
          ${hasValidThumbnail ? 'h-48' : 'h-28'} 
          w-full overflow-hidden bg-organic-100 relative transition-all duration-500
          rounded-blob group-hover:rounded-blob-hover
        `}>
          {hasValidThumbnail ? (
            <img 
              src={getMediaUrl(article.thumbnail)} 
              alt="" 
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" 
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-soft-sage via-organic-100 to-soft-purple text-organic-600 relative overflow-hidden px-4">
               {/* Abstract Pattern for placeholder */}
               <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
               {/* Display truncated title as visual anchor */}
               <span className="text-base font-medium relative z-10 opacity-60 select-none text-center line-clamp-2 leading-snug italic">
                 {article.title.length > 30 ? article.title.substring(0, 30) + '...' : article.title}
               </span>
            </div>
          )}
          
           <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 items-start">
                <span className="bg-white/80 backdrop-blur-md text-organic-800 text-[10px] font-bold px-3 py-1.5 rounded-full shadow-soft-md uppercase tracking-widest border border-white/50 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
                  {article.feedTitle}
                </span>
                {isRetweet && (
                   <span className="bg-organic-600/80 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-soft-md tracking-widest border border-white/20">
                     {ArticleCategory.RETWEET}
                   </span>
                )}
                {article.aiCategory && article.aiCategory !== ArticleCategory.RETWEET && (
                   <span className="bg-soft-purple/90 backdrop-blur-md text-organic-900 text-[10px] font-bold px-3 py-1.5 rounded-full shadow-soft-md tracking-widest border border-white/30 dark:bg-slate-800/90 dark:border-slate-700 dark:text-slate-300">
                     {article.aiCategory}
                   </span>
                )}
           </div>
          {/* Subtle Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-organic-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10"></div>
        </div>
      </div>

      <div className="p-6 flex flex-col flex-1 relative">
        <h3 className="font-bold text-xl text-slate-800 mb-3 leading-tight line-clamp-2 group-hover:text-organic-600 transition-colors">
          {article.title}
        </h3>
        
        <p className={`text-sm text-slate-700 leading-relaxed mb-5 flex-1 ${hasValidThumbnail ? 'line-clamp-3' : 'line-clamp-5'}`}>
          {preview}
        </p>
        
        <div className="flex items-center justify-between text-xs text-slate-400 mt-auto pt-5 border-t border-organic-100/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-organic-100 flex items-center justify-center text-organic-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <time className="font-medium text-slate-500">{formattedDateTime}</time>
          </div>
          <div className="flex items-center gap-3">
            {!isRead && (
               <span className="flex h-2.5 w-2.5 relative">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-organic-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-organic-500"></span>
               </span>
            )}
            <span className="font-bold text-organic-600 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0 flex items-center gap-1">
              阅读 <span className="text-lg">→</span>
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};