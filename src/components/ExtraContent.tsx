"use client";

import { useState, useEffect } from "react";
import MarkdownRenderer from "./MarkdownRenderer";

interface ChanceState {
  date: string;
  used: number;
}

const MAX_CHANCES = 3;
const CHANCE_STORAGE_KEY = "daily-why-chances";

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

export interface ExtraContentProps {
  todayDate: string;
}

export interface ExtraContentState {
  chanceState: ChanceState;
  extraContent: string | null;
  extraLoading: boolean;
  extraError: string | null;
  showExtraCard: boolean;
}

export function useExtraContentState() {
  const [chanceState, setChanceState] = useState<ChanceState>({ date: "", used: 0 });
  const [extraContent, setExtraContent] = useState<string | null>(null);
  const [extraLoading, setExtraLoading] = useState<boolean>(false);
  const [extraError, setExtraError] = useState<string | null>(null);
  const [showExtraCard, setShowExtraCard] = useState<boolean>(false);

  useEffect(() => {
    setChanceState(getChanceState());
  }, []);

  const clearExtraState = () => {
    setExtraContent(null);
    setShowExtraCard(false);
    setExtraError(null);
    setChanceState(getChanceState());
  };

  return {
    chanceState,
    setChanceState,
    extraContent,
    setExtraContent,
    extraLoading,
    setExtraLoading,
    extraError,
    setExtraError,
    showExtraCard,
    setShowExtraCard,
    clearExtraState,
  };
}

export default function ExtraContent({ todayDate }: ExtraContentProps) {
  const {
    chanceState,
    setChanceState,
    extraContent,
    setExtraContent,
    extraLoading,
    setExtraLoading,
    extraError,
    setExtraError,
    showExtraCard,
    setShowExtraCard,
  } = useExtraContentState();

  const [countdown, setCountdown] = useState<number>(getSecondsUntilMidnight());

  // countdown timer
  useEffect(() => {
    if (chanceState.used >= MAX_CHANCES) {
      const timer = setInterval(() => {
        setCountdown(getSecondsUntilMidnight());
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [chanceState.used]);

  const remaining = MAX_CHANCES - chanceState.used;

  const handleExtraClick = async () => {
    if (chanceState.used >= MAX_CHANCES) return;
    if (extraLoading) return;

    if (showExtraCard) {
      setShowExtraCard(false);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setExtraError(null);
    const nextSlot = chanceState.used + 1;
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

  return (
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
          <div
            className={`flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-gray-100 ${
              remaining > 0 ? "cursor-pointer active:opacity-70" : ""
            }`}
            onClick={remaining > 0 ? handleExtraClick : undefined}
          >
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                  i < chanceState.used ? "bg-gray-300" : "bg-brand-500"
                }`}
              />
            ))}
            <span className="text-xs text-gray-400 ml-1.5">
              {remaining > 0 ? `还能再来 ${remaining} 次 →` : "今日次数已用完"}
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
  );
}
