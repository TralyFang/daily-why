"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface DateInfo {
  date: string;
  label: string;
  weekday: string;
}

export interface UseContentLoaderReturn {
  availableDates: DateInfo[];
  contentCache: Record<string, string>;
  loadingDates: Set<string>;
  errorDates: Record<string, string>;
  datesLoaded: boolean;
  fetchDates: (preserveDate?: string) => Promise<void>;
  loadContent: (date: string, forceRefresh?: boolean) => Promise<void>;
  handleRefresh: () => Promise<void>;
  handleClearCache: () => Promise<void>;
  clearingCache: boolean;
  setContentCache: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setErrorDates: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

const CHANCE_STORAGE_KEY = "daily-why-chances";

export function useContentLoader(
  currentIndex: number,
  setCurrentIndex: (index: number) => void,
  onClearExtraState: () => void,
): UseContentLoaderReturn {
  const [availableDates, setAvailableDates] = useState<DateInfo[]>([]);
  const [contentCache, setContentCache] = useState<Record<string, string>>({});
  const [loadingDates, setLoadingDates] = useState<Set<string>>(new Set());
  const [errorDates, setErrorDates] = useState<Record<string, string>>({});
  const [datesLoaded, setDatesLoaded] = useState<boolean>(false);
  const [clearingCache, setClearingCache] = useState<boolean>(false);

  const currentIndexRef = useRef<number>(0);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const loadContent = useCallback(async (date: string, forceRefresh = false) => {
    if (!forceRefresh && (contentCache[date] || loadingDates.has(date))) return;
    if (loadingDates.has(date)) return;
    setLoadingDates(prev => new Set([...prev, date]));
    try {
      const url = forceRefresh
        ? `/api/content?date=${date}&_refresh=1`
        : `/api/content?date=${date}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.content) {
        setContentCache(prev => ({ ...prev, [date]: data.content }));
        setErrorDates(prev => {
          const next = { ...prev };
          delete next[date];
          return next;
        });
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

  const fetchDates = useCallback(async (preserveDate?: string) => {
    try {
      const res = await fetch(`/api/content`);
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

        let targetIndex = 0;
        if (preserveDate) {
          const idx = dateInfos.findIndex(d => d.date === preserveDate);
          if (idx !== -1) {
            targetIndex = idx;
          } else {
            targetIndex = Math.min(currentIndexRef.current, dateInfos.length - 1);
          }
        }
        setCurrentIndex(targetIndex);
        setDatesLoaded(true);
        const forceRefresh = !!preserveDate;
        loadContent(dateInfos[targetIndex].date, forceRefresh);
        if (targetIndex > 0) loadContent(dateInfos[targetIndex - 1].date);
        if (targetIndex < dateInfos.length - 1) loadContent(dateInfos[targetIndex + 1].date);
      } else {
        setErrorDates({ "global": "暂无可用内容" });
        setDatesLoaded(true);
      }
    } catch {
      setErrorDates(prev => ({ ...prev, "global": "加载失败，请刷新重试" }));
      setDatesLoaded(true);
    }
  }, [loadContent, setCurrentIndex]);

  const handleRefresh = useCallback(async () => {
    const currentDate = availableDates[currentIndex]?.date;
    onClearExtraState();
    await fetchDates(currentDate);
  }, [fetchDates, availableDates, currentIndex, onClearExtraState]);

  const handleClearCache = useCallback(async () => {
    setClearingCache(true);
    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name.includes("api")) {
          await caches.delete(name);
        }
      }
      localStorage.removeItem(CHANCE_STORAGE_KEY);
      setContentCache({});
      setErrorDates({});
      onClearExtraState();
      await fetchDates();
    } catch {
      // silently fail
    } finally {
      setClearingCache(false);
    }
  }, [fetchDates, onClearExtraState]);

  // Initial fetch
  useEffect(() => {
    fetchDates();
  }, []);

  // Listen for Service Worker CONTENT_UPDATED message
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "CONTENT_UPDATED") {
        const isDateListUpdate = !event.data.url.includes("date=");
        if (isDateListUpdate) {
          handleRefresh();
        }
      }
      if (event.data?.type === "DATES_UPDATED") {
        fetchDates();
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [handleRefresh, fetchDates]);

  // Prefetch adjacent when currentIndex changes
  useEffect(() => {
    const currentDateInfo = availableDates[currentIndex];
    if (!currentDateInfo) return;
    loadContent(currentDateInfo.date);
    if (currentIndex > 0) loadContent(availableDates[currentIndex - 1].date);
    if (currentIndex < availableDates.length - 1) loadContent(availableDates[currentIndex + 1].date);
  }, [currentIndex, availableDates, loadContent]);

  return {
    availableDates,
    contentCache,
    loadingDates,
    errorDates,
    datesLoaded,
    fetchDates,
    loadContent,
    handleRefresh,
    handleClearCache,
    clearingCache,
    setContentCache,
    setErrorDates,
  };
}
