import { formatNeuronCount } from "./generationMeta";

export const DAILY_NEURON_LIMIT = 10_000;
export const CLOUDFLARE_GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";

export function getUtcDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function utcDayRange(date = getUtcDate()): { start: string; end: string } {
  const startDate = new Date(`${date}T00:00:00.000Z`);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  return {
    start: startDate.toISOString().replace(".000Z", "Z"),
    end: endDate.toISOString().replace(".000Z", "Z"),
  };
}

export function formatDailyNeuronLine(used: number, limit = DAILY_NEURON_LIMIT): string {
  const safe = Math.max(0, used);
  const display = safe >= 1000 ? safe : Math.round(safe);
  return `今天使用的神经元：${formatNeuronCount(display)}/${formatNeuronCount(limit)}`;
}

export function dailyNeuronPercent(used: number, limit = DAILY_NEURON_LIMIT): number {
  return Math.min(100, Math.max(0, Math.round((Math.max(0, used) / limit) * 100)));
}

export const AI_INFERENCE_USAGE_QUERY = `query WorkerAiDailyNeurons($accountTag: string, $start: Time, $end: Time) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      aiInferenceAdaptiveGroups(
        limit: 1
        filter: { datetime_geq: $start, datetime_lt: $end }
      ) {
        count
        sum { totalNeurons }
      }
    }
  }
}`;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function parseAiInferenceNeurons(payload: unknown): { neurons: number; calls: number } {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const viewer = asRecord(data?.viewer);
  const accounts = Array.isArray(viewer?.accounts) ? viewer.accounts : [];
  const firstAccount = asRecord(accounts[0]);
  const groups = Array.isArray(firstAccount?.aiInferenceAdaptiveGroups)
    ? firstAccount.aiInferenceAdaptiveGroups
    : [];
  const firstGroup = asRecord(groups[0]);
  const sum = asRecord(firstGroup?.sum);
  const neurons = Number(sum?.totalNeurons ?? 0);
  const calls = Number(firstGroup?.count ?? 0);
  return {
    neurons: Number.isFinite(neurons) ? neurons : 0,
    calls: Number.isFinite(calls) ? calls : 0,
  };
}

export async function fetchOfficialDailyNeurons(options: {
  accountId: string;
  apiToken: string;
  date?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ date: string; neurons: number; calls: number }> {
  const date = options.date ?? getUtcDate();
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(CLOUDFLARE_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: AI_INFERENCE_USAGE_QUERY,
      variables: {
        accountTag: options.accountId,
        ...utcDayRange(date),
      },
    }),
  });

  const payload = await response.json();
  const root = asRecord(payload);
  const errors = Array.isArray(root?.errors) ? root.errors : [];
  if (!response.ok || errors.length > 0) {
    const message = errors
      .map((error) => asRecord(error)?.message)
      .filter(Boolean)
      .join("; ") || `GraphQL HTTP ${response.status}`;
    throw new Error(message);
  }

  return { date, ...parseAiInferenceNeurons(payload) };
}
