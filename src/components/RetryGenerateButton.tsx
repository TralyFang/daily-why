"use client";

interface RetryGenerateButtonProps {
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}

export default function RetryGenerateButton({
  disabled = false,
  onClick,
}: RetryGenerateButtonProps) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      className="mt-4 inline-flex items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {disabled ? "重新生成中..." : "重试生成内容"}
    </button>
  );
}
