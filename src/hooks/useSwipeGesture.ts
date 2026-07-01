"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type DirectionLock = "undetermined" | "horizontal" | "vertical";

export interface UseSwipeGestureOptions {
  currentIndex: number;
  maxIndex: number;
  onNavigate: (index: number) => void;
}

export interface UseSwipeGestureReturn {
  translateX: number;
  isDragging: boolean;
  containerRef: React.RefObject<HTMLElement>;
  slideWidth: React.MutableRefObject<number>;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
}

export function useSwipeGesture({
  currentIndex,
  maxIndex,
  onNavigate,
}: UseSwipeGestureOptions): UseSwipeGestureReturn {
  const [translateX, setTranslateX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStartX = useRef<number>(0);
  const dragStartY = useRef<number>(0);
  const dragDeltaX = useRef<number>(0);
  const directionLock = useRef<DirectionLock>("undetermined");
  const containerRef = useRef<HTMLElement>(null!);
  const slideWidth = useRef<number>(0);

  const canSwipeLeft = currentIndex < maxIndex;
  const canSwipeRight = currentIndex > 0;

  // slide width measurement
  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      slideWidth.current = containerRef.current!.offsetWidth;
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const navigateTo = useCallback((index: number) => {
    onNavigate(index);
    setTranslateX(0);
    setIsDragging(false);
    directionLock.current = "undetermined";
  }, [onNavigate]);

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

  return {
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
  };
}
