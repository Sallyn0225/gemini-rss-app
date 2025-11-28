import React, { useState } from 'react';
import { Article, ArticleCategory } from '../types';

interface ArticleCardProps {
  article: Article;
  onClick: () => void;
  isSelected: boolean;
  isRead: boolean;
}

export const ArticleCard: React.FC<ArticleCardProps> = ({ article, onClick, isSelected, isRead }) => {
  const [imgError, setImgError] = useState(false);

  // Check if article has a valid thumbnail
  const hasValidThumbnail = !imgError && article.thumbnail;

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

  return (
    <div 
      onClick={onClick}
      className={`
        flex flex-col bg-white rounded-2xl cursor-pointer transition-all duration-300 border overflow-hidden group dark:bg-slate-800
        ${isSelected 
          ? 'ring-2 ring-blue-500 border-transparent shadow-xl' 
          : 'border-slate-100 hover:shadow-xl hover:-translate-y-1 hover:border-slate-200 dark:border-slate-700 dark:hover:border-slate-600'}
      `}
    >
      {/* Thumbnail - conditional height based on image availability */}
      <div className={`${hasValidThumbnail ? 'h-48' : 'h-28'} w-full overflow-hidden bg-slate-100 relative dark:bg-slate-900 transition-all duration-300`}>
        {hasValidThumbnail ? (
          <img 
            src={article.thumbnail} 
            alt="" 
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 text-slate-400 relative overflow-hidden dark:from-slate-800 dark:via-slate-850 dark:to-slate-900 dark:text-slate-500 px-4">
             {/* Abstract Pattern for placeholder */}
             <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '20px 20px' }}></div>
             {/* Display truncated title as visual anchor */}
             <span className="text-base font-semibold relative z-10 opacity-50 select-none text-center line-clamp-2 leading-snug">
               {article.title.length > 30 ? article.title.substring(0, 30) + '...' : article.title}
             </span>
          </div>
        )}
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-1 items-start">
             <span className="bg-white/90 backdrop-blur-md text-slate-800 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm uppercase tracking-wider border border-slate-100 dark:bg-slate-900/90 dark:text-slate-200 dark:border-slate-800">
               {article.feedTitle}
             </span>
             {isRetweet && (
                <span className="bg-slate-600/90 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm tracking-wider border border-slate-500/20">
                  {ArticleCategory.RETWEET}
                </span>
             )}
             {article.aiCategory && article.aiCategory !== ArticleCategory.RETWEET && (
                <span className="bg-indigo-500/90 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm tracking-wider border border-indigo-400/20">
                  {article.aiCategory}
                </span>
             )}
        </div>
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"></div>
      </div>

      <div className="p-5 flex flex-col flex-1 relative">
        <h3 className="font-bold text-lg text-slate-800 mb-2 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors dark:text-slate-100 dark:group-hover:text-blue-400">
          {article.title}
        </h3>
        
        <p className={`text-sm text-slate-500 leading-relaxed mb-4 flex-1 dark:text-slate-400 ${hasValidThumbnail ? 'line-clamp-3' : 'line-clamp-4'}`}>
          {preview}
        </p>
        
        <div className="flex items-center justify-between text-xs text-slate-400 mt-auto pt-4 border-t border-slate-50 dark:border-slate-700">
          <div className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <time>{formattedDateTime}</time>
          </div>
          <div className="flex items-center gap-2">
            {!isRead && (
               <span className="flex h-3 w-3 relative">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
               </span>
            )}
            <span className="font-semibold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0 dark:text-blue-400">阅读 &rarr;</span>
          </div>
        </div>
      </div>
    </div>
  );
};