export interface DatesListCacheData {
  availableDates: string[];
  today: string | null;
}

const DATES_LIST_CACHE_KEY = "daily-why-dates-list";

function isValidDatesListCacheData(value: unknown): value is DatesListCacheData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DatesListCacheData>;
  if (!Array.isArray(candidate.availableDates)) return false;
  if (candidate.today !== null && typeof candidate.today !== "string") return false;
  return candidate.availableDates.every((date) => typeof date === "string");
}

export function readDatesListCache(): DatesListCacheData | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(DATES_LIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidDatesListCacheData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDatesListCache(data: DatesListCacheData): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(DATES_LIST_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore cache write errors
  }
}

export function clearDatesListCache(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(DATES_LIST_CACHE_KEY);
  } catch {
    // Ignore cache clear errors
  }
}
