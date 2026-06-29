"use client";

import { useState } from "react";

interface DebugPanelProps {
  config: { enabled: boolean };
  saving: boolean;
  onToggle: () => Promise<void>;
  onClose: () => void;
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** 获取近3天日期列表 */
function getRecentDates(): { date: string; label: string }[] {
  const dates: { date: string; label: string }[] = [];
  const labels = ["今天", "昨天", "前天"];
  for (let i = 0; i < 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dates.push({ date: dateStr, label: labels[i] });
  }
  return dates;
}

export default function DebugPanel({ config, saving, onToggle, onClose }: DebugPanelProps) {
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugGenDate, setDebugGenDate] = useState<string>("");
  const STORAGE_KEY = "daily-why-reminder";

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

  const debugGenerateContent = async () => {
    setDebugLoading(true);
    const targetDate = debugGenDate || "";
    const dateParam = targetDate ? `&date=${targetDate}` : "";
    const displayDate = targetDate || "今天";
    const todayStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const isToday = !targetDate || targetDate === todayStr;
    const articleDesc = isToday ? "4 篇文章（1主+3extra）" : "1 篇主内容";
    try {
      setDebugInfo(`${debugInfo}\n\n=== 生成内容中... ===\n目标日期: ${displayDate}\n正在调用 AI 生成 ${articleDesc}，请耐心等待（约 ${isToday ? "30-60" : "10-20"} 秒）...`);
      const res = await fetch(`/api/content/generate?force=1${dateParam}`);
      const data = await res.json();
      if (data.status === "ok") {
        const summary = data.results.map((r: { key: string; status: string; length: number; preview: string }) =>
          `  ${r.key}: ${r.status} (${r.length}字) ${r.preview.substring(0, 40)}...`
        ).join("\n");
        setDebugInfo(
          `${debugInfo}\n\n=== ✅ 内容生成成功 ===\n日期: ${data.today}\n主题: ${data.topics.join(", ")}\n结果:\n${summary}\n\n刷新页面即可看到新内容`
        );
      } else {
        setDebugInfo(
          `${debugInfo}\n\n=== ❌ 生成失败 ===\n${JSON.stringify(data, null, 2)}`
        );
      }
    } catch (err) {
      setDebugInfo(`${debugInfo}\n\n=== ❌ 生成失败 ===\n${String(err)}`);
    }
    setDebugLoading(false);
  };

  const debugClearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("daily-why-device-id");
    setDebugInfo(
      `${debugInfo}\n\n=== 已清除 ===\nlocalStorage 已清空，请重新开启提醒`
    );
  };

  return (
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
          onClick={() => {
            window.dispatchEvent(new CustomEvent("debug-simulate-update"));
            onClose();
          }}
          className="py-3 rounded-xl bg-purple-50 text-sm font-medium text-purple-600 hover:bg-purple-100 transition-colors"
        >
          模拟更新
        </button>
        <button
          onClick={debugClearAll}
          disabled={debugLoading}
          className="py-3 rounded-xl bg-red-50 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 col-span-2"
        >
          清除数据
        </button>
      </div>

      {/* AI 内容生成区 — 支持选择近3天日期 */}
      <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4">
        <p className="text-sm font-medium text-green-800 mb-2">🤖 AI 生成内容</p>
        <div className="flex gap-2 mb-3">
          {getRecentDates().map(({ date, label }) => (
            <button
              key={date}
              onClick={() => setDebugGenDate(date)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                debugGenDate === date
                  ? "bg-green-600 text-white"
                  : "bg-white text-green-700 border border-green-300 hover:bg-green-100"
              }`}
            >
              {label}
              <br />
              <span className="text-[10px] opacity-70">{date.slice(5)}</span>
            </button>
          ))}
        </div>
        <button
          onClick={debugGenerateContent}
          disabled={debugLoading || !debugGenDate}
          className="w-full py-3 rounded-xl bg-green-600 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {debugLoading ? "AI 生成中..." : `生成 ${debugGenDate ? debugGenDate : "请先选择日期"} 的内容`}
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
          onClick={onToggle}
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
        onClick={onClose}
        className="w-full mt-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        关闭
      </button>
    </div>
  );
}
