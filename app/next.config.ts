import type { NextConfig } from 'next';

// Colleagues on the office network open the app at http://<laptop-ip>:3000.
// In dev mode Next.js blocks other origins unless they are listed here (comma-separated in LAN_HOSTS).
const lanHosts = (process.env.LAN_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: ['host.docker.internal', ...lanHosts],
  experimental: {
    serverActions: {
      // Excel import and JSON restore go through server actions (limit enforced in code: 5–20 MB)
      bodySizeLimit: '21mb',
    },
  },
  poweredByHeader: false,
};

export default nextConfig;
