"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import DateTabs from "./DateTabs";
import PullToRefresh from "./PullToRefresh";
import ReminderSettings from "./ReminderSettings";
import SettingsPanel from "./SettingsPanel";
import ContentSlide from "./ContentSlide";
import { useContentLoader } from "../hooks/useContentLoader";
import { useSwipeGesture } from "../hooks/useSwipeGesture";

function getMonthDay(dateStr: string): { month: number; day: number } {
  const [, m, d] = dateStr.split("-").map(Number);
  return { month: m, day: d };
}

export default function DailyPage() {
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Extra content state clearing callback (for refresh/clear cache)
  const extraClearRef = useRef<() => void>(() => {});
  const onClearExtraState = useCallback(() => {
    extraClearRef.current();
  }, []);

  // Content loader hook
  const {
    availableDates,
    contentCache,
    loadingDates,
    errorDates,
    datesLoaded,
    handleRefresh,
    handleClearCache,
    clearingCache,
  } = useContentLoader(currentIndex, setCurrentIndex, onClearExtraState);

  // Derived
  const maxIndex = availableDates.length - 1;
  const isExploreMode = currentIndex > 2;
  const exploreLayer = isExploreMode ? currentIndex - 2 : 0;
  const mainDates = availableDates.slice(0, 3);
  const currentDateInfo = availableDates[currentIndex];
  const selectedDate = currentDateInfo?.date || "";

  // Swipe gesture hook
  const {
    translateX,
    isDragging,
    containerRef,
    slideWidth,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    onMouseMove,
    onMouseUp,
  } = useSwipeGesture({
    currentIndex,
    maxIndex,
    onNavigate: setCurrentIndex,
  });

  // Container height for smooth transitions
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const slideRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const updateContainerHeight = useCallback(() => {
    const currentSlide = slideRefs.current.get(currentIndex);
    if (currentSlide) {
      const height = currentSlide.offsetHeight;
      setContainerHeight(height);
    }
  }, [currentIndex]);

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => updateContainerHeight());
    return () => cancelAnimationFrame(raf);
  }, [currentIndex, contentCache, updateContainerHeight]);

  useEffect(() => {
    const onResize = () => updateContainerHeight();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateContainerHeight]);

  // Header hide/show on scroll
  const [headerVisible, setHeaderVisible] = useState<boolean>(true);
  const lastScrollY = useRef<number>(0);
  const headerHeight = 104;

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;

      if (delta > 10 && currentY > headerHeight) {
        setHeaderVisible(false);
      } else if (delta < -5) {
        setHeaderVisible(true);
      }

      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Settings panel
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const handleClearCacheAndClose = useCallback(async () => {
    await handleClearCache();
    setShowSettings(false);
  }, [handleClearCache]);

  // Check if content at top for pull-to-refresh
  const isContentAtTop = useCallback(() => {
    const currentSlide = slideRefs.current.get(currentIndex);
    if (!currentSlide) return true;
    const scrollable = currentSlide.querySelector('.overflow-y-auto');
    if (!scrollable) return true;
    return scrollable.scrollTop <= 1;
  }, [currentIndex]);

  // Tab click
  const handleTabSelect = (date: string) => {
    const idx = availableDates.findIndex(d => d.date === date);
    if (idx !== -1) setCurrentIndex(idx);
  };

  // Explore indicator
  let exploreIndicator: React.ReactNode = null;
  if (isExploreMode && currentDateInfo) {
    const { month, day } = getMonthDay(currentDateInfo.date);
    if (currentIndex === maxIndex) {
      exploreIndicator = (
        <div className="text-center py-2">
          <span className="text-xs text-gray-400">已抵达时间深处 🏁</span>
        </div>
      );
    } else {
      exploreIndicator = (
        <div className="text-center py-2">
          <span className="text-xs text-amber-600 font-medium">
            🕰️ 第{exploreLayer}层 · {month}月{day}日
          </span>
        </div>
      );
    }
  }

  // Carousel offset
  const carouselOffset = -(currentIndex * (slideWidth.current || 0)) + translateX;

  // Guards
  const globalError = errorDates["global"];
  const canSwipeLeft = currentIndex < maxIndex;

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-b from-brand-50 via-white to-gray-50">
      {/* Pull-to-refresh for PWA standalone mode */}
      <PullToRefresh onRefresh={handleRefresh} isContentAtTop={isContentAtTop} />

      {/* Header + Tabs wrapper */}
      <div
        className="sticky top-0 z-10 transition-transform duration-300 ease-in-out"
        style={{ transform: headerVisible ? "translateY(0)" : "translateY(-100%)" }}
      >
        <header className="backdrop-blur-md bg-white/80 border-b border-gray-100" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="w-8 h-8 rounded-lg shadow-sm overflow-hidden active:scale-95 transition-transform"
                aria-label="打开设置"
              >
                <img
                  src="/icon.webp"
                  alt="每日一个为什么"
                  className="w-full h-full object-cover"
                />
              </button>
              <h1 className="text-lg font-semibold text-gray-900 tracking-tight">
                每日一个为什么
              </h1>
            </div>
            <div className="text-xs text-gray-400 flex items-center gap-2">
              <ReminderSettings />
              {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}
            </div>
          </div>
        </header>

        {/* Date Tabs — only first 3 dates */}
        <div className="backdrop-blur-md bg-white/60 border-b border-gray-50">
          <div className="max-w-lg mx-auto px-4 py-3">
            <DateTabs
              dates={mainDates}
              selectedDate={isExploreMode ? "" : selectedDate}
              onSelect={handleTabSelect}
            />
          </div>
        </div>
      </div>

      {/* Explore indicator */}
      {exploreIndicator}

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
          className="max-w-lg mx-auto w-full overflow-hidden select-none relative"
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
            className="flex items-start"
            style={{
              transform: `translateX(${carouselOffset}px)`,
              transitionDuration: isDragging ? "0ms" : "300ms",
              transitionProperty: "transform",
              transitionTimingFunction: "cubic-bezier(0.25, 0.1, 0.25, 1)",
            }}
          >
            {availableDates.map((dateInfo, index) => (
              <div
                key={dateInfo.date}
                ref={(el) => {
                  if (el) slideRefs.current.set(index, el);
                }}
                className="w-full flex-shrink-0 px-4 py-4 relative"
                style={{ width: slideWidth.current || '100%' }}
              >
                <ContentSlide
                  dateInfo={dateInfo}
                  content={contentCache[dateInfo.date]}
                  isLoading={loadingDates.has(dateInfo.date)}
                  error={errorDates[dateInfo.date]}
                  isExplore={index > 2}
                  isToday={index === 0}
                  index={index}
                  totalDates={availableDates.length}
                  translateX={translateX}
                  isDragging={isDragging}
                  canSwipeLeft={canSwipeLeft}
                  slideWidth={slideWidth.current || 0}
                />
              </div>
            ))}
          </div>
        </main>
      )}

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-xs text-gray-400">
          内容每天更新 · 仅保留近7天 · 左右滑动切换 · 用好奇心点亮每一天
        </p>
      </footer>

      {/* Settings Panel */}
      <SettingsPanel
        showSettings={showSettings}
        clearingCache={clearingCache}
        handleClearCache={handleClearCacheAndClose}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
