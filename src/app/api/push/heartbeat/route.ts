import { NextResponse } from "next/server";

async function getKV() {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext({ async: true });
  return ctx.env.CONTENT_KV;
}

export async function POST(request: Request) {
  try {
    const { deviceId } = await request.json();
    if (!deviceId) {
      return NextResponse.json({ error: "缺少 deviceId" }, { status: 400 });
    }

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    try {
      const kv = await getKV();
      const key = `push:sub:${deviceId}`;
      const raw = await kv.get(key, { type: "json" });

      if (raw && typeof raw === "object") {
        const record = raw as Record<string, unknown>;
        record.lastVisitedDate = todayStr;
        await kv.put(key, JSON.stringify(record));
      }
    } catch {
      // KV not available (local dev)
      console.log("[push/heartbeat] KV not available");
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[push/heartbeat] Error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
