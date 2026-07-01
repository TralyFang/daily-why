"use client";

import MarkdownRenderer from "./MarkdownRenderer";
import ExtraContent from "./ExtraContent";
import type { DateInfo } from "../hooks/useContentLoader";

export interface ContentSlideProps {
  dateInfo: DateInfo;
  content: string | undefined;
  isLoading: boolean;
  error: string | undefined;
  isExplore: boolean;
  isToday: boolean;
  index: number;
  totalDates: number;
  translateX: number;
  isDragging: boolean;
  canSwipeLeft: boolean;
  slideWidth: number;
}

export default function ContentSlide({
  dateInfo,
  content,
  isLoading,
  error,
  isExplore,
  isToday,
  index,
  totalDates,
  translateX,
  isDragging,
  canSwipeLeft,
  slideWidth,
}: ContentSlideProps) {
  if (isLoading && !content) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin mb-4" />
        <p className="text-sm text-gray-400">加载中...</p>
      </div>
    );
  }

  if (error && !content) {
    return (
      <div className="empty-state">
        <img src="/icon.webp" alt="" className="w-16 h-16 rounded-full opacity-30 mb-4" />
        <p className="text-gray-500 text-base">{error}</p>
      </div>
    );
  }

  return (
    <div className={`content-card ${isExplore ? "explore-card" : ""}`}>
      {/* Date badge */}
      <div className={`px-4 py-3 flex items-center justify-between ${
        isExplore
          ? "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-900"
          : "bg-brand-500 text-white"
      }`}>
        <span className="font-medium">
          {dateInfo.label}的为什么
        </span>
        <span className="text-sm opacity-80">
          {dateInfo.weekday}
        </span>
      </div>

      {/* Content */}
      <div className="px-5 py-5 select-text overflow-y-auto">
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <p className="text-gray-400 text-center py-8">内容加载中...</p>
        )}
      </div>

      {/* Explore hint — only on 前天 card (index 2), positioned at left edge */}
      {index === 2 && totalDates > 3 && (
        <div
          className="absolute left-0 top-0 bottom-0 flex items-center justify-center pointer-events-none select-none"
          style={{
            width: '48px',
            transform: `translateX(${Math.min(0, -60 + Math.max(0, -translateX / 3))}px)`,
            opacity: canSwipeLeft ? Math.min(1, (-translateX) / 60) : 0.6,
            transition: isDragging ? "none" : "opacity 300ms ease, transform 300ms ease",
          }}
        >
          <div
            className="text-xs text-amber-600/70 font-medium whitespace-nowrap"
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
            }}
          >
            ← 探索更早的历史
          </div>
        </div>
      )}

      {/* "再来一个" — only on today (index 0) */}
      {isToday && (
        <ExtraContent todayDate={dateInfo.date} />
      )}
    </div>
  );
}
