"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import DateTabs from "./DateTabs";
import MarkdownRenderer from "./MarkdownRenderer";
import PullToRefresh from "./PullToRefresh";
import ReminderSettings from "./ReminderSettings";

interface DateInfo {
  date: string;
  label: string;
  weekday: string;
}

interface ChanceState {
  date: string;
  used: number;
}

type DirectionLock = "undetermined" | "horizontal" | "vertical";

const MAX_CHANCES = 3;
const CHANCE_STORAGE_KEY = "daily-why-chances";

function getMonthDay(dateStr: string): { month: number; day: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { month: m, day: d };
}

function getChanceState(): ChanceState {
  if (typeof window === "undefined") return { date: "", used: 0 };
  try {
    const raw = localStorage.getItem(CHANCE_STORAGE_KEY);
    if (raw) {
      const state: ChanceState = JSON.parse(raw);
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      if (state.date === todayStr) return state;
    }
  } catch {}
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return { date: todayStr, used: 0 };
}

function saveChanceState(state: ChanceState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHANCE_STORAGE_KEY, JSON.stringify(state));
}

function getSecondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}小时${m}分${s}秒`;
}

export default function DailyPage() {
  const [availableDates, setAvailableDates] = useState<DateInfo[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [contentCache, setContentCache] = useState<Record<string, string>>({});
  const [loadingDates, setLoadingDates] = useState<Set<string>>(new Set());
  const [errorDates, setErrorDates] = useState<Record<string, string>>({});
  const [datesLoaded, setDatesLoaded] = useState<boolean>(false);

  // swipe state
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

  // "再来一个" state
  const [chanceState, setChanceState] = useState<ChanceState>({ date: "", used: 0 });
  const [extraContent, setExtraContent] = useState<string | null>(null);
  const [extraLoading, setExtraLoading] = useState<boolean>(false);
  const [extraError, setExtraError] = useState<string | null>(null);
  const [showExtraCard, setShowExtraCard] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(getSecondsUntilMidnight());

  // derived
  const isExploreMode = currentIndex > 2;
  const exploreLayer = isExploreMode ? currentIndex - 2 : 0;
  const maxIndex = availableDates.length - 1;
  const canSwipeLeft = currentIndex < maxIndex;
  const canSwipeRight = currentIndex > 0;
  const mainDates = availableDates.slice(0, 3);
  const currentDateInfo = availableDates[currentIndex];
  const showExploreHint = availableDates.length > 3 && currentIndex === 2;

  // init chance state
  useEffect(() => {
    setChanceState(getChanceState());
  }, []);

  // countdown timer
  useEffect(() => {
    if (chanceState.used >= MAX_CHANCES) {
      const timer = setInterval(() => {
        setCountdown(getSecondsUntilMidnight());
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [chanceState.used]);

  // fetch available dates
  const fetchDates = useCallback(async () => {
    try {
      // Add today's date as cache-buster to bypass stale SW cache on new day
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const res = await fetch(`/api/content?_d=${todayStr}`);
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
            default: label = `${dayDiff}天前`;
          }
          const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
          return { date, label, weekday: weekdays[targetDate.getDay()] };
        });
        setAvailableDates(dateInfos);
        setCurrentIndex(0);
        setDatesLoaded(true);
        loadContent(dateInfos[0].date);
        if (dateInfos.length > 1) loadContent(dateInfos[1].date);
      } else {
        setErrorDates({ "global": "暂无可用内容" });
        setDatesLoaded(true);
      }
    } catch {
      setErrorDates({ "global": "加载失败，请刷新重试" });
      setDatesLoaded(true);
    }
  }, []);

  // refresh handler for PullToRefresh: clear cache + reload
  const handleRefresh = useCallback(async () => {
    setContentCache({});
    setErrorDates({});
    setLoadingDates(new Set());
    setDatesLoaded(false);
    setExtraContent(null);
    setShowExtraCard(false);
    setExtraError(null);
    setChanceState(getChanceState());
    await fetchDates();
  }, [fetchDates]);

  useEffect(() => {
    fetchDates();
  }, []);

  // Listen for Service Worker CONTENT_UPDATED message
  // When SW detects the API response has changed, silently refresh content
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "CONTENT_UPDATED") {
        // Only refresh the date list (no date param), individual dates will follow
        const isDateListUpdate = !event.data.url.includes("date=");
        if (isDateListUpdate) {
          handleRefresh();
        }
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [handleRefresh]);

  // load content (with cache)
  const loadContent = useCallback(async (date: string) => {
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

  // when currentIndex changes, load content + prefetch adjacent
  useEffect(() => {
    if (!currentDateInfo) return;
    loadContent(currentDateInfo.date);
    if (currentIndex > 0) loadContent(availableDates[currentIndex - 1].date);
    if (currentIndex < availableDates.length - 1) loadContent(availableDates[currentIndex + 1].date);
  }, [currentIndex, availableDates, loadContent]);

  // check if current card's content area is scrolled to top (for pull-to-refresh)
  const isContentAtTop = useCallback(() => {
    const currentSlide = slideRefs.current.get(currentIndex);
    if (!currentSlide) return true;
    const scrollable = currentSlide.querySelector('.overflow-y-auto');
    if (!scrollable) return true;
    return scrollable.scrollTop <= 1;
  }, [currentIndex]);

  // container height
  const updateContainerHeight = useCallback(() => {
    const currentSlide = slideRefs.current.get(currentIndex);
    if (currentSlide) {
      setContainerHeight(currentSlide.scrollHeight);
    }
  }, [currentIndex]);

  useLayoutEffect(() => {
    updateContainerHeight();
  }, [currentIndex, contentCache, showExtraCard, updateContainerHeight]);

  useEffect(() => {
    const onResize = () => updateContainerHeight();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateContainerHeight]);

  // slide width
  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      slideWidth.current = containerRef.current!.offsetWidth;
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [datesLoaded]);

  // navigate
  const navigateTo = useCallback((index: number) => {
    setCurrentIndex(index);
    setTranslateX(0);
    setIsDragging(false);
    directionLock.current = "undetermined";
  }, []);

  // "再来一个" handler
  const handleExtraClick = async () => {
    if (chanceState.used >= MAX_CHANCES) return;
    if (extraLoading) return;
    setShowExtraCard(false);
    setExtraContent(null);
    setExtraError(null);
    const nextSlot = chanceState.used + 1;
    const todayDate = availableDates[0]?.date || chanceState.date;
    const extraKey = `${todayDate}-extra-${nextSlot}`;
    setExtraLoading(true);
    try {
      const res = await fetch(`/api/content?date=${extraKey}`);
      const data = await res.json();
      if (data.content) {
        setExtraContent(data.content);
        setShowExtraCard(true);
        const newState = { date: chanceState.date, used: nextSlot };
        setChanceState(newState);
        saveChanceState(newState);
      } else {
        setExtraError(data.error || "暂无更多内容");
      }
    } catch {
      setExtraError("加载失败，请重试");
    } finally {
      setExtraLoading(false);
    }
  };

  const dismissExtra = () => {
    setShowExtraCard(false);
  };

  // swipe handlers
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

    if (directionLock.current === "undetermined") {
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      if (absDeltaX < 8 && absDeltaY < 8) return;
      if (absDeltaX > absDeltaY) {
        directionLock.current = "horizontal";
      } else {
        directionLock.current = "vertical";
      }
    }

    if (directionLock.current === "vertical") return;

    dragDeltaX.current = deltaX;
    // rubber-band at edges
    if (currentIndex === 0 && deltaX > 0) {
      dragDeltaX.current = deltaX * 0.3;
    }
    if (currentIndex === maxIndex && deltaX < 0) {
      dragDeltaX.current = deltaX * 0.3;
    }
    setTranslateX(dragDeltaX.current);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    if (directionLock.current === "vertical") {
      setIsDragging(false);
      directionLock.current = "undetermined";
      return;
    }
    setIsDragging(false);
    directionLock.current = "undetermined";

    const threshold = slideWidth.current * 0.15;
    if (dragDeltaX.current < -threshold && canSwipeLeft) {
      navigateTo(currentIndex + 1);
    } else if (dragDeltaX.current > threshold && canSwipeRight) {
      navigateTo(currentIndex - 1);
    } else {
      setTranslateX(0);
    }
  };

  // touch events
  const onTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;
    const deltaX = Math.abs(clientX - dragStartX.current);
    const deltaY = Math.abs(clientY - dragStartY.current);
    if (directionLock.current === "undetermined" && (deltaX > 8 || deltaY > 8)) {
      if (deltaX > deltaY) {
        directionLock.current = "horizontal";
      } else {
        directionLock.current = "vertical";
      }
    }
    if (directionLock.current === "horizontal") {
      e.preventDefault();
    }
    handleDragMove(clientX, clientY);
  };
  const onTouchEnd = () => { handleDragEnd(); };

  // mouse events
  const onMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.clientX, e.clientY);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || directionLock.current === "vertical") return;
    if (directionLock.current === "undetermined") {
      directionLock.current = "horizontal";
    }
    handleDragMove(e.clientX, e.clientY);
  };
  const onMouseUp = () => { handleDragEnd(); };

  // tab click — always exits explore mode
  const handleTabSelect = (date: string) => {
    const idx = availableDates.findIndex(d => d.date === date);
    if (idx !== -1) navigateTo(idx);
  };

  // explore indicator
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

  // carousel offset
  const carouselOffset = -(currentIndex * (slideWidth.current || 0)) + translateX;

  // guards
  const globalError = errorDates["global"];
  const selectedDate = currentDateInfo?.date || "";
  const isToday = currentIndex === 0;
  const remaining = MAX_CHANCES - chanceState.used;

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-b from-brand-50 via-white to-gray-50">
      {/* Pull-to-refresh for PWA standalone mode */}
      <PullToRefresh onRefresh={handleRefresh} isContentAtTop={isContentAtTop} />

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
          <div className="text-xs text-gray-400 flex items-center gap-2">
            <ReminderSettings />
            {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}
          </div>
        </div>
      </header>

      {/* Date Tabs — only first 3 dates */}
      <div className="sticky top-[52px] z-10 backdrop-blur-md bg-white/60 border-b border-gray-50">
        <div className="max-w-lg mx-auto px-4 py-3">
          <DateTabs
            dates={mainDates}
            selectedDate={isExploreMode ? "" : selectedDate}
            onSelect={handleTabSelect}
          />
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
              const isCurrentExplore = index > 2;

              return (
                <div
                  key={dateInfo.date}
                  ref={(el) => {
                    if (el) slideRefs.current.set(index, el);
                  }}
                  className="w-full flex-shrink-0 px-4 py-4 relative"
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
                    </div>
                  ) : (
                    <div className={`content-card ${isCurrentExplore ? "explore-card" : ""}`}>
                      {/* Date badge */}
                      <div className={`px-4 py-3 flex items-center justify-between ${
                        isCurrentExplore
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
                        {cachedContent ? (
                          <MarkdownRenderer content={cachedContent} />
                        ) : (
                          <p className="text-gray-400 text-center py-8">内容加载中...</p>
                        )}
                      </div>

                      {/* Explore hint — only on 前天 card (index 2), positioned at left edge */}
                      {index === 2 && availableDates.length > 3 && (
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
                      {index === 0 && (
                        <div className="px-5 pb-4 border-t border-gray-100 pt-3">
                          {showExtraCard && extraContent ? (
                            <div className="extra-card-enter">
                              <div className="bg-gradient-to-r from-amber-400 to-orange-400 text-white px-4 py-2.5 rounded-xl flex items-center justify-between mb-3 shadow-sm">
                                <span className="font-medium text-sm">
                                  再来一个 · 第{chanceState.used}次
                                </span>
                                <button
                                  onClick={dismissExtra}
                                  className="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  收起
                                </button>
                              </div>
                              <div className="select-text markdown-content">
                                <MarkdownRenderer content={extraContent} />
                              </div>
                              <div className="flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-gray-100">
                                {[0, 1, 2].map(i => (
                                  <div
                                    key={i}
                                    className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                                      i < chanceState.used ? "bg-gray-300" : "bg-brand-500"
                                    }`}
                                  />
                                ))}
                                <span className="text-xs text-gray-400 ml-1.5">
                                  还能再来 {remaining} 次
                                </span>
                              </div>
                            </div>
                          ) : extraError ? (
                            <div className="text-center py-3">
                              <p className="text-sm text-gray-500">{extraError}</p>
                            </div>
                          ) : chanceState.used >= MAX_CHANCES ? (
                            <div className="text-center py-3">
                              <div className="flex items-center justify-center gap-1.5 mb-2">
                                {[0, 1, 2].map(i => (
                                  <div key={i} className="w-2 h-2 rounded-full bg-gray-300" />
                                ))}
                              </div>
                              <p className="text-sm text-gray-500 font-medium">明天再来 🌙</p>
                              <p className="text-xs text-gray-400 mt-1">
                                {formatCountdown(countdown)}后解锁新机会
                              </p>
                            </div>
                          ) : (
                            <button
                              onClick={handleExtraClick}
                              disabled={extraLoading}
                              className="w-full py-3 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2
                                bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-700
                                hover:from-amber-100 hover:to-orange-100 hover:border-amber-300 hover:shadow-sm
                                active:scale-[0.98]
                                disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {extraLoading ? (
                                <div className="w-4 h-4 rounded-full border-2 border-amber-300 border-t-amber-600 animate-spin" />
                              ) : (
                                <>
                                  <span className="text-base">🎲</span>
                                  <span>再来一个为什么？</span>
                                </>
                              )}
                              <div className="flex items-center gap-1 ml-1.5">
                                {[0, 1, 2].map(i => (
                                  <div
                                    key={i}
                                    className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                                      i < chanceState.used ? "bg-gray-300" : "bg-amber-400"
                                    }`}
                                  />
                                ))}
                              </div>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
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
