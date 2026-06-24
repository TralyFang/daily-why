'use client';

import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Check if user previously dismissed
    const dismissedAt = localStorage.getItem('install-prompt-dismissed');
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return; // Don't show again for 7 days after dismiss
    }

    // Detect platform
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    const isAndroid = /Android/.test(ua) && /Chrome/.test(ua);

    if (isIOS) {
      // iOS Safari — no beforeinstallprompt, show manual guide
      setPlatform('ios');
      // Show after a short delay so it doesn't appear instantly
      setTimeout(() => setShow(true), 3000);
    } else if (isAndroid) {
      // Android Chrome — listen for native prompt
      // If browser already prompted, we don't need custom prompt
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        // Browser will handle this, no custom prompt needed
      });
    }
  }, []);

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    localStorage.setItem('install-prompt-dismissed', Date.now().toString());
  };

  if (!show || !platform) return null;

  if (platform === 'ios') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-slideUpPrompt">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 max-w-md mx-auto">
          <div className="flex items-start gap-3">
            <img src="/icon-192.png" alt="" className="w-12 h-12 rounded-xl" />
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">安装「每日一个为什么」</p>
              <p className="text-gray-500 text-xs mt-1">
                添加到主屏幕，像 App 一样打开，离线也能看
              </p>
              {/* iOS-specific instruction */}
              <div className="mt-3 bg-blue-50 rounded-xl p-3">
                <p className="text-xs text-blue-700 leading-relaxed">
                  <span className="inline-flex items-center gap-1 font-semibold">
                    第一步
                  </span>
                  点击底部
                  <span className="inline-flex items-center mx-0.5 px-1.5 py-0.5 bg-white rounded-md border border-gray-200 text-xs">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    分享
                  </span>
                  按钮
                </p>
                <p className="text-xs text-blue-700 leading-relaxed mt-1.5">
                  <span className="inline-flex items-center gap-1 font-semibold">
                    第二步
                  </span>
                  选择「添加到主屏幕」
                </p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 -mt-1"
              aria-label="关闭"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
