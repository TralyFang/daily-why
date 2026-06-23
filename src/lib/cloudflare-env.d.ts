import type { KVNamespace } from "@cloudflare/workers-types";

// Extend CloudflareEnv to include our CONTENT_KV binding
declare global {
  interface CloudflareEnv {
    CONTENT_KV: KVNamespace;
  }
}

export {};
