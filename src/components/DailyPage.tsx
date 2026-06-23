"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import DateTabs from "./DateTabs";
import MarkdownRenderer from "./MarkdownRenderer";

interface DateInfo {
  date: string;
  label: string;
  weekday: string;
}

export default function DailyPage() {
  const [availableDates, setAvailableDates] = useState<DateInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [swipeHint, setSwipeHint] = useState<boolean>(false);

  // Touch swipe refs
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isSwiping = useRef<boolean>(false);

  // Fetch available dates on mount
  useEffect(() => {
    fetchDates();
    // Show swipe hint once after first load
    const timer = setTimeout(() => setSwipeHint(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const fetchDates = async () => {
    try {
      const res = await fetch("/api/content");
      const data = await res.json();
      if (data.availableDates && data.availableDates.length > 0) {
        const dateInfos: DateInfo[] = data.availableDates.map((date: string) => {
          const [y, m, dNum] = date.split("-").map(Number);
          const todayDate = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
          const targetDate = new Date(y, m - 1, dNum);
          const dayDiff = Math.round((todayDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
          let label = "";
          switch (dayDiff) {
            case 0: label = "今天"; break;
            case 1: label = "昨天"; break;
            case 2: label = "前天"; break;
            default: label = `${dayDiff}天前`; break;
          }
          const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
          return { date, label, weekday: weekdays[targetDate.getDay()] };
        });
        setAvailableDates(dateInfos);
        setSelectedDate(data.availableDates[0]);
      } else {
        setError("暂无可用内容");
        setLoading(false);
      }
    } catch {
      setError("加载失败，请刷新重试");
      setLoading(false);
    }
  };

  // Fetch content when date changes
  const fetchContent = useCallback(async (date: string) => {
    if (!date) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/content?date=${date}`);
      const data = await res.json();
      if (data.content) {
        setContent(data.content);
      } else {
        setContent("");
        setError(data.error || "该日期暂无内容");
      }
    } catch {
      setError("加载失败，请刷新重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchContent(selectedDate);
    }
  }, [selectedDate, fetchContent]);

  // Navigate to adjacent date
  const navigateDate = useCallback((direction: number) => {
    const currentIndex = availableDates.findIndex(d => d.date === selectedDate);
    if (currentIndex === -1) return;
    const newIndex = currentIndex + direction; // +1 = left swipe (older), -1 = right swipe (newer)
    if (newIndex >= 0 && newIndex < availableDates.length) {
      setSelectedDate(availableDates[newIndex].date);
    }
  }, [availableDates, selectedDate]);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping.current) return;
    // Prevent page scroll while swiping horizontally
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isSwiping.current) return;
    isSwiping.current = false;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY.current);

    // Only trigger if horizontal movement > vertical and exceeds threshold
    if (Math.abs(deltaX) > deltaY && Math.abs(deltaX) > 50) {
      if (deltaX < 0) {
        // Swipe left → older date
        navigateDate(1);
      } else {
        // Swipe right → newer date
        navigateDate(-1);
      }
    }

    // Hide hint after first interaction
    setSwipeHint(false);
  };

  // Mouse handlers for desktop drag support
  const mouseDownX = useRef(0);
  const mouseDragging = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownX.current = e.clientX;
    mouseDragging.current = true;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!mouseDragging.current) return;
    mouseDragging.current = false;

    const deltaX = e.clientX - mouseDownX.current;
    if (Math.abs(deltaX) > 50) {
      if (deltaX < 0) navigateDate(1);
      else navigateDate(-1);
    }
    setSwipeHint(false);
  };

  const handleMouseLeave = () => {
    mouseDragging.current = false;
  };

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-b from-brand-50 via-white to-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/80 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/icon.webp"
              alt="每日一个为什么"
              className="w-8 h-8 rounded-lg shadow-sm object-cover"
            />
            <h1 className="text-lg font-semibold text-gray-900 tracking-tight">
              每日一个为什么
            </h1>
          </div>
          <div className="text-xs text-gray-400">
            {new Date().toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
            })}
          </div>
        </div>
      </header>

      {/* Date Tabs */}
      <div className="sticky top-[52px] z-10 backdrop-blur-md bg-white/60 border-b border-gray-50">
        <div className="max-w-lg mx-auto px-4 py-3">
          <DateTabs
            dates={availableDates}
            selectedDate={selectedDate}
            onSelect={(date) => { setSelectedDate(date); setSwipeHint(false); }}
          />
        </div>
      </div>

      {/* Content Area - swipeable */}
      <main
        className={`flex-1 max-w-lg mx-auto w-full px-4 py-6 select-none ${swipeHint ? 'swipe-hint' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin mb-4" />
            <p className="text-sm text-gray-400">加载中...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <img src="/icon.webp" alt="" className="w-16 h-16 rounded-full opacity-30 mb-4" />
            <p className="text-gray-500 text-base">{error}</p>
            <p className="text-gray-400 text-sm mt-2">新内容每天更新，敬请期待</p>
          </div>
        ) : (
          <article className="content-card">
            {/* Date badge */}
            <div className="bg-brand-500 text-white px-4 py-3 flex items-center justify-between">
              <span className="font-medium">
                {availableDates.find((d) => d.date === selectedDate)?.label}的为什么
              </span>
              <span className="text-sm opacity-80">
                {availableDates.find((d) => d.date === selectedDate)?.weekday}
              </span>
            </div>
            {/* Content */}
            <div className="px-5 py-5 select-text">
              <MarkdownRenderer content={content} />
            </div>
            {/* Swipe indicator */}
            {swipeHint && !loading && (
              <div className="flex items-center justify-center gap-4 py-2 text-xs text-gray-300">
                <span>← 右滑前一天</span>
                <span>左滑后一天 →</span>
              </div>
            )}
          </article>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-xs text-gray-400">
          内容每天更新 · 仅保留近7天 · 左右滑动切换 · 用好奇心点亮每一天
        </p>
      </footer>
    </div>
  );
}
