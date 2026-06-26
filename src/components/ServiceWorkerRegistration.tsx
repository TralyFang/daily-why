'use client';

import { useEffect, useState, useCallback } from 'react';

const HEARTBEAT_KEY = 'daily-why-heartbeat';
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // Check for SW updates every 1 hour

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ServiceWorkerRegistration() {
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  // Reload the page when new SW takes control
  const handleControllerChange = useCallback(() => {
    // Only reload if we previously showed the update toast (user-triggered)
    // or if it's a silent update via skipWaiting
    window.location.reload();
  }, []);

  // Apply the waiting SW update
  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    setShowUpdateToast(false);
  }, [waitingWorker]);

  const dismissUpdate = useCallback(() => {
    setShowUpdateToast(false);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let updateInterval: ReturnType<typeof setInterval> | null = null;

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('SW registered:', reg.scope);

      // --- Update detection ---
      // Listen for new SW found (updatefound fires when browser detects a new SW)
      const onUpdateFound = () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          // New SW is installed and waiting to activate
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // There's an existing controller, so this is an update (not first install)
            setWaitingWorker(newWorker);
            setShowUpdateToast(true);
          }
        });
      };

      reg.addEventListener('updatefound', onUpdateFound);

      // If there's already a waiting worker (e.g., from previous page load)
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(reg.waiting);
        setShowUpdateToast(true);
      }

      // --- Periodic update check ---
      // Proactively check for SW updates every hour
      updateInterval = setInterval(() => {
        reg.update().catch(() => {
          // Silently ignore update check failures (e.g., offline)
        });
      }, UPDATE_CHECK_INTERVAL);

      // Also check on page visibility change (user returns to tab/app)
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      // --- Heartbeat (PWA standalone mode only) ---
      const isPWA = window.matchMedia('(display-mode: standalone)').matches;
      if (isPWA) {
        const today = getToday();
        const lastHeartbeat = localStorage.getItem(HEARTBEAT_KEY);

        if (lastHeartbeat !== today) {
          const deviceId = localStorage.getItem('daily-why-device-id');
          if (deviceId && reg.active) {
            reg.active.postMessage({ type: 'HEARTBEAT', deviceId });
          } else if (reg.installing) {
            reg.installing.addEventListener('statechange', function onStateChange() {
              if (this.state === 'activated') {
                const id = localStorage.getItem('daily-why-device-id');
                if (id) this.postMessage({ type: 'HEARTBEAT', deviceId: id });
              }
            });
          } else if (reg.waiting) {
            const id = localStorage.getItem('daily-why-device-id');
            if (id) reg.waiting.postMessage({ type: 'HEARTBEAT', deviceId: id });
          }
          localStorage.setItem(HEARTBEAT_KEY, today);
        }
      }

      // Cleanup on unmount
      return () => {
        reg.removeEventListener('updatefound', onUpdateFound);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    }).catch((err) => {
      console.log('SW registration failed:', err);
    });

    // Listen for controller change (new SW activated)
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      if (updateInterval) clearInterval(updateInterval);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [handleControllerChange]);

  // Update toast UI
  if (!showUpdateToast) return null;

  return (
    <div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-slideUpToast"
      role="alert"
      aria-live="polite"
    >
      <div className="bg-gray-900/95 backdrop-blur-sm text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 max-w-[340px]">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">发现新版本 ✨</p>
          <p className="text-xs text-gray-300 mt-0.5">点击更新获取最新内容</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={dismissUpdate}
            className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1.5 rounded-lg transition-colors"
          >
            稍后
          </button>
          <button
            onClick={applyUpdate}
            className="text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            更新
          </button>
        </div>
      </div>
    </div>
  );
}
