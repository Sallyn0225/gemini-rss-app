import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Feed } from '../types';

interface StatsChartProps {
  feeds: Feed[];
  isDarkMode: boolean;
}

// Organic Palette: #c69a72 (500), #b88057 (600), #d4b693 (400), #E0D4FC (soft-purple), #FCE4EC (soft-pink)
const COLORS = ['#c69a72', '#b88057', '#d4b693', '#E0D4FC', '#FCE4EC', '#996646', '#e3d2b8'];

export const StatsChart: React.FC<StatsChartProps> = ({ feeds, isDarkMode }) => {
  const data = feeds.map((feed) => ({
    name: feed.title.length > 15 ? feed.title.substring(0, 15) + '...' : feed.title,
    count: feed.items.length,
    fullTitle: feed.title
  }));

  if (data.length === 0) return null;

  return (
    <div className="glass-panel backdrop-blur-md bg-white/80 p-4 rounded-organic-lg border border-white/50 h-64 flex flex-col dark:bg-slate-800/80 dark:border-slate-700 shadow-soft-lg">
      <h3 className="text-[10px] font-bold text-organic-800/60 mb-4 uppercase tracking-[0.2em] dark:text-organic-300/60">订阅源活跃度</h3>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 10, fill: isDarkMode ? '#e2e8f0' : '#64748b', fontWeight: 500 }} 
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis 
              hide 
            />
            <Tooltip 
              cursor={{ fill: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(198,154,114,0.05)' }}
              contentStyle={{ 
                borderRadius: '16px', 
                border: 'none', 
                boxShadow: '0 10px 20px -5px rgba(0,0,0,0.03)',
                backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(8px)',
                padding: '12px',
                fontSize: '12px'
              }}
              labelStyle={{ color: isDarkMode ? '#f1f5f9' : '#1e293b', fontWeight: 700, marginBottom: '4px' }}
              itemStyle={{ color: '#c69a72', fontWeight: 600 }}
            />
            <Bar dataKey="count" radius={[8, 8, 4, 4]} barSize={32}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
