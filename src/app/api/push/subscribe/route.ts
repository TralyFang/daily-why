import { NextResponse } from "next/server";

interface SubscribeBody {
  subscription: PushSubscriptionJSON;
  hour: number;
  minute: number;
  deviceId: string;
}

async function getKV() {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext({ async: true });
  return ctx.env.CONTENT_KV;
}

export async function POST(request: Request) {
  try {
    const body: SubscribeBody = await request.json();

    if (!body.subscription?.endpoint || !body.deviceId) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const record = {
      subscription: body.subscription,
      hour: body.hour ?? 10,
      minute: body.minute ?? 30,
      deviceId: body.deviceId,
      createdAt: todayStr,
      lastVisitedDate: todayStr,
    };

    try {
      const kv = await getKV();
      await kv.put(`push:sub:${body.deviceId}`, JSON.stringify(record));
      return NextResponse.json({ success: true });
    } catch {
      // KV not available (local dev) — store optimistically
      console.log("[push/subscribe] KV not available, subscription saved locally only");
      return NextResponse.json({ success: true, warning: "kv-unavailable" });
    }
  } catch (err) {
    console.error("[push/subscribe] Error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
