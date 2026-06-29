"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";
import DebugPanel from "./DebugPanel";

// ---- types ----

interface ReminderConfig {
  enabled: boolean;
}

const STORAGE_KEY = "daily-why-reminder";

function loadConfig(): ReminderConfig {
  if (typeof window === "undefined") return { enabled: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { enabled: !!parsed.enabled };
    }
  } catch {}
  return { enabled: false };
}

function saveConfig(config: ReminderConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Check if push notifications are supported (regardless of standalone mode) */
function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Detect if running on a mobile device */
function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

// ---- component ----

export default function ReminderSettings() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ReminderConfig>({ enabled: false });
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Debug mode
  const [debugMode, setDebugMode] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  // Load config on mount
  useEffect(() => {
    setMounted(true);
    const c = loadConfig();
    setConfig(c);
    setDraftEnabled(c.enabled);
    const canEnable = isMobileDevice() ? isStandaloneMode() : isPushSupported();
    setStandalone(canEnable);
    if (c.enabled) checkPermission();
  }, []);

  // Check notification permission
  const checkPermission = useCallback(() => {
    if (typeof window === "undefined") return "denied";
    if ("Notification" in window) {
      setPermissionDenied(Notification.permission === "denied");
      return Notification.permission;
    }
    return "denied";
  }, []);

  // Auto-sync: if permission was revoked, auto-unsubscribe
  useEffect(() => {
    if (!config.enabled) return;
    if (typeof window === "undefined") return;

    const perm = checkPermission();
    if (perm === "denied") {
      unsubscribe().then(() => {
        const updated = { ...config, enabled: false };
        setConfig(updated);
        setDraftEnabled(false);
        saveConfig(updated);
      });
    }
  }, []);

  // Subscribe to push
  const subscribe = async (): Promise<string | null> => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("此设备不支持推送通知");
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes("push service") || errMsg.includes("AbortError") || errMsg.includes("NetworkError")) {
          throw new Error("无法连接推送服务。可能是网络限制（Chrome 需要访问 Google 服务）。建议使用 iOS/macOS Safari 或开启代理后重试。");
        }
        throw err;
      }
    }

    const deviceId = localStorage.getItem("daily-why-device-id") || crypto.randomUUID();
    localStorage.setItem("daily-why-device-id", deviceId);

    const deviceInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform || "unknown",
      language: navigator.language || "unknown",
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      standalone: isStandaloneMode(),
    };

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription,
        deviceId,
        deviceInfo,
      }),
    });

    if (!res.ok) throw new Error("订阅保存失败");
    return deviceId;
  };

  // Unsubscribe from push
  const unsubscribe = async () => {
    const deviceId = localStorage.getItem("daily-why-device-id");
    if (!deviceId) return;
    try {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
    } catch {}
  };

  // Handle save
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (draftEnabled) {
        let perm = Notification.permission;
        if (perm === "default") {
          perm = await Notification.requestPermission();
        }

        if (perm !== "granted") {
          setPermissionDenied(true);
          return;
        }

        setPermissionDenied(false);
        await subscribe();
      } else {
        await unsubscribe();
      }

      const updated: ReminderConfig = { enabled: draftEnabled };
      setConfig(updated);
      saveConfig(updated);
      setSaveError(null);
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "操作失败，请重试";
      setSaveError(msg);
      setDraftEnabled(false);
      console.error("Reminder save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel (revert draft)
  const handleCancel = () => {
    setDraftEnabled(config.enabled);
    setDebugMode(false);
    setOpen(false);
  };

  // Open settings (normal)
  const handleOpen = () => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    setDraftEnabled(config.enabled);
    setDebugMode(false);
    checkPermission();
    setOpen(true);
  };

  // Open settings (debug)
  const handleOpenDebug = () => {
    setDraftEnabled(config.enabled);
    setDebugMode(true);
    checkPermission();
    setOpen(true);
  };

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleCancel();
  };

  // ---- Long-press to enter debug mode ----
  const handleIconTouchStart = () => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      if (navigator.vibrate) navigator.vibrate(50);
      handleOpenDebug();
    }, 1500);
  };

  const handleIconTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Debug toggle (toggle + save immediately)
  const handleDebugToggle = async () => {
    const newValue = !config.enabled;
    setDraftEnabled(newValue);

    if (!newValue) {
      setSaving(true);
      try {
        await unsubscribe();
        const updated = { enabled: false };
        setConfig(updated);
        saveConfig(updated);
      } catch (err) {
        console.error("Unsubscribe failed:", err);
      } finally {
        setSaving(false);
      }
    } else {
      setSaving(true);
      try {
        let perm = Notification.permission;
        if (perm === "default") {
          perm = await Notification.requestPermission();
        }
        if (perm === "granted") {
          await subscribe();
          const updated = { enabled: true };
          setConfig(updated);
          saveConfig(updated);
        } else {
          setPermissionDenied(true);
        }
      } catch (err) {
        console.error("Subscribe failed:", err);
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <>
      {/* Entry button — always visible (long-press for debug) */}
      <button
        onClick={handleOpen}
        onTouchStart={handleIconTouchStart}
        onTouchEnd={handleIconTouchEnd}
        onMouseDown={handleIconTouchStart}
        onMouseUp={handleIconTouchEnd}
        onMouseLeave={handleIconTouchEnd}
        onContextMenu={handleContextMenu}
        className="relative p-2 -mr-1 rounded-full hover:bg-gray-100 transition-colors duration-200 select-none"
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
        aria-label="设置每日提醒"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={config.enabled ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={2}
          className={`w-5 h-5 ${
            config.enabled ? "text-brand-500" : "text-gray-400"
          }`}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {!config.enabled && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white" />
        )}
      </button>

      {/* Modal overlay */}
      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fadeIn"
            onClick={handleBackdropClick}
          >
            <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto animate-slideUpPrompt overscroll-contain">
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white z-10 rounded-t-3xl">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>

              {/* Title */}
              <div className="px-6 pb-4">
                <h2 className="text-xl font-semibold text-gray-900 text-center">
                  {debugMode ? "调试模式" : "每日提醒设置"}
                </h2>
                {debugMode && (
                  <p className="text-xs text-orange-500 text-center mt-1">
                    长按时钟图标 1.5 秒可进入调试
                  </p>
                )}
              </div>

              {/* ---- Normal settings content ---- */}
              {!debugMode && (
                <div className="px-6 pb-6">
                  {!standalone && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4">
                      <p className="text-xs text-blue-700 leading-relaxed">
                        提醒功能仅在将网站添加到主屏幕后可用。请先安装 PWA 应用。
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-2 mb-6">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      className="w-5 h-5 text-brand-500"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-sm text-gray-500">每天 10:30 推送提醒</span>
                  </div>

                  <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 mb-4">
                    <div>
                      <span className="text-sm text-gray-700 font-medium">开启提醒</span>
                      <p className="text-xs text-gray-400 mt-0.5">
                        每天上午 10:30 收到推送通知
                      </p>
                    </div>
                    <button
                      onClick={() => setDraftEnabled(!draftEnabled)}
                      disabled={!standalone}
                      className={`relative w-12 h-7 rounded-full transition-colors duration-300 flex-shrink-0 ${
                        draftEnabled ? "bg-brand-500" : "bg-gray-300"
                      } ${!standalone ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-300 ${
                          draftEnabled ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>

                  {permissionDenied && draftEnabled && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                      <div className="flex items-start gap-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm text-amber-800 font-medium mb-2">
                            通知权限已被关闭
                          </p>
                          <p className="text-xs text-amber-700 leading-relaxed mb-2">
                            请在系统设置中开启通知权限，否则提醒无法送达。
                          </p>
                          <p className="text-xs text-amber-600 leading-relaxed">
                            iOS: 设置 → 通知 → 每日一个为什么 → 允许通知
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {saveError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                      <p className="text-xs text-red-700 leading-relaxed">{saveError}</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleCancel}
                      className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !standalone}
                      className="flex-1 py-3 rounded-xl bg-brand-500 text-sm font-medium text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
                    >
                      {saving ? "保存中..." : "保存"}
                    </button>
                  </div>
                </div>
              )}

              {/* ---- Debug mode content ---- */}
              {debugMode && (
                <DebugPanel
                  config={config}
                  saving={saving}
                  onToggle={handleDebugToggle}
                  onClose={handleCancel}
                />
              )}

              {/* Safe area padding for iPhone */}
              <div className="h-[env(safe-area-inset-bottom,20px)]" />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
