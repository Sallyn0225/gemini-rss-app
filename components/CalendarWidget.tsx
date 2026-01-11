import React from 'react';
import { Calendar as CalendarIcon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { zhCN } from "date-fns/locale";

interface CalendarWidgetProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date | null) => void;
  articleCountByDate?: Record<string, number> | null;
}

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({ selectedDate, onDateSelect, articleCountByDate }) => {
  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <CalendarIcon className="w-3.5 h-3.5 text-primary" />
          <span>按日期筛选</span>
        </div>
        {selectedDate && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDateSelect(null)}
            title="清除选择"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <div className="p-1 flex justify-center">
        <Calendar
          mode="single"
          selected={selectedDate || undefined}
          onSelect={(date) => onDateSelect(date || null)}
          locale={zhCN}
          className="rounded-md border-none"
          articleCountByDate={articleCountByDate}
        />
      </div>
    </div>
  );
};
