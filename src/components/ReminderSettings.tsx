"use client";

import { useState, useEffect, useCallback } from "react";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";

// ---- types ----

interface ReminderConfig {
  enabled: boolean;
  hour: number;
  minute: number;
}

const STORAGE_KEY = "daily-why-reminder";

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadConfig(): ReminderConfig {
  if (typeof window === "undefined") return { enabled: false, hour: 10, minute: 30 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: false, hour: 10, minute: 30 };
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

// ---- helpers for UI labels ----

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function getNextReminderLabel(hour: number, minute: number): string {
  return `下次提醒：明天 ${pad(hour)}:${pad(minute)}`;
}

// ---- component ----

export default function ReminderSettings() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ReminderConfig>({ enabled: false, hour: 10, minute: 30 });
  const [draftHour, setDraftHour] = useState(10);
  const [draftMinute, setDraftMinute] = useState(30);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Load config on mount
  useEffect(() => {
    const c = loadConfig();
    setConfig(c);
    setDraftHour(c.hour);
    setDraftMinute(c.minute);
    setDraftEnabled(c.enabled);
    if (c.enabled) checkPermission();
  }, []);

  // Check notification permission
  const checkPermission = useCallback(() => {
    if (typeof window === "undefined") return;
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

    // Re-check on every open
    const perm = checkPermission();
    if (perm === "denied") {
      // Permission denied → auto unsubscribe
      unsubscribe().then(() => {
        const updated = { ...config, enabled: false };
        setConfig(updated);
        setDraftEnabled(false);
        saveConfig(updated);
      });
    }
  }, []); // only run once on mount

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

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription,
        hour: draftHour,
        minute: draftMinute,
        deviceId,
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
          return; // Don't close, let user see the guidance
        }

        setPermissionDenied(false);
        await subscribe();
      } else {
        await unsubscribe();
      }

      const updated: ReminderConfig = {
        enabled: draftEnabled,
        hour: draftHour,
        minute: draftMinute,
      };
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
    setDraftHour(config.hour);
    setDraftMinute(config.minute);
    setDraftEnabled(config.enabled);
    setOpen(false);
  };

  // Open settings
  const handleOpen = () => {
    setDraftHour(config.hour);
    setDraftMinute(config.minute);
    setDraftEnabled(config.enabled);
    checkPermission();
    setOpen(true);
  };

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleCancel();
  };

  // Helper: minute selector
  const renderMinuteSelector = () => (
    <div className="flex gap-2 justify-center">
      {MINUTES.map((m) => (
        <button
          key={m}
          onClick={() => setDraftMinute(m)}
          className={`w-14 h-10 rounded-lg text-sm font-medium transition-all duration-200 ${
            draftMinute === m
              ? "bg-brand-500 text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {pad(m)}
        </button>
      ))}
    </div>
  );

  return (
    <>
      {/* Entry button — only visible in PWA standalone mode */}
      {typeof window !== "undefined" &&
        window.matchMedia("(display-mode: standalone)").matches && (
          <button
            onClick={handleOpen}
            className="relative p-2 -mr-1 rounded-full hover:bg-gray-100 transition-colors duration-200"
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
        )}

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fadeIn"
          onClick={handleBackdropClick}
        >
          <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl overflow-hidden animate-slideUpPrompt">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Title */}
            <div className="px-6 pb-4">
              <h2 className="text-xl font-semibold text-gray-900 text-center">
                每日提醒设置
              </h2>
            </div>

            {/* Time picker */}
            <div className="px-6 pb-6">
              <div className="flex items-center justify-center gap-3 mb-4">
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
                <span className="text-sm text-gray-500">提醒时间</span>
              </div>

              {/* Hour selector */}
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="text-xs text-gray-400 w-6 text-right">时</span>
                <div className="grid grid-cols-6 gap-1.5 flex-1 max-w-xs">
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      onClick={() => setDraftHour(h)}
                      className={`py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        draftHour === h
                          ? "bg-brand-500 text-white shadow-sm"
                          : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {pad(h)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minute selector */}
              <div className="flex items-center justify-center gap-2 mb-6">
                <span className="text-xs text-gray-400 w-6 text-right">分</span>
                {renderMinuteSelector()}
                <span className="w-6" />
              </div>

              {/* Toggle switch */}
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 mb-4">
                <span className="text-sm text-gray-700 font-medium">开启提醒</span>
                <button
                  onClick={() => setDraftEnabled(!draftEnabled)}
                  className={`relative w-12 h-7 rounded-full transition-colors duration-300 ${
                    draftEnabled ? "bg-brand-500" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-300 ${
                      draftEnabled ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Preview text */}
              {draftEnabled && (
                <div className="text-center text-sm text-brand-600 mb-4">
                  {getNextReminderLabel(draftHour, draftMinute)}
                </div>
              )}

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
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-brand-500 text-sm font-medium text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>

            {/* Safe area padding for iPhone */}
            <div className="h-[env(safe-area-inset-bottom,20px)]" />
          </div>
        </div>
      )}
    </>
  );
}
