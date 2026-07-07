"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { buildContentRequestUrl, buildDatesRequestUrl } from "../lib/contentApi";
import { getDateLabel, getWeekday } from "../lib/dates";
import { clearDatesListCache, readDatesListCache, writeDatesListCache } from "../lib/datesListCache";

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
  retryingDates: Set<string>;
  fetchDates: (options?: FetchDatesOptions) => Promise<void>;
  loadContent: (date: string, forceRefresh?: boolean) => Promise<void>;
  retryGenerateContent: (date: string) => Promise<void>;
  handleRefresh: () => Promise<void>;
  handleClearCache: () => Promise<void>;
  clearingCache: boolean;
  setContentCache: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setErrorDates: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export interface FetchDatesOptions {
  preserveDate?: string;
  forceRefresh?: boolean;
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
  const [retryingDates, setRetryingDates] = useState<Set<string>>(new Set());

  const currentIndexRef = useRef<number>(0);
  const availableDatesRef = useRef<DateInfo[]>([]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const clearGlobalError = useCallback(() => {
    setErrorDates(prev => {
      if (!prev.global) return prev;
      const next = { ...prev };
      delete next.global;
      return next;
    });
  }, []);

  const buildDateInfos = useCallback((dates: string[]): DateInfo[] => {
    return dates.map((date) => ({
      date,
      label: getDateLabel(date),
      weekday: getWeekday(date),
    }));
  }, []);

  const applyDatesData = useCallback((dates: string[], preserveDate?: string) => {
    if (dates.length === 0) {
      availableDatesRef.current = [];
      setAvailableDates([]);
      setErrorDates({ global: "暂无可用内容" });
      setDatesLoaded(true);
      return;
    }

    clearGlobalError();

    const dateInfos = buildDateInfos(dates);
    availableDatesRef.current = dateInfos;
    setAvailableDates(dateInfos);

    let targetIndex = 0;
    if (preserveDate) {
      const idx = dateInfos.findIndex((item) => item.date === preserveDate);
      if (idx !== -1) {
        targetIndex = idx;
      } else {
        targetIndex = Math.min(currentIndexRef.current, dateInfos.length - 1);
      }
    }

    setCurrentIndex(targetIndex);
    setDatesLoaded(true);
  }, [buildDateInfos, clearGlobalError, setCurrentIndex]);

  const loadContent = useCallback(async (date: string, forceRefresh = false) => {
    if (!forceRefresh && (contentCache[date] || loadingDates.has(date))) return;
    if (loadingDates.has(date)) return;
    setLoadingDates(prev => new Set([...prev, date]));
    try {
      const res = await fetch(buildContentRequestUrl(date, forceRefresh));
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

  const fetchDates = useCallback(async (options: FetchDatesOptions = {}) => {
    const { preserveDate, forceRefresh = false } = options;

    try {
      const res = await fetch(buildDatesRequestUrl(forceRefresh));
      const data = await res.json();
      if (data.availableDates && data.availableDates.length > 0) {
        writeDatesListCache({
          availableDates: data.availableDates,
          today: data.today || data.availableDates[0] || null,
        });
        applyDatesData(data.availableDates, preserveDate);
      } else {
        clearDatesListCache();
        applyDatesData([], preserveDate);
      }
    } catch {
      setErrorDates(prev => ({ ...prev, "global": "加载失败，请刷新重试" }));
      setDatesLoaded(true);
    }
  }, [applyDatesData]);

  const handleRefresh = useCallback(async () => {
    const currentDate = availableDates[currentIndex]?.date;
    if (!currentDate) return;

    onClearExtraState();
    if (currentIndex === 0) {
      await fetchDates({ forceRefresh: true });
      const latestDate = availableDatesRef.current[0]?.date;
      if (latestDate) {
        await loadContent(latestDate, true);
      }
      return;
    }

    await loadContent(currentDate, true);
  }, [fetchDates, loadContent, availableDates, currentIndex, onClearExtraState]);

  const retryGenerateContent = useCallback(async (date: string) => {
    setRetryingDates((prev) => new Set([...prev, date]));
    try {
      const res = await fetch(`/api/content/generate?force=1&date=${date}&slot=main`);
      if (!res.ok) {
        throw new Error("生成失败");
      }
      await loadContent(date, true);
    } catch {
      setErrorDates((prev) => ({ ...prev, [date]: "重新生成失败，请稍后再试" }));
    } finally {
      setRetryingDates((prev) => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
    }
  }, [loadContent]);

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
      clearDatesListCache();
      setContentCache({});
      setErrorDates({});
      onClearExtraState();
      await fetchDates({ forceRefresh: true });
    } catch {
      // silently fail
    } finally {
      setClearingCache(false);
    }
  }, [fetchDates, onClearExtraState]);

  // Cold start: render cached dates immediately, then force refresh dates list
  useEffect(() => {
    let cancelled = false;

    const bootstrapDates = async () => {
      const cached = readDatesListCache();
      if (cached?.availableDates.length) {
        applyDatesData(cached.availableDates);
      }
      if (cancelled) return;
      await fetchDates({ forceRefresh: true });
    };

    void bootstrapDates();

    return () => {
      cancelled = true;
    };
  }, [applyDatesData, fetchDates]);

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
    retryingDates,
    fetchDates,
    loadContent,
    retryGenerateContent,
    handleRefresh,
    handleClearCache,
    clearingCache,
    setContentCache,
    setErrorDates,
  };
}
