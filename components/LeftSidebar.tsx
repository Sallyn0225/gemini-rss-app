import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Newspaper, 
  X, 
  List, 
  LayoutGrid, 
  ChevronLeft, 
  ChevronRight, 
  Folder, 
  FolderOpen,
  Settings,
  Sun,
  Moon,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FeedItem } from './FeedItem';
import { Feed, FeedMeta } from '../types';
import { cn } from "@/lib/utils";
import { proxyImageUrl, getMediaUrl } from '../services/rssService';

export interface CategoryNode {
  name: string;
  path: string;
  feeds: FeedMeta[];
  children: Map<string, CategoryNode>;
  depth: number;
}

interface LeftSidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  handleBackToDashboard: () => void;
  errorMsg: string | null;
  sidebarMode: 'list' | 'grid';
  setSidebarMode: (mode: 'list' | 'grid') => void;
  openFolderPath: string | null;
  setOpenFolderPath: (path: string | null) => void;
  groupedFeeds: Map<string, CategoryNode>;
  feedContentCache: Record<string, Feed>;
  selectedFeedMeta: FeedMeta | null;
  loadingFeedId: string | null;
  handleFeedSelect: (feed: FeedMeta) => void;
  collapsedCategories: Set<string>;
  toggleCategoryCollapse: (path: string) => void;
  loading: boolean;
  setShowSettings: (show: boolean) => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
}

const getNodeByPath = (groupedFeeds: Map<string, CategoryNode>, path: string): CategoryNode | null => {
  const parts = path.split('/').filter(Boolean);
  let current: Map<string, CategoryNode> = groupedFeeds;
  let node: CategoryNode | null = null;
  for (const part of parts) {
    node = current.get(part) || null;
    if (!node) return null;
    current = node.children;
  }
  return node;
};

const getFolderPreviews = (node: CategoryNode, feedContentCache: Record<string, Feed>): string[] => {
  const previews: string[] = [];
  for (const meta of node.feeds) {
    if (previews.length >= 4) break;
    const content = feedContentCache[meta.id];
    previews.push(getMediaUrl(content?.image) || `https://ui-avatars.com/api/?name=${encodeURIComponent(meta.customTitle || meta.id)}&background=3b82f6&color=fff&size=64`);
  }
  if (previews.length < 4) {
    for (const child of node.children.values()) {
      const childPreviews = getFolderPreviews(child, feedContentCache);
      for (const preview of childPreviews) {
        if (previews.length >= 4) break;
        previews.push(preview);
      }
      if (previews.length >= 4) break;
    }
  }
  return previews;
};

