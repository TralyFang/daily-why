"use client";

interface DateInfo {
  date: string;
  label: string;
  weekday: string;
}

interface DateTabsProps {
  dates: DateInfo[];
  selectedDate: string;
  onSelect: (date: string) => void;
}

export default function DateTabs({ dates, selectedDate, onSelect }: DateTabsProps) {
  if (dates.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide">
      {dates.map(({ date, label, weekday }) => (
        <button
          key={date}
          onClick={() => onSelect(date)}
          className={`date-tab flex flex-col items-center gap-0.5 min-w-[64px] ${
            date === selectedDate ? "date-tab-active" : "date-tab-inactive"
          }`}
          aria-pressed={date === selectedDate}
        >
          <span className="text-sm">{label}</span>
          <span className={`text-xs ${
            date === selectedDate ? "opacity-80" : "text-gray-400"
          }`}>
            {weekday}
          </span>
        </button>
      ))}
    </div>
  );
}
