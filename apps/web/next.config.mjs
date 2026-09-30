/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: no output:'standalone' — it needs symlinks (EPERM on Windows, flaky
  // on CI) and we serve via `next start` on Render anyway.
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'http', hostname: 'localhost' }, { protocol: 'https', hostname: '**' }],
  },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
