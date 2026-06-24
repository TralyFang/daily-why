'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const THRESHOLD = 80; // px needed to trigger refresh
const MAX_PULL = 120; // max visual pull distance

interface Props {
  onRefresh: () => Promise<void>;
}

export default function PullToRefresh({ onRefresh }: Props) {
  const [isStandalone, setIsStandalone] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);

  useEffect(() => {
    // Only enable in PWA standalone mode
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
  }, []);

  const isAtTop = useCallback(() => {
    return document.scrollingElement?.scrollTop === 0 || window.scrollY === 0;
  }, []);

  useEffect(() => {
    if (!isStandalone) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshing) return;
      if (!isAtTop()) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pulling.current || isRefreshing) return;

      const deltaY = e.touches[0].clientY - startY.current;

      // Only process downward pull
      if (deltaY < 0) {
        pulling.current = false;
        setPullDistance(0);
        return;
      }

      // If not at top anymore (scrolled up during touch), cancel
      if (!isAtTop()) {
        pulling.current = false;
        setPullDistance(0);
        return;
      }

      // Apply rubber-band effect
      const pull = Math.min(deltaY * 0.4, MAX_PULL);
      setPullDistance(pull);
    };

    const handleTouchEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;

      if (pullDistance >= THRESHOLD && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(0);
        onRefresh().finally(() => {
          setIsRefreshing(false);
        });
      } else {
        setPullDistance(0);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isStandalone, pullDistance, isRefreshing, isAtTop, onRefresh]);

  if (!isStandalone) return null;

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const showIndicator = pullDistance > 10 || isRefreshing;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center transition-all"
      style={{
        height: isRefreshing ? 48 : pullDistance,
        opacity: showIndicator ? 1 : 0,
        transform: isRefreshing ? 'none' : `translateY(0)`,
      }}
    >
      <div className="flex items-center gap-2 text-gray-400">
        {isRefreshing ? (
          <>
            <div className="w-5 h-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
            <span className="text-xs font-medium">刷新中...</span>
          </>
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                transform: `rotate(${progress * 180}deg)`,
                transition: 'transform 150ms ease',
              }}
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-5.36L23 10" />
            </svg>
            <span className="text-xs">
              {progress >= 1 ? '释放刷新' : '下拉刷新'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
