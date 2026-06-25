/**
 * Cloudflare Cron Worker — daily push reminder trigger.
 *
 * Runs at 10:30 and 10:45 Beijing time (UTC+8) via crons trigger.
 * Calls the main daily-why worker's /api/push/send via service binding.
 *
 * The /api/push/send endpoint has its own time-window check (±15 min around 10:30)
 * and idempotency guard (push:sent:YYYY-MM-DD), so duplicate triggers are safe.
 */
export default {
  async scheduled(event, env, ctx) {
    try {
      const response = await env.MAIN_APP.fetch(
        new Request("https://internal/api/push/send")
      );
      const result = await response.json();
      console.log(
        `[cron-push] ${new Date().toISOString()} → status=${result.status}, ${result.message}`
      );
    } catch (e) {
      console.error(`[cron-push] ${new Date().toISOString()} → ERROR: ${e.message}`);
    }
  },
};
