'use client';

import { useEffect } from 'react';

const HEARTBEAT_KEY = 'daily-why-heartbeat';

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('SW registered:', reg.scope);

        // Send heartbeat once per day (only from PWA standalone mode)
        const isPWA = window.matchMedia('(display-mode: standalone)').matches;
        if (!isPWA) return;

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
      }).catch((err) => {
        console.log('SW registration failed:', err);
      });
    }
  }, []);

  return null;
}
