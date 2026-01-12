import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Article } from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 合并并去重文章列表
 * 新内容优先（RSS 返回的可能有更新的字段）
 * 按发布时间降序排列
 */
export const mergeAndDedupeArticles = (
  newItems: Article[], 
  historyItems: Article[]
): Article[] => {
  const seen = new Set<string>();
  const result: Article[] = [];
  
  // 新内容优先
  for (const item of [...newItems, ...historyItems]) {
    const key = item.guid || item.link || `${item.title || ''}-${item.pubDate || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  
  // 按发布时间降序排列
  return result.sort((a, b) => {
    const bTime = Date.parse(b.pubDate);
    const aTime = Date.parse(a.pubDate);
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
};