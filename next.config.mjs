/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@opennextjs/cloudflare"],
  outputFileTracingRoot: new URL('.', import.meta.url).pathname.replace(/\/$/, ''),
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
