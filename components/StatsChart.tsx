import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Feed } from '../types';

interface StatsChartProps {
  feeds: Feed[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const StatsChart: React.FC<StatsChartProps> = ({ feeds }) => {
  const data = feeds.map((feed) => ({
    name: feed.title.length > 15 ? feed.title.substring(0, 15) + '...' : feed.title,
    count: feed.items.length,
    fullTitle: feed.title
  }));

  if (data.length === 0) return null;

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-64 flex flex-col dark:bg-slate-800 dark:border-slate-700">
      <h3 className="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider dark:text-slate-400">订阅源活跃度</h3>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 12, fill: '#64748b' }} 
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              hide 
            />
            <Tooltip 
              cursor={{ fill: '#f1f5f9' }}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
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