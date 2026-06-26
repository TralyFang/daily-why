"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";

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
    // iOS Safari standalone
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// ---- component ----

export default function ReminderSettings() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ReminderConfig>({ enabled: false });
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Debug state
  const [debugMode, setDebugMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [debugLoading, setDebugLoading] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  // Load config on mount
  useEffect(() => {
    setMounted(true);
    const c = loadConfig();
    setConfig(c);
    setDraftEnabled(c.enabled);
    setStandalone(isStandaloneMode());
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
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const deviceId = localStorage.getItem("daily-why-device-id") || crypto.randomUUID();
    localStorage.setItem("daily-why-device-id", deviceId);

    // Collect device info for identification
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
    try {
      if (draftEnabled) {
        // Request notification permission
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
      setOpen(false);
    } catch (err) {
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

  // ---- Debug: long-press to enter debug mode ----
  const handleIconTouchStart = () => {
    // Note: don't call preventDefault() here — it would block the subsequent click event on mobile
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      // Haptic feedback if available
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
    e.preventDefault(); // Prevent context menu on long-press (mobile)
  };

  // ---- Debug actions ----
  const debugFetchInfo = async () => {
    setDebugLoading(true);
    const deviceId = localStorage.getItem("daily-why-device-id") || "(未设置)";
    const perm = "Notification" in window ? Notification.permission : "unsupported";
    const isPWA = isStandaloneMode();
    let swStatus = "未检查";
    let pushStatus = "未检查";
    let endpoint = "";

    try {
      if ("serviceWorker" in navigator) {
        const swReg = await navigator.serviceWorker.getRegistration();
        swStatus = swReg ? "已注册" : "未注册";
        if (swReg) {
          const pushSub = await swReg.pushManager.getSubscription();
          pushStatus = pushSub ? "已订阅" : "未订阅";
          if (pushSub) {
            endpoint = pushSub.endpoint.substring(0, 80) + "...";
          }
        }
      } else {
        swStatus = "不支持";
      }
    } catch (err) {
      swStatus = `检查失败: ${err}`;
    }

    const info = [
      `=== 调试信息 ===`,
      `Device ID: ${deviceId}`,
      `通知权限: ${perm}`,
      `PWA Standalone: ${isPWA}`,
      `Service Worker: ${swStatus}`,
      `Push 订阅: ${pushStatus}`,
      endpoint ? `Endpoint: ${endpoint}` : "",
      `提醒已开启: ${config.enabled}`,
      `localStorage: ${localStorage.getItem(STORAGE_KEY) || "(空)"}`,
      `当前时间: ${new Date().toLocaleString("zh-CN")}`,
    ]
      .filter(Boolean)
      .join("\n");

    setDebugInfo(info);
    setDebugLoading(false);
  };

  const debugTriggerPush = async () => {
    setDebugLoading(true);
    try {
      const res = await fetch("/api/push/send?debug=1");
      const data = await res.json();
      setDebugInfo(
        `${debugInfo}\n\n=== 推送测试结果 ===\n${JSON.stringify(data, null, 2)}`
      );
    } catch (err) {
      setDebugInfo(`${debugInfo}\n\n=== 推送测试失败 ===\n${String(err)}`);
    }
    setDebugLoading(false);
  };

  const debugHeartbeat = async () => {
    setDebugLoading(true);
    const deviceId = localStorage.getItem("daily-why-device-id");
    if (!deviceId) {
      setDebugInfo(`${debugInfo}\n\n=== Heartbeat 失败 ===\n无 deviceId`);
      setDebugLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/push/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      const data = await res.json();
      setDebugInfo(
        `${debugInfo}\n\n=== Heartbeat 结果 ===\n${JSON.stringify(data, null, 2)}`
      );
    } catch (err) {
      setDebugInfo(`${debugInfo}\n\n=== Heartbeat 失败 ===\n${String(err)}`);
    }
    setDebugLoading(false);
  };

  const debugClearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("daily-why-device-id");
    setConfig({ enabled: false });
    setDraftEnabled(false);
    setDebugInfo(
      `${debugInfo}\n\n=== 已清除 ===\nlocalStorage 已清空，请重新开启提醒`
    );
  };

  // Debug toggle (toggle + save immediately)
  const handleDebugToggle = async () => {
    const newValue = !config.enabled;
    setDraftEnabled(newValue);

    if (!newValue) {
      // Turning off
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
      // Turning on
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
        {/* Dot indicator when not configured */}
        {!config.enabled && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white" />
        )}
      </button>

      {/* Modal overlay — rendered to body via portal to escape header stacking context */}
      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fadeIn"
            onClick={handleBackdropClick}
          >
            <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto animate-slideUpPrompt overscroll-contain">
              {/* Handle bar — sticky at top while scrolling */}
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
                  {/* Non-PWA warning */}
                  {!standalone && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4">
                      <p className="text-xs text-blue-700 leading-relaxed">
                        提醒功能仅在将网站添加到主屏幕后可用。请先安装 PWA 应用。
                      </p>
                    </div>
                  )}

                  {/* Info */}
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

                  {/* Toggle switch */}
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

                  {/* Permission denied warning */}
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

                  {/* Buttons */}
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
                <div className="px-6 pb-6">
                  {/* Debug actions */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      onClick={debugFetchInfo}
                      disabled={debugLoading}
                      className="py-3 rounded-xl bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                      {debugLoading ? "加载中..." : "查看状态"}
                    </button>
                    <button
                      onClick={debugTriggerPush}
                      disabled={debugLoading}
                      className="py-3 rounded-xl bg-brand-500 text-sm font-medium text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
                    >
                      立即推送
                    </button>
                    <button
                      onClick={debugHeartbeat}
                      disabled={debugLoading}
                      className="py-3 rounded-xl bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                      发送心跳
                    </button>
                    <button
                      onClick={debugClearAll}
                      disabled={debugLoading}
                      className="py-3 rounded-xl bg-red-50 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      清除数据
                    </button>
                  </div>

                  {/* Debug output */}
                  {debugInfo && (
                    <pre className="bg-gray-900 text-green-400 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                      {debugInfo}
                    </pre>
                  )}

                  {/* Quick toggle in debug mode */}
                  <div className="mt-4 flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                    <div>
                      <span className="text-sm text-gray-700 font-medium">开启提醒</span>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {saving ? "处理中..." : config.enabled ? "已开启" : "已关闭"}
                      </p>
                    </div>
                    <button
                      onClick={handleDebugToggle}
                      disabled={saving}
                      className={`relative w-12 h-7 rounded-full transition-colors duration-300 ${
                        config.enabled ? "bg-brand-500" : "bg-gray-300"
                      } disabled:opacity-50`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-300 ${
                          config.enabled ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </div>

                  {/* Close button */}
                  <button
                    onClick={handleCancel}
                    className="w-full mt-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    关闭
                  </button>
                </div>
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
