import React, { useState } from 'react';

interface CalendarWidgetProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date | null) => void;
}

type ViewMode = 'day' | 'month' | 'year';

const MONTHS = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月'
];

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({ selectedDate, onDateSelect }) => {
  const [viewDate, setViewDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('day');

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrev = () => {
    const newDate = new Date(viewDate);
    if (viewMode === 'day') newDate.setMonth(newDate.getMonth() - 1);
    else if (viewMode === 'month') newDate.setFullYear(newDate.getFullYear() - 1);
    else if (viewMode === 'year') newDate.setFullYear(newDate.getFullYear() - 10);
    setViewDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(viewDate);
    if (viewMode === 'day') newDate.setMonth(newDate.getMonth() + 1);
    else if (viewMode === 'month') newDate.setFullYear(newDate.getFullYear() + 1);
    else if (viewMode === 'year') newDate.setFullYear(newDate.getFullYear() + 10);
    setViewDate(newDate);
  };

  const handleHeaderClick = () => {
    if (viewMode === 'day') setViewMode('month');
    else if (viewMode === 'month') setViewMode('year');
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getDate() === d2.getDate() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getFullYear() === d2.getFullYear();
  };

  const renderDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    // Empty slots for prev month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-8"></div>);
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const currentDay = new Date(year, month, d);
      const isSelected = selectedDate && isSameDay(currentDay, selectedDate);
      const isToday = isSameDay(currentDay, new Date());

      days.push(
        <button
          key={d}
          onClick={() => onDateSelect(currentDay)}
          className={`
            h-8 w-8 rounded-full text-xs font-medium flex items-center justify-center transition-all
            ${isSelected 
              ? 'bg-organic-500 text-white shadow-soft-md scale-105' 
              : isToday 
                ? 'text-organic-600 font-bold bg-organic-50 border border-organic-200 dark:bg-stone-800/50 dark:border-stone-700 dark:text-stone-200' 
                : 'text-slate-700 hover:bg-organic-100/50 dark:text-slate-300 dark:hover:bg-slate-700'}
          `}
        >
          {d}
        </button>
      );
    }
    return days;
  };

  const renderMonths = () => {
    return MONTHS.map((m, index) => (
      <button
        key={m}
        onClick={() => {
          const newDate = new Date(viewDate);
          newDate.setMonth(index);
          setViewDate(newDate);
          setViewMode('day');
        }}
        className="p-2 text-sm text-slate-700 hover:bg-organic-100/50 rounded-lg dark:text-slate-300 dark:hover:bg-slate-700"
      >
        {m}
      </button>
    ));
  };

  const renderYears = () => {
    const startYear = Math.floor(viewDate.getFullYear() / 10) * 10;
    const years = [];
    for (let i = 0; i < 12; i++) {
      const y = startYear - 1 + i;
      years.push(
        <button
          key={y}
          onClick={() => {
            const newDate = new Date(viewDate);
            newDate.setFullYear(y);
            setViewDate(newDate);
            setViewMode('month');
          }}
          className={`p-2 text-sm rounded-lg ${y === viewDate.getFullYear() ? 'bg-organic-50 text-organic-600 font-bold dark:bg-stone-800/50 dark:text-stone-200' : 'text-slate-700 hover:bg-organic-100/50 dark:text-slate-300 dark:hover:bg-slate-700'}`}
        >
          {y}
        </button>
      );
    }
    return years;
  };

  return (
    <div className="glass-panel backdrop-blur-md bg-white/80 rounded-organic-lg border border-white/50 p-4 select-none dark:bg-slate-800/80 dark:border-slate-700 shadow-soft-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={handlePrev} className="p-1 hover:bg-organic-100/50 rounded-full text-slate-400 hover:text-organic-600 transition-colors dark:hover:bg-slate-700 dark:hover:text-slate-300">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={handleHeaderClick} className="text-sm font-bold text-slate-800 hover:text-organic-600 transition-colors dark:text-slate-100 dark:hover:text-organic-300">
          {viewMode === 'day' && `${viewDate.getFullYear()}年 ${MONTHS[viewDate.getMonth()]}`}
          {viewMode === 'month' && `${viewDate.getFullYear()}`}
          {viewMode === 'year' && `${Math.floor(viewDate.getFullYear() / 10) * 10} - ${Math.floor(viewDate.getFullYear() / 10) * 10 + 9}`}
        </button>
        <button onClick={handleNext} className="p-1 hover:bg-organic-100/50 rounded-full text-slate-400 hover:text-organic-600 transition-colors dark:hover:bg-slate-700 dark:hover:text-slate-300">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* Grid */}
      <div className="min-h-[200px]">
        {viewMode === 'day' && (
          <>
            <div className="grid grid-cols-7 mb-2">
              {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                <div key={d} className="text-center text-[10px] text-slate-400 font-bold dark:text-slate-500 uppercase tracking-tighter">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1 justify-items-center">
              {renderDays()}
            </div>
          </>
        )}
        {viewMode === 'month' && (
          <div className="grid grid-cols-3 gap-2">
            {renderMonths()}
          </div>
        )}
        {viewMode === 'year' && (
          <div className="grid grid-cols-3 gap-2">
            {renderYears()}
          </div>
        )}
      </div>
      
      {selectedDate && (
        <button 
          onClick={() => onDateSelect(null)} 
          className="w-full mt-3 text-xs text-slate-400 hover:text-organic-600 py-1 border-t border-slate-100 dark:border-slate-700 transition-colors"
        >
          清除选择
        </button>
      )}
    </div>
  );
};
