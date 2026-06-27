import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The update-detector polls /version.json to compare the deployed
        // commit against the running bundle, so it must never be served stale.
        // Defeat HTTP/CDN caching here (the client also sends cache:'no-store'
        // + a ?ts= cache-bust as belt-and-suspenders).
        source: '/version.json',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
