import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Feed } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

interface StatsChartProps {
  feeds: Feed[];
  isDarkMode: boolean;
}

// 使用 shadcn/ui 风格的配色方案
const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--primary) / 0.8)',
  'hsl(var(--primary) / 0.6)',
  'hsl(var(--primary) / 0.4)',
  'hsl(var(--primary) / 0.2)',
];

export const StatsChart: React.FC<StatsChartProps> = React.memo(({ feeds, isDarkMode }) => {
  const data = useMemo(() => feeds.map((feed) => ({
    name: feed.title.length > 15 ? feed.title.substring(0, 15) + '...' : feed.title,
    count: feed.items.length,
    fullTitle: feed.title
  })), [feeds]);

  if (data.length === 0) return null;

  return (
    <Card className="h-64 flex flex-col overflow-hidden border-none shadow-none bg-transparent">
      <CardHeader className="p-0 pb-4 space-y-0 flex flex-row items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
          订阅源活跃度
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 500 }} 
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis 
              hide 
            />
            <Tooltip 
              cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
              contentStyle={{ 
                borderRadius: 'var(--radius)', 
                border: '1px solid hsl(var(--border))', 
                boxShadow: 'var(--shadow-md)',
                backgroundColor: 'hsl(var(--popover))',
                color: 'hsl(var(--popover-foreground))',
                padding: '12px',
                fontSize: '12px'
              }}
              labelStyle={{ fontWeight: 700, marginBottom: '4px' }}
              itemStyle={{ color: 'hsl(var(--primary))', fontWeight: 600 }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={32}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
});
