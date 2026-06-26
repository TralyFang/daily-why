'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

const HEARTBEAT_KEY = 'daily-why-heartbeat';
const AUTO_ACTIVATE_DELAY = 30 * 1000; // Auto-activate after 30s of inactivity

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ServiceWorkerRegistration() {
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const autoActivateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userInteracted = useRef(false);

  // Trigger skipWaiting on the waiting SW, then page will reload on controllerchange
  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    setShowUpdateToast(false);
  }, [waitingWorker]);

  const dismissUpdate = useCallback(() => {
    setShowUpdateToast(false);
    // User dismissed — don't auto-activate during this session
    userInteracted.current = true;
    if (autoActivateTimer.current) {
      clearTimeout(autoActivateTimer.current);
      autoActivateTimer.current = null;
    }
  }, []);

  // Start auto-activate countdown (activates if user is idle for 30s)
  const startAutoActivate = useCallback((worker: ServiceWorker) => {
    if (autoActivateTimer.current) clearTimeout(autoActivateTimer.current);

    autoActivateTimer.current = setTimeout(() => {
      // Only auto-activate if user hasn't explicitly dismissed
      if (!userInteracted.current) {
        worker.postMessage({ type: 'SKIP_WAITING' });
      }
    }, AUTO_ACTIVATE_DELAY);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('SW registered:', reg.scope);

      // --- Update detection ---
      const onUpdateFound = () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          // New SW is installed and waiting — this is an update (not first install)
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setShowUpdateToast(true);
            // Start auto-activate countdown
            startAutoActivate(newWorker);
          }
        });
      };

      reg.addEventListener('updatefound', onUpdateFound);

      // If there's already a waiting worker (e.g., from previous page load)
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(reg.waiting);
        setShowUpdateToast(true);
        startAutoActivate(reg.waiting);
      }

      // Check on visibility change (user returns to app)
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});

          // If there's a waiting worker and user comes back from background,
          // auto-activate it (they likely won't notice the reload)
          if (reg.waiting && navigator.serviceWorker.controller && !userInteracted.current) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
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

      // Cleanup
      return () => {
        reg.removeEventListener('updatefound', onUpdateFound);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    }).catch((err) => {
      console.log('SW registration failed:', err);
    });

    return () => {
      if (autoActivateTimer.current) clearTimeout(autoActivateTimer.current);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [startAutoActivate]);

  // Update toast UI
  if (!showUpdateToast) return null;

  return (
    <div
      className="fixed bottom-20 left-4 right-4 z-50 flex justify-center animate-slideUpToast"
      role="alert"
      aria-live="polite"
    >
      <div className="w-full max-w-sm bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3">
        {/* Icon */}
        <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-500">
            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.379 2.624l-2.06 2.06a.75.75 0 01-1.06-1.06l2.06-2.06A5.5 5.5 0 0115.312 3.17l-1.248 1.248a3.999 3.999 0 00-5.422 5.422L7.28 11.2a.75.75 0 011.06 1.06l1.36-1.36a3.999 3.999 0 005.422-5.422l1.248-1.248a5.5 5.5 0 01-1.06 7.194z" clipRule="evenodd" />
          </svg>
        </div>
        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">发现新版本 ✨</p>
          <p className="text-xs text-gray-500 mt-0.5">点击更新获取最新内容</p>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={dismissUpdate}
            className="text-xs text-gray-400 hover:text-gray-600 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            稍后
          </button>
          <button
            onClick={applyUpdate}
            className="text-xs bg-brand-500 hover:bg-brand-600 text-white px-3.5 py-1.5 rounded-full font-medium transition-colors shadow-sm"
          >
            更新
          </button>
        </div>
      </div>
    </div>
  );
}
