'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

type PromptVariant = 'ios' | 'android-native' | 'android-manual';

const INSTALL_PROMPT_DISMISSED_KEY = 'install-prompt-dismissed';
const DISMISS_COOLDOWN_DAYS = 7;
const IOS_PROMPT_DELAY_MS = 3000;
const ANDROID_NATIVE_PROMPT_DELAY_MS = 1500;
const ANDROID_FALLBACK_PROMPT_DELAY_MS = 4500;

function logInstallPrompt(message: string, payload?: Record<string, unknown>) {
  if (payload) {
    console.info(`[PWA Install] ${message}`, payload);
    return;
  }
  console.info(`[PWA Install] ${message}`);
}

function wasPromptDismissedRecently() {
  const dismissedAt = localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY);
  if (!dismissedAt) return false;

  const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
  return daysSince < DISMISS_COOLDOWN_DAYS;
}

function markPromptDismissed() {
  localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, Date.now().toString());
}

function InstallPromptCard({
  variant,
  onDismiss,
  onInstall,
  isInstalling,
}: {
  variant: PromptVariant;
  onDismiss: () => void;
  onInstall?: () => void;
  isInstalling?: boolean;
}) {
  const isIOS = variant === 'ios';
  const isAndroidNative = variant === 'android-native';
  const isAndroidManual = variant === 'android-manual';

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

            {isIOS ? (
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
            ) : isAndroidNative ? (
              <div className="mt-3 bg-emerald-50 rounded-xl p-3">
                <p className="text-xs text-emerald-700 leading-relaxed">
                  当前浏览器已支持安装，点击下方按钮后确认即可添加到桌面。
                </p>
                <button
                  onClick={onInstall}
                  disabled={isInstalling}
                  className="mt-3 w-full rounded-xl bg-emerald-600 text-white text-sm font-medium py-2.5 transition-colors hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isInstalling ? '正在唤起安装...' : '立即安装'}
                </button>
              </div>
            ) : isAndroidManual ? (
              <div className="mt-3 bg-amber-50 rounded-xl p-3">
                <p className="text-xs text-amber-700 leading-relaxed">
                  当前浏览器没有自动弹出安装窗口，可尝试点击右上角菜单，选择「安装应用」或「添加到主屏幕」。
                </p>
                <p className="text-xs text-amber-700 leading-relaxed mt-1.5">
                  如果你刚更新了站点，也可以刷新页面后再试一次。
                </p>
              </div>
            ) : null}
          </div>
          <button
            onClick={onDismiss}
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

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [variant, setVariant] = useState<PromptVariant | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const dismissedRecently = wasPromptDismissedRecently();

    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isChromeLike = /Chrome/.test(ua);
    const hasServiceWorker = 'serviceWorker' in navigator;

    logInstallPrompt('初始化安装引导', {
      isStandalone,
      dismissedRecently,
      isIOS,
      isAndroid,
      isChromeLike,
      hasServiceWorker,
      userAgent: ua,
    });

    if (isStandalone) {
      logInstallPrompt('已处于独立应用模式，跳过安装引导');
      return;
    }

    if (dismissedRecently) {
      logInstallPrompt('用户近期已关闭安装引导，跳过本次展示');
      return;
    }

    let primaryTimeoutId: number | null = null;
    let fallbackTimeoutId: number | null = null;

    if (isIOS) {
      setVariant('ios');
      primaryTimeoutId = window.setTimeout(() => {
        logInstallPrompt('展示 iOS 手动安装引导');
        setShow(true);
      }, IOS_PROMPT_DELAY_MS);
    }

    if (isAndroid) {
      fallbackTimeoutId = window.setTimeout(() => {
        setVariant((currentVariant) => {
          if (currentVariant === 'android-native') {
            return currentVariant;
          }

          logInstallPrompt('未收到 beforeinstallprompt，降级展示 Android 手动安装引导');
          setShow(true);
          return 'android-manual';
        });
      }, ANDROID_FALLBACK_PROMPT_DELAY_MS);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      if (!isAndroid || wasPromptDismissedRecently()) {
        logInstallPrompt('忽略 beforeinstallprompt 事件', {
          isAndroid,
          dismissedRecently: wasPromptDismissedRecently(),
        });
        return;
      }

      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
      setVariant('android-native');
      logInstallPrompt('捕获 beforeinstallprompt 事件，准备展示原生安装引导');

      if (primaryTimeoutId) {
        window.clearTimeout(primaryTimeoutId);
      }
      if (fallbackTimeoutId) {
        window.clearTimeout(fallbackTimeoutId);
      }
      primaryTimeoutId = window.setTimeout(() => {
        logInstallPrompt('展示 Android 原生安装引导');
        setShow(true);
      }, ANDROID_NATIVE_PROMPT_DELAY_MS);
    };

    const handleAppInstalled = () => {
      logInstallPrompt('应用已安装，收起安装引导');
      setShow(false);
      setDeferredPrompt(null);
      setVariant(null);
      setIsInstalling(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      if (primaryTimeoutId) {
        window.clearTimeout(primaryTimeoutId);
      }
      if (fallbackTimeoutId) {
        window.clearTimeout(fallbackTimeoutId);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    logInstallPrompt('用户关闭安装引导', { variant });
    setShow(false);
    markPromptDismissed();
  };

  const handleInstall = async () => {
    if (!deferredPrompt || isInstalling) return;

    setIsInstalling(true);
    try {
      logInstallPrompt('触发 deferredPrompt.prompt()');
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      logInstallPrompt('安装弹窗用户选择结果', choice);
      setDeferredPrompt(null);
      setShow(false);

      if (choice.outcome === 'dismissed') {
        markPromptDismissed();
      }
    } finally {
      setIsInstalling(false);
    }
  };

  if (!show || !variant) return null;

  return (
    <InstallPromptCard
      variant={variant}
      onDismiss={handleDismiss}
      onInstall={variant === 'android-native' ? handleInstall : undefined}
      isInstalling={variant === 'android-native' ? isInstalling : undefined}
    />
  );
}
