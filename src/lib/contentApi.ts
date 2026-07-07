import { getToday } from "./dates";

export function buildDatesRequestUrl(forceRefresh = false): string {
  const params = new URLSearchParams({
    _t: getToday(),
  });

  if (forceRefresh) {
    params.set("_refresh", "1");
  }

  return `/api/content?${params.toString()}`;
}

export function buildContentRequestUrl(date: string, forceRefresh = false): string {
  const params = new URLSearchParams({
    date,
  });

  if (forceRefresh) {
    params.set("_refresh", "1");
  }

  return `/api/content?${params.toString()}`;
}
