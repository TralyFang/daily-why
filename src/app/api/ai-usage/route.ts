import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  DAILY_NEURON_LIMIT,
  dailyNeuronPercent,
  fetchOfficialDailyNeurons,
  formatDailyNeuronLine,
  getUtcDate,
} from "@/lib/aiUsage";

export const dynamic = "force-dynamic";

function usagePayload(date: string, neurons: number, calls = 0) {
  return {
    date,
    neurons,
    limit: DAILY_NEURON_LIMIT,
    calls,
    line: formatDailyNeuronLine(neurons),
    percent: dailyNeuronPercent(neurons),
    source: "cloudflare-graphql" as const,
  };
}

async function readCloudflareCredentials() {
  let accountId: string | undefined;
  let apiToken: string | undefined;
  try {
    const ctx = await getCloudflareContext({ async: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = ctx.env as any;
    accountId = env.CLOUDFLARE_ACCOUNT_ID;
    apiToken = env.CLOUDFLARE_API_TOKEN;
  } catch {
    // 本地 next dev 没有 Worker 绑定，走 process.env
  }
  return {
    accountId: accountId || process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: apiToken || process.env.CLOUDFLARE_API_TOKEN,
  };
}

export async function GET() {
  const date = getUtcDate();

  try {
    const { accountId, apiToken } = await readCloudflareCredentials();
    if (!accountId || !apiToken) {
      return NextResponse.json(usagePayload(date, 0));
    }

    const usage = await fetchOfficialDailyNeurons({
      accountId,
      apiToken,
      date,
    });

    return NextResponse.json(usagePayload(usage.date, usage.neurons, usage.calls));
  } catch {
    return NextResponse.json(usagePayload(date, 0));
  }
}
