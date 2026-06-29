/**
 * Cloudflare Cron Worker — Daily content generation trigger.
 *
 * Runs at 00:05 Beijing time (UTC 16:05 previous day) via cron trigger.
 * Calls the main daily-why worker's /api/content/generate via service binding.
 *
 * All content generation logic lives in the main worker — this is just a trigger.
 *
 * Bindings:
 *   - MAIN_APP: Service binding to the main daily-why worker
 */
export default {
  async scheduled(event, env, ctx) {
    try {
      const response = await env.MAIN_APP.fetch(
        new Request("https://internal/api/content/generate")
      );
      const result = await response.json();
      console.log(
        `[cron-content] ${new Date().toISOString()} → status=${result.status}, today=${result.today || "N/A"}`
      );
      if (result.status === "ok") {
        const count = result.results?.length || 0;
        console.log(`[cron-content] ✅ Generated ${count} articles`);
      } else if (result.status === "skipped") {
        console.log(`[cron-content] ⏭️ ${result.message}`);
      } else {
        console.error(`[cron-content] ❌ Unexpected response:`, JSON.stringify(result));
      }
    } catch (e) {
      console.error(`[cron-content] ${new Date().toISOString()} → ERROR: ${e.message}`);
    }
  },

  // Support manual trigger via HTTP for testing
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/generate") {
      try {
        const response = await env.MAIN_APP.fetch(
          new Request("https://internal/api/content/generate?force=1")
        );
        const result = await response.json();
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ status: "error", message: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname === "/status") {
      try {
        const response = await env.MAIN_APP.fetch(
          new Request("https://internal/api/content")
        );
        const result = await response.json();
        return new Response(JSON.stringify({
          today: result.today,
          availableDates: result.availableDates,
        }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ status: "error", message: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response("daily-why-cron-content trigger worker", { status: 200 });
  },
};
