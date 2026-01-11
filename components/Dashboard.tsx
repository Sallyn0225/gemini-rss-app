import React from 'react';
import { Newspaper, Rss, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { StatsChart } from './StatsChart';
import { Feed } from '../types';

interface DashboardProps {
  feeds: Feed[];
  darkMode: boolean;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  onBackToDashboard: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  feeds, 
  darkMode, 
  isSidebarOpen, 
  setIsSidebarOpen,
  onBackToDashboard
}) => {
  return (
    <ScrollArea className="h-full bg-muted/10">
      <div className="max-w-5xl mx-auto p-6 md:p-12 space-y-10">
        <header className="flex items-center gap-4">
          {!isSidebarOpen && (
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)} className="shrink-0">
              <PanelLeft className="w-6 h-6" />
            </Button>
          )}
          <div onClick={onBackToDashboard} className="cursor-pointer">
            <h2 className="text-4xl font-black tracking-tight">仪表盘</h2>
            <p className="text-muted-foreground font-bold uppercase text-[10px] tracking-[0.2em]">资讯生态概览</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-primary/5 border-primary/10">
            <CardContent className="p-6 flex items-center gap-6">
              <div className="bg-primary text-primary-foreground p-4 rounded-2xl shadow-lg shadow-primary/20">
                <Newspaper className="w-8 h-8" />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">文章总数</p>
                <h3 className="text-3xl font-black">{feeds.reduce((acc, f) => acc + f.items.length, 0)}</h3>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-secondary/5 border-secondary/10">
            <CardContent className="p-6 flex items-center gap-6">
              <div className="bg-secondary text-secondary-foreground p-4 rounded-2xl shadow-lg shadow-secondary/20">
                <Rss className="w-8 h-8" />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">活跃订阅源</p>
                <h3 className="text-3xl font-black">{feeds.length}</h3>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="p-6">
          <StatsChart feeds={feeds} isDarkMode={darkMode} />
        </Card>
      </div>
    </ScrollArea>
  );
};