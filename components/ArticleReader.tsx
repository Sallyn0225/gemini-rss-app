import React from 'react';
import { 
  ChevronLeft, 
  Languages, 
  Sparkles, 
  RefreshCw, 
  PanelLeft, 
  PanelRight, 
  ExternalLink 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Article, Language } from '../types';

interface ArticleReaderProps {
  article: Article;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isRightSidebarOpen: boolean;
  setIsRightSidebarOpen: (open: boolean) => void;
  handleBackToArticles: () => void;
  targetLang: Language;
  handleLanguageSwitch: (lang: Language) => void;
  showTranslation: boolean;
  handleTranslateToggle: () => void;
  isTranslating: boolean;
  translatedContent: string | null;
  getTranslatorName: () => string;
  proxiedArticleContent: string;
  readingViewAvatar: string;
}

export const ArticleReader: React.FC<ArticleReaderProps> = ({
  article,
  isSidebarOpen,
  setIsSidebarOpen,
  isRightSidebarOpen,
  setIsRightSidebarOpen,
  handleBackToArticles,
  targetLang,
  handleLanguageSwitch,
  showTranslation,
  handleTranslateToggle,
  isTranslating,
  translatedContent,
  getTranslatorName,
  proxiedArticleContent,
  readingViewAvatar
}) => {
  return (
    <div className="h-full flex flex-col bg-background animate-in slide-in-from-right duration-500">
      <header className="h-16 border-b flex items-center justify-between px-4 md:px-6 bg-background/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-2">
          {!isSidebarOpen && (
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)} className="mr-2">
              <PanelLeft className="w-5 h-5" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleBackToArticles} className="gap-2 font-black text-[10px] uppercase tracking-widest">
            <ChevronLeft className="w-4 h-4" />
            返回列表
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 mr-2">
            <Languages className="w-4 h-4 text-muted-foreground" />
            <Select value={targetLang} onValueChange={(v) => handleLanguageSwitch(v as Language)}>
              <SelectTrigger className="h-8 w-[100px] text-[10px] font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(Language).map(lang => <SelectItem key={lang} value={lang}>{lang}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button 
            variant={showTranslation ? "default" : "outline"} 
            size="sm" 
            onClick={handleTranslateToggle} 
            disabled={isTranslating}
            className="text-[10px] font-black uppercase tracking-widest h-8"
          >
            {isTranslating ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
            {isTranslating ? '翻译中...' : showTranslation ? '显示原文' : 'AI 翻译'}
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button variant="ghost" size="icon" onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}>
            <PanelRight className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <article className="max-w-3xl mx-auto px-6 py-12 md:py-16 space-y-8">
          <header className="space-y-6">
            <h1 className="text-3xl md:text-5xl font-black leading-tight tracking-tight">{article.title}</h1>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary/20">
                <img src={readingViewAvatar} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <span className="font-black text-sm uppercase tracking-tight">{article.author || article.feedTitle}</span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {new Date(article.pubDate).toLocaleString('zh-CN', { dateStyle: 'long', timeStyle: 'short' })}
                </span>
              </div>
              <Badge variant="secondary" className="ml-auto">
                <a href={article.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                  原文链接 <ExternalLink className="w-3 h-3" />
                </a>
              </Badge>
            </div>
          </header>

          <Separator />

          {showTranslation && translatedContent && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-[0.2em]">
                <Sparkles className="w-3 h-3" />
                由 {getTranslatorName()} 翻译
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none prose-table:block prose-table:overflow-x-auto prose-img:max-w-full prose-img:h-auto" dangerouslySetInnerHTML={{ __html: translatedContent }} />
            </div>
          )}

          {!showTranslation && (
            <div
              className="prose prose-slate dark:prose-invert max-w-none prose-img:rounded-2xl prose-headings:font-black selection:bg-primary selection:text-primary-foreground prose-table:block prose-table:overflow-x-auto prose-img:max-w-full prose-img:h-auto prose-pre:max-w-full prose-pre:overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: proxiedArticleContent }}
            />
          )}
          
          <div className="h-20" />
        </article>
      </ScrollArea>
    </div>
  );
};