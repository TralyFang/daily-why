'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const THRESHOLD = 80; // px needed to trigger refresh
const MAX_PULL = 120; // max visual pull distance
const DIRECTION_THRESHOLD = 8; // px to decide gesture direction

interface Props {
  onRefresh: () => Promise<void>;
  isContentAtTop?: () => boolean; // check if visible content is scrolled to top
}

export default function PullToRefresh({ onRefresh, isContentAtTop }: Props) {
  const [isStandalone, setIsStandalone] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullDistRef = useRef(0);
  const directionRef = useRef<'undetermined' | 'vertical' | 'horizontal'>('undetermined');

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
  }, []);

  useEffect(() => {
    if (!isStandalone) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshing) return;

      // Check if content is at the very top
      const docAtTop = document.scrollingElement?.scrollTop === 0 || window.scrollY === 0;
      const contentAtTop = isContentAtTop ? isContentAtTop() : true;
      if (!docAtTop || !contentAtTop) return;

      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
      pullDistRef.current = 0;
      directionRef.current = 'undetermined';
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || isRefreshing) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = currentX - startXRef.current;
      const deltaY = currentY - startYRef.current;

      // Direction lock — same logic as carousel
      if (directionRef.current === 'undetermined') {
        if (Math.abs(deltaX) < DIRECTION_THRESHOLD && Math.abs(deltaY) < DIRECTION_THRESHOLD) return;
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          directionRef.current = 'horizontal';
          // This is a carousel swipe — cancel pull
          pullingRef.current = false;
          setPullDistance(0);
          return;
        } else {
          directionRef.current = 'vertical';
        }
      }

      if (directionRef.current === 'horizontal') {
        pullingRef.current = false;
        setPullDistance(0);
        return;
      }

      // Vertical downward gesture — pull to refresh
      if (deltaY < 0) {
        pullingRef.current = false;
        pullDistRef.current = 0;
        setPullDistance(0);
        return;
      }

      // Prevent iOS rubber-band bounce — CRITICAL for iOS PWA
      e.preventDefault();

      // Re-check if still at top (user might have scrolled away)
      const docAtTop = document.scrollingElement?.scrollTop === 0 || window.scrollY === 0;
      const contentAtTop = isContentAtTop ? isContentAtTop() : true;
      if (!docAtTop || !contentAtTop) {
        pullingRef.current = false;
        pullDistRef.current = 0;
        setPullDistance(0);
        return;
      }

      // Apply rubber-band effect (resistance increases with distance)
      const pull = Math.min(deltaY * 0.4, MAX_PULL);
      pullDistRef.current = pull;
      setPullDistance(pull);
    };

    const handleTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      directionRef.current = 'undetermined';

      if (pullDistRef.current >= THRESHOLD && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(0);
        pullDistRef.current = 0;
        onRefresh().finally(() => {
          setIsRefreshing(false);
        });
      } else {
        setPullDistance(0);
        pullDistRef.current = 0;
      }
    };

    // CRITICAL: touchmove must be passive:false so we can call preventDefault()
    // to stop iOS Safari's native rubber-band bounce in standalone mode
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isStandalone, isRefreshing, onRefresh, isContentAtTop]);

  if (!isStandalone) return null;

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const showIndicator = pullDistance > 10 || isRefreshing;

  return (
    <div
      className="fixed left-0 right-0 z-50 flex items-center justify-center"
      style={{
        top: "env(safe-area-inset-top, 0px)",
        height: isRefreshing ? 48 : pullDistance,
        opacity: showIndicator ? 1 : 0,
        transition: isRefreshing ? 'none' : pullDistance === 0 ? 'height 300ms ease, opacity 300ms ease' : 'none',
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