const countAllFeeds = (node: CategoryNode): number => {
  let count = node.feeds.length;
  node.children.forEach(child => { count += countAllFeeds(child); });
  return count;
};

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  handleBackToDashboard,
  errorMsg,
  sidebarMode,
  setSidebarMode,
  openFolderPath,
  setOpenFolderPath,
  groupedFeeds,
  feedContentCache,
  selectedFeedMeta,
  loadingFeedId,
  handleFeedSelect,
  collapsedCategories,
  toggleCategoryCollapse,
  loading,
  setShowSettings,
  darkMode,
  setDarkMode
}) => {
  const renderSubfolder = (node: CategoryNode) => {
    const totalCount = countAllFeeds(node);
    return (
      <button
        key={node.path}
        onClick={() => setOpenFolderPath(node.path)}
        className="relative aspect-square border rounded-xl bg-card flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:shadow-md transition-all group"
      >
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
          <Folder className="w-6 h-6 text-primary" />
        </div>
        <div className="text-center px-2">
          <p className="text-[10px] font-bold text-foreground truncate w-full uppercase tracking-tight">{node.name}</p>
          <p className="text-[9px] text-muted-foreground font-bold">{totalCount} 个源</p>
        </div>
      </button>
    );
  };

  const renderFolder = (node: CategoryNode) => {
    const previews = getFolderPreviews(node, feedContentCache);
    const totalCount = countAllFeeds(node);
    return (
      <div key={node.path} className="w-full">
        <button
          onClick={() => setOpenFolderPath(node.path)}
          className="w-full p-3 bg-card border rounded-2xl hover:border-primary/50 hover:shadow-md transition-all group"
        >
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="aspect-square bg-muted rounded-lg overflow-hidden">
                {previews[i] ? <img src={proxyImageUrl(previews[i])} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" /> : <div className="w-full h-full" />}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-foreground truncate uppercase tracking-wider">{node.name}</span>
            <Badge variant="secondary" className="h-4 px-1 text-[8px] font-black">{totalCount}</Badge>
          </div>
        </button>
      </div>
    );
  };

  const renderCategoryNode = (node: CategoryNode): React.ReactNode => {
    const isCollapsed = collapsedCategories.has(node.path);
    const hasChildren = node.children.size > 0 || node.feeds.length > 0;
    const childrenArray = Array.from(node.children.values());
    const totalFeeds = countAllFeeds(node);

    return (
      <div key={node.path} className="w-full">
        {node.name && (
          <button
            onClick={() => toggleCategoryCollapse(node.path)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors group"
            style={{ paddingLeft: `${(node.depth) * 8 + 12}px` }}
          >
            <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", !isCollapsed && "rotate-90")} />
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest truncate flex-1 text-left group-hover:text-foreground">
              {node.name}
            </span>
            <Badge variant="outline" className="h-4 px-1 text-[8px] font-bold opacity-50 group-hover:opacity-100">
              {totalFeeds}
            </Badge>
          </button>
        )}

        {(!node.name || !isCollapsed) && hasChildren && (
          <div className="space-y-0.5">
            {node.feeds.map((meta) => {
              const content = feedContentCache[meta.id] || null;
              return (
                <div key={meta.id} style={{ paddingLeft: `${(node.depth + (node.name ? 1 : 0)) * 8}px` }}>
                  <FeedItem
                    feedMeta={meta}
                    feedContent={content}
                    mode="list"
                    isSelected={selectedFeedMeta?.id === meta.id}
                    isLoading={loadingFeedId === meta.id}
                    onSelect={handleFeedSelect}
                  />
                </div>
              );
            })}
            {childrenArray.map((child) => renderCategoryNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <AnimatePresence>
        {isSidebarOpen && window.innerWidth < 1024 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden" 
            onClick={() => setIsSidebarOpen(false)} 
          />
        )}
      </AnimatePresence>

      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-72 flex flex-col bg-card border-r transition-all duration-300 ease-in-out lg:relative lg:translate-x-0 shrink-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full",
        !isSidebarOpen && "lg:w-0 lg:border-none lg:overflow-hidden"
      )}>
        <div className="p-4 border-b flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <div onClick={handleBackToDashboard} className="cursor-pointer flex items-center gap-2 group">
              <div className="bg-primary text-primary-foreground w-8 h-8 rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <Newspaper className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-black tracking-tighter">NSYC RSS</h1>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="lg:hidden">
              <X className="w-5 h-5" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">信息聚合中心</p>
          {errorMsg && <Badge variant="destructive" className="text-[9px] mt-1 py-0">{errorMsg}</Badge>}
        </div>

        <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">订阅源</span>
          <div className="flex bg-background border rounded-md p-0.5 shadow-sm">
            <Button
              variant={sidebarMode === 'list' ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 rounded-sm"
              onClick={() => setSidebarMode('list')}
            >
              <List className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={sidebarMode === 'grid' ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 rounded-sm"
              onClick={() => setSidebarMode('grid')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 px-3 py-4">
          <div className="space-y-1">
            {sidebarMode === 'grid' ? (
              (() => {
                if (openFolderPath) {
                  const currentNode = getNodeByPath(groupedFeeds, openFolderPath);
                  if (!currentNode) { setOpenFolderPath(null); return null; }
                  const childrenArray = Array.from(currentNode.children.values());
                  return (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const parts = openFolderPath.split('/').filter(Boolean);
                          setOpenFolderPath(parts.length <= 1 ? null : parts.slice(0, -1).join('/'));
                        }}
                        className="w-full justify-start gap-2 text-primary font-bold"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span className="truncate">{currentNode.name}</span>
                      </Button>
                      <div className="grid grid-cols-2 gap-3">
                        {currentNode.feeds.map(meta => {
                          const content = feedContentCache[meta.id] || null;
                          return <FeedItem key={meta.id} feedMeta={meta} feedContent={content} mode="grid" isSelected={selectedFeedMeta?.id === meta.id} isLoading={loadingFeedId === meta.id} onSelect={handleFeedSelect} />;
                        })}
                        {childrenArray.map(child => renderSubfolder(child))}
                      </div>
                    </motion.div>
                  );
                }
                const rootNodes = Array.from(groupedFeeds.entries());
                const uncategorized = rootNodes.find(([key]) => key === '__uncategorized__');
                const categories = rootNodes.filter(([key]) => key !== '__uncategorized__');
                return (
                  <div className="space-y-6">
                    {uncategorized && uncategorized[1].feeds.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {uncategorized[1].feeds.map(meta => {
                          const content = feedContentCache[meta.id] || null;
                          return <FeedItem key={meta.id} feedMeta={meta} feedContent={content} mode="grid" isSelected={selectedFeedMeta?.id === meta.id} isLoading={loadingFeedId === meta.id} onSelect={handleFeedSelect} />;
                        })}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      {categories.map(([, node]) => renderFolder(node))}
                    </div>
                  </div>
                );
              })()
            ) : (
              (() => {
                const rootNodes = Array.from(groupedFeeds.entries());
                return rootNodes.map(([key, node]) => {
                  if (key === '__uncategorized__') {
                    return node.feeds.map(meta => {
                      const content = feedContentCache[meta.id] || null;
                      return <FeedItem key={meta.id} feedMeta={meta} feedContent={content} mode="list" isSelected={selectedFeedMeta?.id === meta.id} isLoading={loadingFeedId === meta.id} onSelect={handleFeedSelect} />;
                    });
                  }
                  return renderCategoryNode(node);
                });
              })()
            )}
            {loading && <div className="flex justify-center p-8"><RefreshCw className="h-6 w-6 text-primary animate-spin" /></div>}
          </div>
        </ScrollArea>

        <div className="p-3 border-t bg-muted/20 flex gap-2">
          <Button variant="outline" className="flex-1 gap-2 font-bold text-xs uppercase tracking-wider" onClick={() => setShowSettings(true)}>
            <Settings className="w-4 h-4" />
            设置
          </Button>
          <Button variant="outline" size="icon" onClick={() => setDarkMode(!darkMode)} title={darkMode ? "切换到浅色模式" : "切换到深色模式"}>
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </aside>
    </>
  );
};