/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@opennextjs/cloudflare"],
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
