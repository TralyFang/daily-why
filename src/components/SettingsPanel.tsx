"use client";

interface SettingsPanelProps {
  showSettings: boolean;
  clearingCache: boolean;
  handleClearCache: () => void;
  onClose: () => void;
}

export default function SettingsPanel({
  showSettings,
  clearingCache,
  handleClearCache,
  onClose,
}: SettingsPanelProps) {
  if (!showSettings) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl animate-slideUpPrompt overscroll-contain">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Title */}
        <div className="px-6 pb-4">
          <h2 className="text-xl font-semibold text-gray-900 text-center">设置</h2>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {/* Clear cache */}
          <div className="bg-gray-50 rounded-xl px-4 py-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-700 font-medium">清除缓存</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  清除所有本地缓存数据并重新加载
                </p>
              </div>
              <button
                onClick={handleClearCache}
                disabled={clearingCache}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                {clearingCache ? (
                  <div className="w-4 h-4 rounded-full border-2 border-red-300 border-t-red-600 animate-spin" />
                ) : (
                  "清除"
                )}
              </button>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            关闭
          </button>
        </div>

        {/* Safe area padding for iPhone */}
        <div className="h-[env(safe-area-inset-bottom,20px)]" />
      </div>
    </div>
  );
}
