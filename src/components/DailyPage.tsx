"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import DateTabs from "./DateTabs";
import MarkdownRenderer from "./MarkdownRenderer";

interface DateInfo {
  date: string;
  label: string;
  weekday: string;
}

type DirectionLock = "undetermined" | "horizontal" | "vertical";

export default function DailyPage() {
  const [availableDates, setAvailableDates] = useState<DateInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [contentCache, setContentCache] = useState<Record<string, string>>({});
  const [loadingDates, setLoadingDates] = useState<Set<string>>(new Set());
  const [errorDates, setErrorDates] = useState<Record<string, string>>({});
  const [datesLoaded, setDatesLoaded] = useState<boolean>(false);

  // Swipe state
  const [translateX, setTranslateX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const dragStartX = useRef<number>(0);
  const dragStartY = useRef<number>(0);
  const dragDeltaX = useRef<number>(0);
  const directionLock = useRef<DirectionLock>("undetermined");
  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const slideWidth = useRef<number>(0);

  // Fetch available dates on mount
  useEffect(() => {
    fetchDates();
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
        setSelectedIndex(0);
        setDatesLoaded(true);
        // Load first date content immediately
        loadContent(dateInfos[0].date);
        // Pre-fetch next date for smoother swipe
        if (dateInfos.length > 1) {
          loadContent(dateInfos[1].date);
        }
      } else {
        setErrorDates({ "global": "暂无可用内容" });
        setDatesLoaded(true);
      }
    } catch {
      setErrorDates({ "global": "加载失败，请刷新重试" });
      setDatesLoaded(true);
    }
  };

  // Load content for a specific date (with caching)
  const loadContent = useCallback(async (date: string) => {
    // Skip if already cached or currently loading
    if (contentCache[date] || loadingDates.has(date)) return;

    setLoadingDates(prev => new Set([...prev, date]));
    try {
      const res = await fetch(`/api/content?date=${date}`);
      const data = await res.json();
      if (data.content) {
        setContentCache(prev => ({ ...prev, [date]: data.content }));
      } else {
        setErrorDates(prev => ({ ...prev, [date]: data.error || "该日期暂无内容" }));
      }
    } catch {
      setErrorDates(prev => ({ ...prev, [date]: "加载失败" }));
    } finally {
      setLoadingDates(prev => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
    }
  }, [contentCache, loadingDates]);

  // When selected index changes, load content + pre-fetch adjacent
  useEffect(() => {
    if (availableDates.length === 0) return;
    const current = availableDates[selectedIndex];
    if (!current) return;

    loadContent(current.date);

    // Pre-fetch adjacent dates
    if (selectedIndex > 0) {
      loadContent(availableDates[selectedIndex - 1].date);
    }
    if (selectedIndex < availableDates.length - 1) {
      loadContent(availableDates[selectedIndex + 1].date);
    }
  }, [selectedIndex, availableDates, loadContent]);

  // Calculate slide width from container
  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      slideWidth.current = containerRef.current!.offsetWidth;
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [datesLoaded]);

  // Update container height to match current slide's content
  const updateContainerHeight = useCallback(() => {
    const currentSlide = slideRefs.current.get(selectedIndex);
    if (currentSlide) {
      setContainerHeight(currentSlide.scrollHeight);
    }
  }, [selectedIndex]);

  // Update height whenever selectedIndex or content changes
  useLayoutEffect(() => {
    updateContainerHeight();
  }, [selectedIndex, contentCache, updateContainerHeight]);

  // Also update on resize
  useEffect(() => {
    const onResize = () => updateContainerHeight();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateContainerHeight]);

  // Navigate to a specific index (from tab click)
  const navigateTo = useCallback((index: number) => {
    setSelectedIndex(index);
    setTranslateX(0);
    setIsDragging(false);
    directionLock.current = "undetermined";
  }, []);

  // --- Drag / Swipe handlers with direction lock ---
  const handleDragStart = (clientX: number, clientY: number) => {
    dragStartX.current = clientX;
    dragStartY.current = clientY;
    dragDeltaX.current = 0;
    directionLock.current = "undetermined";
    setIsDragging(true);
    setTranslateX(0);
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;

    const deltaX = clientX - dragStartX.current;
    const deltaY = clientY - dragStartY.current;

    // Determine direction if still undetermined
    if (directionLock.current === "undetermined") {
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Only lock direction after moving at least 8px
      if (absDeltaX < 8 && absDeltaY < 8) return;

      if (absDeltaX > absDeltaY) {
        directionLock.current = "horizontal";
      } else {
        directionLock.current = "vertical";
      }
    }

    // If locked to vertical, don't handle horizontal swipe at all
    if (directionLock.current === "vertical") return;

    // Horizontal swipe handling
    dragDeltaX.current = deltaX;
    // Clamp: can't drag beyond first/last slide
    if (selectedIndex === 0 && deltaX > 0) {
      dragDeltaX.current = deltaX * 0.3; // rubber band effect
    }
    if (selectedIndex === availableDates.length - 1 && deltaX < 0) {
      dragDeltaX.current = deltaX * 0.3;
    }
    setTranslateX(dragDeltaX.current);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;

    // If direction was vertical, just clean up state, don't navigate
    if (directionLock.current === "vertical") {
      setIsDragging(false);
      directionLock.current = "undetermined";
      return;
    }

    setIsDragging(false);
    directionLock.current = "undetermined";

    const threshold = slideWidth.current * 0.15; // 15% of slide width
    if (dragDeltaX.current < -threshold && selectedIndex < availableDates.length - 1) {
      navigateTo(selectedIndex + 1);
    } else if (dragDeltaX.current > threshold && selectedIndex > 0) {
      navigateTo(selectedIndex - 1);
    } else {
      setTranslateX(0);
    }
  };

  // Touch events
  const onTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;

    // Determine direction first
    const deltaX = Math.abs(clientX - dragStartX.current);
    const deltaY = Math.abs(clientY - dragStartY.current);

    if (directionLock.current === "undetermined" && (deltaX > 8 || deltaY > 8)) {
      if (deltaX > deltaY) {
        directionLock.current = "horizontal";
      } else {
        directionLock.current = "vertical";
      }
    }

    // If horizontal, prevent default to stop vertical scroll
    if (directionLock.current === "horizontal") {
      e.preventDefault();
    }

    handleDragMove(clientX, clientY);
  };
  const onTouchEnd = () => {
    handleDragEnd();
  };

  // Mouse events (desktop only, no direction conflict)
  const onMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.clientX, e.clientY);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || directionLock.current === "vertical") return;
    // For mouse, we allow horizontal drag directly
    if (directionLock.current === "undetermined") {
      directionLock.current = "horizontal";
    }
    handleDragMove(e.clientX, e.clientY);
  };
  const onMouseUp = () => {
    handleDragEnd();
  };

  // Global error state
  const globalError = errorDates["global"];
  const selectedDate = availableDates[selectedIndex]?.date || "";

  // Carousel offset
  const carouselOffset = -(selectedIndex * slideWidth.current) + translateX;

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
            onSelect={(date) => {
              const idx = availableDates.findIndex(d => d.date === date);
              if (idx !== -1) navigateTo(idx);
            }}
          />
        </div>
      </div>

      {/* Carousel Content Area */}
      {!datesLoaded || globalError ? (
        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
          {!datesLoaded ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin mb-4" />
              <p className="text-sm text-gray-400">加载中...</p>
            </div>
          ) : (
            <div className="empty-state">
              <img src="/icon.webp" alt="" className="w-16 h-16 rounded-full opacity-30 mb-4" />
              <p className="text-gray-500 text-base">{globalError}</p>
              <p className="text-gray-400 text-sm mt-2">新内容每天更新，敬请期待</p>
            </div>
          )}
        </main>
      ) : (
        <main
          ref={containerRef}
          className="max-w-lg mx-auto w-full overflow-hidden select-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{
            height: containerHeight ? `${containerHeight}px` : undefined,
            minHeight: "200px",
            transition: isDragging ? "none" : "height 300ms cubic-bezier(0.25, 0.1, 0.25, 1)",
          }}
        >
          {/* Carousel track */}
          <div
            className="flex"
            style={{
              transform: `translateX(${carouselOffset}px)`,
              transitionDuration: isDragging ? "0ms" : "300ms",
              transitionProperty: "transform",
              transitionTimingFunction: "cubic-bezier(0.25, 0.1, 0.25, 1)",
            }}
          >
            {availableDates.map((dateInfo, index) => {
              const cachedContent = contentCache[dateInfo.date];
              const isLoading = loadingDates.has(dateInfo.date);
              const errorMsg = errorDates[dateInfo.date];

              return (
                <div
                  key={dateInfo.date}
                  ref={(el) => {
                    if (el) slideRefs.current.set(index, el);
                  }}
                  className="w-full flex-shrink-0 px-4 py-4"
                  style={{ width: slideWidth.current || '100%' }}
                >
                  {isLoading && !cachedContent ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="w-10 h-10 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin mb-4" />
                      <p className="text-sm text-gray-400">加载中...</p>
                    </div>
                  ) : errorMsg && !cachedContent ? (
                    <div className="empty-state">
                      <img src="/icon.webp" alt="" className="w-16 h-16 rounded-full opacity-30 mb-4" />
                      <p className="text-gray-500 text-base">{errorMsg}</p>
                      <p className="text-gray-400 text-sm mt-2">新内容每天更新，敬请期待</p>
                    </div>
                  ) : (
                    <article className="content-card">
                      {/* Date badge */}
                      <div className="bg-brand-500 text-white px-4 py-3 flex items-center justify-between">
                        <span className="font-medium">
                          {dateInfo.label}的为什么
                        </span>
                        <span className="text-sm opacity-80">
                          {dateInfo.weekday}
                        </span>
                      </div>
                      {/* Content */}
                      <div className="px-5 py-5 select-text overflow-y-auto">
                        {cachedContent ? (
                          <MarkdownRenderer content={cachedContent} />
                        ) : (
                          <p className="text-gray-400 text-center py-8">内容加载中...</p>
                        )}
                      </div>
                    </article>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-xs text-gray-400">
          内容每天更新 · 仅保留近7天 · 左右滑动切换 · 用好奇心点亮每一天
        </p>
      </footer>
    </div>
  );
}
