"use client";

import { useState, useEffect, useCallback } from "react";
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
          const now = new Date();
          const todayYMD = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
          const diff = (todayYMD[0] - y) * 365 + (todayYMD[1] - m) * 30 + (todayYMD[2] - dNum);
          // More accurate: use Date objects but compare only date parts
          const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-b from-brand-50 via-white to-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/80 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
              ?
            </div>
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
            onSelect={setSelectedDate}
          />
        </div>
      </div>

      {/* Content Area */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin mb-4" />
            <p className="text-sm text-gray-400">加载中...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <span className="text-2xl text-gray-300">?</span>
            </div>
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
            <div className="px-5 py-5">
              <MarkdownRenderer content={content} />
            </div>
          </article>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-xs text-gray-400">
          内容每天更新 · 仅保留近7天 · 用好奇心点亮每一天
        </p>
      </footer>
    </div>
  );
}
